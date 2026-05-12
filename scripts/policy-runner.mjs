#!/usr/bin/env node
import { spawn } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import readline from "node:readline/promises";
import { assertPolicyWriteEnv, getPolicyEnvStatus, loadPolicyEnv } from "./policy-env.mjs";

const ROOT = process.cwd();
loadPolicyEnv(ROOT);

const SOURCES_FILE = path.join(ROOT, "config", "policy-source-registry.json");
const STATE_FILE = path.join(ROOT, "data", "policy-pipeline-state.json");
const PIPELINE_SCRIPT = path.join(ROOT, "scripts", "run-policy-pipeline.mjs");
const REPAIR_SCRIPT = path.join(ROOT, "scripts", "repair-policy-sources.mjs");

const scriptedAnswers = process.stdin.isTTY ? null : fsSync.readFileSync(0, "utf8").split(/\r?\n/);
const rl = process.stdin.isTTY
  ? readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
  : null;

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = 1;
  })
  .finally(() => rl?.close());

async function main() {
  console.log("\n德区政策展台 Run 入口\n");
  printEnvSummary();
  await printStateSummary();

  while (true) {
    const choice = await choose(
      "请选择要执行的任务",
      [
        ["1", "日常增量：抓近期内容，翻译并发布"],
        ["2", "初次回填：尽量抓历史内容，翻译并发布"],
        ["3", "继续上次断点"],
        ["4", "来源健康检查 / AI 修复"],
        ["5", "单来源试跑，不写入"],
        ["6", "查看断点状态"],
        ["0", "退出"]
      ],
      "1"
    );

    if (choice === "0") return;
    if (choice === "1") await runRecent();
    if (choice === "2") await runBackfill();
    if (choice === "3") await resumePipeline();
    if (choice === "4") await repairSources();
    if (choice === "5") await dryRunSingleSource();
    if (choice === "6") await printStateSummary({ verbose: true });

    const again = await yesNo("还要继续执行其他任务吗？", false);
    if (!again) return;
  }
}

async function runRecent() {
  const options = await collectPipelineOptions({
    mode: "recent",
    perSource: 20,
    maxRequests: 560,
    lookbackDays: 14,
    repairSources: true,
    aiRepair: false,
    write: true,
    loop: false
  });

  ensureReadyToWrite(options);
  await runCommand(PIPELINE_SCRIPT, buildPipelineArgs(options));
}

async function runBackfill() {
  const options = await collectPipelineOptions({
    mode: "backfill",
    perSource: 120,
    maxRequests: 560,
    lookbackDays: 14,
    repairSources: true,
    aiRepair: true,
    write: true,
    loop: false
  });

  ensureReadyToWrite(options);
  await runCommand(PIPELINE_SCRIPT, buildPipelineArgs(options));
}

async function resumePipeline() {
  const state = await readJson(STATE_FILE);
  if (!state?.status) {
    console.log("没有找到本地断点文件。");
    return;
  }

  console.log(`当前断点：${state.status} / ${state.mode || "unknown"} / sourceIndex=${state.sourceIndex ?? 0}`);
  if (state.nextResumeAt) {
    console.log(`建议恢复时间：${state.nextResumeAt}`);
  }

  const force = await yesNo("如果还没到恢复时间，是否强制继续？", false);
  const write = state.args?.write ?? (await yesNo("是否写入并发布？", true));
  const args = [
    "--resume",
    "--mode",
    state.mode || "recent",
    "--per-source",
    String(state.args?.perSource ?? (state.mode === "backfill" ? 120 : 20)),
    "--max-requests",
    String(state.requestBudget || 560),
    "--resume-after-hours",
    String(state.args?.resumeAfterHours ?? 5),
    "--status",
    state.args?.status || "published"
  ];

  if (write) args.push("--write");
  if (state.args?.repairSources) args.push("--repair-sources");
  if (state.args?.aiRepair) args.push("--ai-repair");
  if (state.args?.applyRepair) args.push("--apply-repair");
  if (state.args?.includeAllItems) args.push("--all-items");
  if (force) args.push("--force");

  if (write) ensureReadyToWrite({ write });
  await runCommand(PIPELINE_SCRIPT, args);
}

