#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assertPolicyWriteEnv, loadPolicyEnv } from "./policy-env.mjs";

const ROOT = process.cwd();
loadPolicyEnv(ROOT);

const DEFAULT_SOURCES_FILE = path.join(ROOT, "config", "policy-source-registry.json");
const DEFAULT_STATE_FILE = path.join(ROOT, "data", "policy-pipeline-state.json");
const INGEST_SCRIPT = path.join(ROOT, "scripts", "ingest-official-policies.mjs");
const REPAIR_SCRIPT = path.join(ROOT, "scripts", "repair-policy-sources.mjs");
const RUNS_TABLE = process.env.POLICY_BOOTH_INGEST_RUNS_TABLE || "policy_booth_ingest_runs";

const args = parseArgs(process.argv.slice(2));
const mode = stringArg(getArg("mode"), "recent");
const sourcesFile = getArg("sources") || DEFAULT_SOURCES_FILE;
const stateFile = getArg("state") || DEFAULT_STATE_FILE;
const maxRequests = positiveInt(getArg("maxRequests", "max-requests"), 560);
const resumeAfterHours = positiveFloat(getArg("resumeAfterHours", "resume-after-hours"), 5);
const perSource = positiveInt(getArg("perSource", "per-source"), mode === "backfill" ? 80 : 12);
const lookbackDays = positiveInt(getArg("lookbackDays", "lookback-days"), 14);
const status = stringArg(getArg("status"), "published");
const write = hasFlag("write");
const dryRun = !write || hasFlag("dryRun", "dry-run");
const persistState = write || hasFlag("persistState", "persist-state");
const loop = hasFlag("loop");
const force = hasFlag("force");
const resume = hasFlag("resume");
const repairSources = hasFlag("repairSources", "repair-sources");
const aiRepair = hasFlag("aiRepair", "ai-repair");
const applyRepair = hasFlag("applyRepair", "apply-repair");
const includeAllItems = hasFlag("allItems", "all-items");
const concurrency = positiveInt(getArg("concurrency"), 1);
const sourceFilter = getArg("source", "sourceId", "source-id") || "";

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

async function main() {
  if (write) {
    assertPolicyWriteEnv();
  }

  const startAt = getArg("startAt", "start-at");
  if (startAt) {
    await waitUntilStartAt(startAt);
  }

  do {
    const outcome = await runOnce();
    if (!loop || outcome.status === "completed") break;

    const resumeAt = outcome.nextResumeAt ? new Date(outcome.nextResumeAt) : addHours(new Date(), resumeAfterHours);
    const delayMs = Math.max(0, resumeAt.getTime() - Date.now());
    console.log(`Pipeline paused. Waiting until ${resumeAt.toISOString()} before resuming.`);
    await sleep(delayMs);
  } while (loop);
}

