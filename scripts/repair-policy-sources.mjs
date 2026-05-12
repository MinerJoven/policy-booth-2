#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadPolicyEnv } from "./policy-env.mjs";

const ROOT = process.cwd();
loadPolicyEnv(ROOT);

const DEFAULT_SOURCES_FILE = path.join(ROOT, "config", "policy-source-registry.json");
const DEFAULT_REPORT_FILE = path.join(ROOT, "data", "source-repair-report.json");
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/anthropic";
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.7";

const args = parseArgs(process.argv.slice(2));
const sourcesFile = getArg("sources") || DEFAULT_SOURCES_FILE;
const reportFile = getArg("output") || DEFAULT_REPORT_FILE;
const sourceFilter = getArg("source", "sourceId", "source-id") || "";
const includeDisabled = hasFlag("includeDisabled", "include-disabled");
const includeMissing = hasFlag("includeMissing", "include-missing");
const useAi = hasFlag("ai");
const apply = hasFlag("apply");

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

async function main() {
  const sources = JSON.parse(await fs.readFile(sourcesFile, "utf8"));
  const selected = sources.filter((source) => {
    if (!includeDisabled && source.enabled === false && !sourceFilter) return false;
    if (!includeMissing && !source.feedUrl && !sourceFilter) return false;
    if (!sourceFilter) return true;
    const needle = String(sourceFilter).toLowerCase();
    return [source.id, source.name, source.regionName, source.publisher]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle));
  });

  const reports = [];
  for (const source of selected) {
    const report = await inspectSource(source);
    reports.push(report);
    console.log(JSON.stringify(report, null, 2));
  }

  if (apply) {
    applyRepairs(sources, reports);
    await fs.writeFile(sourcesFile, `${JSON.stringify(sources, null, 2)}\n`);
    console.log(`Applied source repairs to ${sourcesFile}`);
  }

  await fs.mkdir(path.dirname(reportFile), { recursive: true });
  await fs.writeFile(reportFile, `${JSON.stringify({ checkedAt: new Date().toISOString(), reports }, null, 2)}\n`);
}

async function inspectSource(source) {
  const feedCheck = await probeFeed(source.feedUrl);
  if (feedCheck.ok) {
    return {
      sourceId: source.id,
      status: "ok",
      currentFeedUrl: source.feedUrl,
      itemCount: feedCheck.itemCount,
      candidates: []
    };
  }

  const candidates = [];
  candidates.push(...(await discoverCandidatesFromHomepage(source)));
  candidates.push(...fallbackCandidates(source));

  if (useAi) {
    candidates.push(...(await discoverCandidatesWithAi(source, feedCheck)));
  }

  const uniqueCandidates = uniqueByUrl(candidates);
  const checkedCandidates = [];
  for (const candidate of uniqueCandidates) {
    const check = await probeFeed(candidate.url);
    checkedCandidates.push({ ...candidate, ...check });
    if (check.ok) {
      return {
        sourceId: source.id,
        status: "repair_found",
        currentFeedUrl: source.feedUrl || "",
        suggestedFeedUrl: candidate.url,
        itemCount: check.itemCount,
        candidates: checkedCandidates
      };
    }
  }

  return {
    sourceId: source.id,
    status: "needs_manual_check",
    currentFeedUrl: source.feedUrl || "",
    error: feedCheck.error || "No valid feed candidate found.",
    candidates: checkedCandidates
  };
}

async function discoverCandidatesFromHomepage(source) {
  if (!source.homepageUrl) return [];

  try {
    const html = await fetchText(source.homepageUrl);
    const urls = [];
    const linkPattern = /<link[^>]+(?:type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["']|href=["']([^"']+)["'][^>]*type=["']application\/(?:rss|atom)\+xml["'])[^>]*>/gi;
    for (const match of html.matchAll(linkPattern)) {
      urls.push(match[1] || match[2]);
    }

    const anchorPattern = /href=["']([^"']*(?:rss|feed|atom)[^"']*)["']/gi;
    for (const match of html.matchAll(anchorPattern)) {
      urls.push(match[1]);
    }

    return urls
      .map((url) => absolutizeUrl(url, source.homepageUrl))
      .filter(Boolean)
      .map((url) => ({ url, kind: "homepage_discovery", reason: "Found on homepage." }));
  } catch {
    return [];
  }
}