async function repairSources() {
  const source = await askSourceFilter({ allowAll: true, includeDisabled: true });
  const includeDisabled = await yesNo("是否包含预留但未启用的来源？", true);
  const includeMissing = await yesNo("是否包含还没有 feedUrl 的来源？", true);
  const ai = await yesNo("链接失效或缺失时，是否调用 MiniMax 给候选地址？", true);
  const apply = await yesNo("候选地址验证通过后，是否自动写回注册表？", false);

  const args = [];
  if (source) args.push("--source", source);
  if (includeDisabled) args.push("--include-disabled");
  if (includeMissing) args.push("--include-missing");
  if (ai) args.push("--ai");
  if (apply) args.push("--apply");

  await runCommand(REPAIR_SCRIPT, args);
}

async function dryRunSingleSource() {
  const source = await askSourceFilter({ allowAll: false, includeDisabled: false });
  const perSource = await askNumber("本次最多处理多少条？", 3);
  const maxRequests = await askNumber("MiniMax 请求预算？", 10);
  const includeAllItems = await yesNo("是否跳过关键词过滤，全部交给 AI 判断？", false);
  const repairSources = await yesNo("跑前是否检查来源健康？", true);

  const args = [
    "--mode",
    "recent",
    "--source",
    source,
    "--per-source",
    String(perSource),
    "--max-requests",
    String(maxRequests)
  ];

  if (includeAllItems) args.push("--all-items");
  if (repairSources) args.push("--repair-sources");

  await runCommand(PIPELINE_SCRIPT, args);
}

async function collectPipelineOptions(defaults) {
  const source = await askSourceFilter({ allowAll: true, includeDisabled: false });
  const perSource = await askNumber("每个来源最多处理多少条？", defaults.perSource);
  const maxRequests = await askNumber("本轮 MiniMax 请求预算？", defaults.maxRequests);
  const repairSources = await yesNo("跑前是否检查来源健康？", defaults.repairSources);
  const aiRepair = repairSources ? await yesNo("来源异常时是否调用 MiniMax 给候选地址？", defaults.aiRepair) : false;
  const applyRepair = aiRepair ? await yesNo("候选地址验证通过后是否自动写回来源注册表？", false) : false;
  const startLater = await yesNo("是否指定几点开始运行？", false);
  const loop = await yesNo("撞到请求墙后是否常驻等待 5 小时自动继续？", defaults.loop);

  const options = {
    ...defaults,
    source,
    perSource,
    maxRequests,
    repairSources,
    aiRepair,
    applyRepair,
    loop,
    status: "published",
    resumeAfterHours: 5
  };

  if (defaults.mode === "recent") {
    options.lookbackDays = await askNumber("近期模式回看多少天？", defaults.lookbackDays);
  }

  if (startLater) {
    options.startAt = await askText("几点开始？格式 HH:mm", "02:30");
  }

  return options;
}

function buildPipelineArgs(options) {
  const args = [
    "--mode",
    options.mode,
    "--per-source",
    String(options.perSource),
    "--max-requests",
    String(options.maxRequests),
    "--resume-after-hours",
    String(options.resumeAfterHours),
    "--status",
    options.status
  ];

  if (options.mode === "recent") {
    args.push("--lookback-days", String(options.lookbackDays));
  }
  if (options.source) args.push("--source", options.source);
  if (options.write) args.push("--write");
  if (options.repairSources) args.push("--repair-sources");
  if (options.aiRepair) args.push("--ai-repair");
  if (options.applyRepair) args.push("--apply-repair");
  if (options.loop) args.push("--loop");
  if (options.startAt) args.push("--start-at", options.startAt);

  return args;
}