async function runOnce() {
  const state = await readState();
  const now = new Date();

  if (resume && !force && state.status === "paused" && state.nextResumeAt) {
    const nextResumeAt = new Date(state.nextResumeAt);
    if (nextResumeAt > now) {
      console.log(`Existing run is paused until ${nextResumeAt.toISOString()}. Use --force to override.`);
      return { status: "paused", nextResumeAt: nextResumeAt.toISOString() };
    }
  }

  const sources = await loadActiveSources();
  if (sources.length === 0) {
    throw new Error(`No enabled sources with feedUrl found in ${sourcesFile}`);
  }

  const run = resumeOrCreateRun(state, sources);
  await writeState(run);
  await persistRunSnapshot(run);

  console.log(`Policy pipeline ${run.runId} started in ${mode} mode.`);
  console.log(`Sources: ${sources.length}; per source: ${perSource}; request budget: ${maxRequests}; write: ${write}; status: ${status}.`);

  for (let index = run.sourceIndex; index < sources.length; index += 1) {
    const source = sources[index];
    const remainingRequests = maxRequests - run.requestUsed;

    if (remainingRequests <= 0) {
      return pauseRun(run, source, "request_budget_reached");
    }

    run.status = "running";
    run.sourceIndex = index;
    run.sourceId = source.id;
    run.updatedAt = new Date().toISOString();
    await writeState(run);
    await persistRunSnapshot(run);

    if (repairSources) {
      const healthy = await verifyOrRepairSource(source);
      if (!healthy) {
        run.totals.sourcesSkipped += 1;
        run.sourceIndex = index + 1;
        run.updatedAt = new Date().toISOString();
        await writeState(run);
        await persistRunSnapshot(run);
        continue;
      }
    }

    const childArgs = buildIngestArgs(source, remainingRequests);
    console.log(`Running source ${index + 1}/${sources.length}: ${source.id}`);
    const child = await runNode(childArgs);
    const requestsUsed = parseRequestsUsed(child.output);
    const flushed = parseFlushedCount(child.output);
    const skipped = parseSkippedCount(child.output);

    run.requestUsed += requestsUsed;
    run.totals.sourcesProcessed += 1;
    run.totals.policiesUpserted += flushed;
    run.totals.itemsSkipped += skipped;
    run.lastOutputTail = child.output.slice(-4000);
    run.updatedAt = new Date().toISOString();

    if (child.code !== 0) {
      run.totals.sourcesFailed += 1;
      run.lastError = `Source ${source.id} failed with exit code ${child.code}`;
      await writeState(run);
      await persistRunSnapshot(run);
      console.warn(run.lastError);
      continue;
    }

    if (hitUsageWall(child.output) || run.requestUsed >= maxRequests) {
      return pauseRun(run, source, hitUsageWall(child.output) ? "minimax_usage_limit" : "request_budget_reached");
    }

    run.sourceIndex = index + 1;
    run.updatedAt = new Date().toISOString();
    await writeState(run);
    await persistRunSnapshot(run);
  }

  run.status = "completed";
  run.finishedAt = new Date().toISOString();
  run.nextResumeAt = null;
  run.sourceId = null;
  run.updatedAt = run.finishedAt;
  await writeState(run);
  await persistRunSnapshot(run);

  console.log(`Policy pipeline completed. Upserted ${run.totals.policiesUpserted}; MiniMax requests used ${run.requestUsed}.`);
  return { status: "completed" };
}

async function loadActiveSources() {
  const sources = JSON.parse(await fs.readFile(sourcesFile, "utf8"));
  return sources
    .filter((source) => source.enabled !== false && source.feedUrl)
    .filter((source) => {
      if (!sourceFilter) return true;
      const needle = String(sourceFilter).toLowerCase();
      return [source.id, source.name, source.regionName, source.publisher]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
}

function resumeOrCreateRun(state, sources) {
  if (resume && state.status === "paused" && state.mode === mode && !force) {
    return {
      ...state,
      status: "running",
      updatedAt: new Date().toISOString()
    };
  }

  return {
    version: 1,
    runId: createRunId(),
    mode,
    status: "running",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
    nextResumeAt: null,
    sourceIndex: 0,
    sourceId: sources[0]?.id ?? null,
    requestBudget: maxRequests,
    requestUsed: 0,
    args: {
      perSource,
      lookbackDays,
      status,
      write,
      repairSources,
      aiRepair,
      applyRepair,
      includeAllItems,
      concurrency,
      sourcesFile
    },
    totals: {
      sourcesProcessed: 0,
      sourcesSkipped: 0,
      sourcesFailed: 0,
      policiesUpserted: 0,
      itemsSkipped: 0
    },
    lastError: null,
    lastOutputTail: ""
  };
}

function buildIngestArgs(source, remainingRequests) {
  const childArgs = [
    INGEST_SCRIPT,
    "--sources",
    sourcesFile,
    "--source",
    source.id,
    "--limit",
    String(perSource),
    "--perSource",
    String(perSource),
    "--maxRequests",
    String(remainingRequests),
    "--concurrency",
    String(concurrency),
    "--skipExisting",
    "--flushEach",
    "--repairJson"
  ];

  if (write && !dryRun) {
    childArgs.push("--write", "--status", status);
  }

  if (mode === "recent") {
    childArgs.push("--since", getSinceDate());
  }

  if (includeAllItems) {
    childArgs.push("--allItems");
  }

  return childArgs;
}

async function verifyOrRepairSource(source) {
  const ok = await probeFeed(source.feedUrl);
  if (ok) return true;

  console.warn(`Source ${source.id} feed is not healthy; running repair flow.`);
  const repairArgs = [
    REPAIR_SCRIPT,
    "--sources",
    sourcesFile,
    "--source",
    source.id
  ];

  if (aiRepair) repairArgs.push("--ai");
  if (applyRepair) repairArgs.push("--apply");

  const repair = await runNode(repairArgs);
  if (repair.code !== 0) {
    console.warn(`Repair flow failed for ${source.id}.`);
    return false;
  }

  return /"status":\s*"ok"|Applied/.test(repair.output);
}

async function probeFeed(url) {
  if (!url) return false;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "de-policy-stage/0.1 source health check" }
    });
    if (!response.ok) return false;
    const text = await response.text();
    return /<(rss|feed|item|entry)\b/i.test(text);
  } catch {
    return false;
  }
}