function fallbackCandidates(source) {
  const base = source.homepageUrl ? new URL(source.homepageUrl).origin : "";
  if (!base) return [];

  return [
    "/feed",
    "/rss",
    "/rss.xml",
    "/atom.xml",
    "/presse/rss",
    "/presse/rss.xml",
    "/service/rss",
    "/service/rss.xml",
    "/de/service/rss",
    "/de/presse/rss"
  ].map((suffix) => ({
    url: `${base}${suffix}`,
    kind: "pattern_probe",
    reason: "Common official-site RSS/Atom path."
  }));
}

async function discoverCandidatesWithAi(source, feedCheck) {
  const apiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return [];
  }

  const prompt = [
    "你在维护一个德国官方政策信息源列表。某个 RSS/Atom feed 失效或缺失。",
    "请基于官方机构名称、主页、地区和已知链接，提出可能的官方 RSS/Atom/新闻列表地址候选。",
    "只返回 JSON，不要 Markdown。不要编造结论；如果不确定，把候选 reason 写清楚。",
    "返回格式：{\"candidates\":[{\"url\":\"https://...\",\"kind\":\"rss|atom|news-page\",\"reason\":\"...\"}]}",
    "",
    `sourceId: ${source.id}`,
    `name: ${source.name}`,
    `publisher: ${source.publisher}`,
    `regionLevel: ${source.regionLevel}`,
    `regionName: ${source.regionName}`,
    `homepageUrl: ${source.homepageUrl || ""}`,
    `currentFeedUrl: ${source.feedUrl || ""}`,
    `currentError: ${feedCheck.error || ""}`,
    `repairHint: ${source.repairHint || ""}`
  ].join("\n");

  try {
    const response = await fetch(`${MINIMAX_BASE_URL.replace(/\/$/, "")}/v1/messages`, {
      method: "POST",
      signal: AbortSignal.timeout(60000),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MINIMAX_MODEL,
        max_tokens: 1200,
        temperature: 0,
        system: "你是谨慎的来源维护助手，只给官方来源候选地址，输出可解析 JSON。",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!response.ok) return [];
    const payload = await response.json();
    const text = (payload.content || [])
      .filter((block) => block.type === "text" && block.text)
      .map((block) => block.text)
      .join("\n");
    const parsed = JSON.parse(extractJson(text));
    return Array.isArray(parsed.candidates)
      ? parsed.candidates
          .filter((candidate) => candidate.url)
          .map((candidate) => ({
            url: candidate.url,
            kind: candidate.kind || "ai_candidate",
            reason: candidate.reason || "MiniMax candidate."
          }))
      : [];
  } catch {
    return [];
  }
}

async function probeFeed(url) {
  if (!url) return { ok: false, itemCount: 0, error: "Missing feedUrl." };

  try {
    const text = await fetchText(url);
    const itemCount = countFeedItems(text);
    if (!/<(rss|feed)\b/i.test(text) && itemCount === 0) {
      return { ok: false, itemCount: 0, error: "URL did not return RSS/Atom content." };
    }

    return { ok: itemCount > 0, itemCount, error: itemCount > 0 ? "" : "Feed had no items." };
  } catch (error) {
    return { ok: false, itemCount: 0, error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(25000),
    headers: { "User-Agent": "de-policy-stage/0.1 source repair" }
  });
  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }
  return response.text();
}

function applyRepairs(sources, reports) {
  const suggestions = new Map(
    reports
      .filter((report) => report.status === "repair_found" && report.suggestedFeedUrl)
      .map((report) => [report.sourceId, report.suggestedFeedUrl])
  );

  for (const source of sources) {
    const suggestion = suggestions.get(source.id);
    if (!suggestion) continue;
    source.feedUrl = suggestion;
    source.enabled = true;
    source.lastRepairedAt = new Date().toISOString();
  }
}

function countFeedItems(text) {
  return (text.match(/<(item|entry)\b/gi) || []).length;
}

function uniqueByUrl(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate.url || seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function absolutizeUrl(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return "";
  }
}

function extractJson(value) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : value;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("MiniMax did not return JSON.");
  }
  return raw.slice(start, end + 1);
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