async function askSourceFilter({ allowAll, includeDisabled }) {
  const sources = await loadSources(includeDisabled);
  const choices = sources.slice(0, 30).map((source, index) => [
    String(index + 1),
    `${source.id} (${source.regionName})${source.enabled === false ? " [预留]" : ""}`
  ]);

  if (allowAll) {
    choices.unshift(["all", "全部可用来源"]);
  }

  choices.push(["custom", "手动输入 source id / 关键词"]);
  const selected = await choose("请选择来源范围", choices, allowAll ? "all" : "1");
  if (selected === "all") return "";
  if (selected === "custom") return askText("请输入 source id 或关键词", "");

  return sources[Number(selected) - 1]?.id || "";
}

async function loadSources(includeDisabled) {
  const sources = await readJson(SOURCES_FILE);
  return (Array.isArray(sources) ? sources : [])
    .filter((source) => includeDisabled || source.enabled !== false)
    .filter((source) => includeDisabled || source.feedUrl);
}

async function printStateSummary(options = {}) {
  const state = await readJson(STATE_FILE);
  if (!state?.status) {
    console.log("断点状态：暂无本地断点。\n");
    return;
  }

  console.log(`断点状态：${state.status}`);
  console.log(`运行模式：${state.mode || "-"}`);
  console.log(`当前来源：${state.sourceId || "-"}`);
  console.log(`请求使用：${state.requestUsed ?? 0}/${state.requestBudget ?? "-"}`);
  console.log(`下次恢复：${state.nextResumeAt || "-"}`);

  if (options.verbose) {
    console.log(JSON.stringify(state, null, 2));
  }
  console.log("");
}

async function choose(question, choices, defaultValue) {
  console.log(`\n${question}`);
  for (const [value, label] of choices) {
    console.log(`  ${value}. ${label}`);
  }

  while (true) {
    const answer = (await askRaw(`选择 [${defaultValue}]: `)).trim() || defaultValue;
    if (choices.some(([value]) => value === answer)) return answer;
    console.log("无效选择，请重新输入。");
  }
}

async function yesNo(question, defaultValue) {
  const suffix = defaultValue ? "Y/n" : "y/N";
  const answer = (await askRaw(`${question} [${suffix}]: `)).trim().toLowerCase();
  if (!answer) return defaultValue;
  return ["y", "yes", "1", "是", "好"].includes(answer);
}

async function askNumber(question, defaultValue) {
  while (true) {
    const answer = (await askRaw(`${question} [${defaultValue}]: `)).trim();
    if (!answer) return defaultValue;
    const parsed = Number.parseInt(answer, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    console.log("请输入正整数。");
  }
}

async function askText(question, defaultValue) {
  const answer = (await askRaw(`${question}${defaultValue ? ` [${defaultValue}]` : ""}: `)).trim();
  return answer || defaultValue;
}

async function askRaw(prompt) {
  if (scriptedAnswers) {
    const answer = scriptedAnswers.shift() ?? "";
    console.log(`${prompt}${answer}`);
    return answer;
  }

  return rl?.question(prompt) ?? "";
}

async function runCommand(script, args) {
  console.log(`\n> node ${path.relative(ROOT, script)} ${args.join(" ")}\n`);

  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: ROOT,
      env: process.env,
      stdio: "inherit",
      shell: false
    });
    child.on("close", (exitCode) => resolve(exitCode ?? 0));
  });

  if (code !== 0) {
    throw new Error(`Command failed with exit code ${code}.`);
  }
}

function ensureReadyToWrite(options) {
  if (!options.write) return;
  assertPolicyWriteEnv();
}

function printEnvSummary() {
  const status = getPolicyEnvStatus();
  console.log(`Supabase URL：${status.supabaseUrl || "未配置"}`);
  console.log(`Supabase Secret：${status.hasSupabaseSecret ? "已配置" : "未配置"}`);
  console.log(`MiniMax Key：${status.hasMiniMaxKey ? "已配置" : "未配置"}`);
  console.log("");
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
}