async function pauseRun(run, source, reason) {
  const nextResumeAt = addHours(new Date(), resumeAfterHours).toISOString();
  run.status = "paused";
  run.sourceId = source?.id ?? run.sourceId;
  run.nextResumeAt = nextResumeAt;
  run.lastError = reason;
  run.updatedAt = new Date().toISOString();
  await writeState(run);
  await persistRunSnapshot(run);

  console.log(`Policy pipeline paused: ${reason}. Next resume at ${nextResumeAt}.`);
  return { status: "paused", nextResumeAt };
}

async function runNode(childArgs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, childArgs, {
      cwd: ROOT,
      env: process.env,
      shell: false
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      process.stderr.write(text);
    });
    child.on("close", (code) => resolve({ code: code ?? 0, output }));
  });
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(stateFile, "utf8"));
  } catch {
    return {};
  }
}

async function writeState(state) {
  if (!persistState) return;

  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, `${JSON.stringify(state, null, 2)}\n`);
}

async function persistRunSnapshot(run) {
  if (!persistState) return;

  const supabase = createSupabaseWriterClient();
  if (!supabase) return;

  try {
    await supabase.from(RUNS_TABLE).upsert(
      {
        run_id: run.runId,
        mode: run.mode,
        status: run.status,
        source_id: run.sourceId,
        source_index: run.sourceIndex,
        request_budget: run.requestBudget,
        request_used: run.requestUsed,
        started_at: run.startedAt,
        updated_at: run.updatedAt,
        finished_at: run.finishedAt,
        next_resume_at: run.nextResumeAt,
        last_error: run.lastError,
        checkpoint: run,
        totals: run.totals
      },
      { onConflict: "run_id" }
    );
  } catch (error) {
    console.warn(`Could not persist pipeline state to Supabase: ${error instanceof Error ? error.message : error}`);
  }
}

function createSupabaseWriterClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function waitUntilStartAt(startAt) {
  const target = getNextStartDate(startAt);
  const delayMs = target.getTime() - Date.now();
  if (delayMs <= 0) return;

  console.log(`Waiting until ${target.toISOString()} to start.`);
  await sleep(delayMs);
}

function getNextStartDate(startAt) {
  const match = String(startAt).match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    throw new Error("--startAt must use HH:mm, for example --startAt 02:30");
  }

  const target = new Date();
  target.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (target <= new Date()) {
    target.setDate(target.getDate() + 1);
  }
  return target;
}

function getSinceDate() {
  const since = getArg("since");
  if (since) return normalizeDate(since);
  const date = new Date();
  date.setDate(date.getDate() - lookbackDays);
  return date.toISOString().slice(0, 10);
}

function normalizeDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().slice(0, 10);
}

function parseRequestsUsed(output) {
  const match = output.match(/MiniMax requests used:\s*(\d+)/i);
  return match ? Number(match[1]) : 0;
}

function parseFlushedCount(output) {
  const flushed = output.match(/Flushed\s+(\d+)\s+drafts/i);
  if (flushed) return Number(flushed[1]);
  const upserted = output.match(/Upserted\s+(\d+)\s+drafts/i);
  if (upserted) return Number(upserted[1]);
  return [...output.matchAll(/^Upserted\s+.+$/gim)].length;
}

function parseSkippedCount(output) {
  return [...output.matchAll(/^Skipped\s+/gim)].length;
}

function hitUsageWall(output) {
  return /usage limit reached|5-hour usage limit|600\/600|rate_limit_error|MiniMax usage limit reached/i.test(output);
}

function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createRunId() {
  return `policy-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}`;
}

function positiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function positiveFloat(value, fallback) {
  const parsed = Number.parseFloat(value ?? "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stringArg(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function getArg(...names) {
  for (const name of names) {
    if (args[name] !== undefined) return args[name];
  }
  return undefined;
}

function hasFlag(...names) {
  return names.some((name) => Boolean(args[name]));
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      parsed[key] = true;
    } else {
      parsed[key] = next;
      index += 1;
    }
  }
  return parsed;
}
