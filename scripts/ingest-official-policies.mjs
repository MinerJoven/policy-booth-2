#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { assertPolicyWriteEnv, loadPolicyEnv } from "./policy-env.mjs";

const ROOT = process.cwd();
loadPolicyEnv(ROOT);

const DEFAULT_SOURCES_FILE = path.join(ROOT, "config", "policy-sources.json");
const DEFAULT_OUTPUT_FILE = path.join(ROOT, "data", "official-policy-drafts.json");
const POLICY_TABLE = process.env.POLICY_BOOTH_TABLE || "policy_booth_policies";
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/anthropic";
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
const POLICY_KEYWORDS = [
  "gesetz",
  "gesetzes",
  "gesetzgebung",
  "verordnung",
  "satzung",
  "richtlinie",
  "reform",
  "förderprogramm",
  "förderung",
  "zuschuss",
  "gebühr",
  "beitrag",
  "steuer",
  "miete",
  "mietspiegel",
  "wohngeld",
  "bürgergeld",
  "bafög",
  "einbürger",
  "aufenthalt",
  "migration",
  "integration",
  "ausländerbehörde",
  "antrag",
  "online-antrag",
  "antragsverfahren",
  "pflicht",
  "anspruch",
  "verbot",
  "regelung",
  "neue regeln",
  "änderung",
  "klima",
  "energie",
  "heizung",
  "solar",
  "verkehr",
  "führerschein",
  "ticket"
];
const EXCLUDED_NEWS_KEYWORDS = [
  "empfängt",
  "besuch",
  "gedenken",
  "wettbewerb",
  "statement",
  "telefonat",
  "glückwunsch",
  "olympia",
  "ausstellung",
  "konzert",
  "feiert",
  "iran",
  "ukraine",
  "krieg",
  "waffenruhe",
  "botschafter",
  "nato",
  "sicherheitsrat",
  "beschlagnahmt",
  "privatwohnung",
  "reptilien",
  "giftige kobra",
  "waran"
];
const CANONICAL_CATEGORIES = [
  "居留与签证",
  "留学与大学",
  "工作与蓝卡",
  "入籍与长期居留",
  "税务与社保",
  "医保与保险",
  "家庭与福利",
  "交通与驾照",
  "宠物与犬税",
  "生活行政",
  "其他"
];
const CANONICAL_TARGET_GROUPS = [
  "留学生",
  "求职者",
  "工作签人群",
  "蓝卡人群",
  "自雇人士",
  "华人家庭",
  "新移民",
  "车主",
  "宠物主人",
  "可能相关"
];

const args = parseArgs(process.argv.slice(2));
const shouldWrite = Boolean(args.write);
const limit = Number.parseInt(args.limit ?? "8", 10);
const perSource = Number.parseInt(args.perSource ?? "4", 10);
const outputFile = args.output || DEFAULT_OUTPUT_FILE;
const sourcesFile = args.sources || DEFAULT_SOURCES_FILE;
const ingestStatus = normalizeStatus(args.status ?? "draft");
const sourceFilter = args.source || args.sourceId || "";
const sinceDate = normalizeDate(args.since);
const skipExisting = Boolean(args.skipExisting);
const repairJsonWithAi = Boolean(args.repairJson);
const flushEach = Boolean(args.flushEach);
const maxRequests = Number.parseInt(args.maxRequests ?? "0", 10);
const concurrency = Math.max(1, Number.parseInt(args.concurrency ?? "1", 10));
const includeAllItems = Boolean(args.allItems) || Boolean(args.noKeywordFilter);
let miniMaxRequestCount = 0;
let miniMaxUsageLimitReached = false;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  if (shouldWrite) {
    assertPolicyWriteEnv();
  }

  let sources = JSON.parse(await fs.readFile(sourcesFile, "utf8"));
  sources = sources.filter((source) => source.enabled !== false && source.feedUrl);
  if (sourceFilter) {
    sources = sources.filter(
      (source) =>
        source.id === sourceFilter ||
        source.name.toLowerCase().includes(String(sourceFilter).toLowerCase()) ||
        source.regionName.toLowerCase().includes(String(sourceFilter).toLowerCase())
    );
  }

  if (sources.length === 0) {
    throw new Error(`No policy sources matched "${sourceFilter}".`);
  }

  const drafts = [];
  const existingOfficialUrls = shouldWrite && skipExisting ? await getExistingOfficialUrls() : new Set();

  for (const source of sources) {
    console.log(`Fetching ${source.name}`);
    const feed = await fetchText(source.feedUrl);
    const items = parseFeedItems(feed)
      .filter((item) => item.link)
      .filter((item) => !existingOfficialUrls.has(item.link))
      .filter((item) => !sinceDate || !item.publishedAt || item.publishedAt >= sinceDate)
      .filter((item) => includeAllItems || matchesPolicyKeywords(item.title, item.description))
      .slice(0, perSource);

    await processItems({ source, items, drafts, existingOfficialUrls });

    if (drafts.length >= limit) break;
    if (shouldStopMiniMaxRequests()) break;
  }

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(drafts, null, 2)}\n`);
  console.log(`Wrote ${drafts.length} drafts to ${outputFile}`);

  if (shouldWrite && !flushEach) {
    await upsertDrafts(drafts);
    console.log(`Upserted ${drafts.length} drafts into ${POLICY_TABLE}`);
  } else if (shouldWrite) {
    console.log(`Flushed ${drafts.length} drafts into ${POLICY_TABLE}`);
  } else {
    console.log("Dry run only. Re-run with --write to upsert drafts into Supabase.");
  }

  console.log(`MiniMax requests used: ${miniMaxRequestCount}`);
  if (miniMaxUsageLimitReached) {
    console.log("MiniMax usage limit reached; stopped early.");
  }
}

async function getExistingOfficialUrls() {
  const supabase = createSupabaseWriterClient();
  const urls = new Set();
  let from = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from(POLICY_TABLE)
      .select("official_url")
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    (data ?? []).forEach((row) => {
      if (row.official_url) urls.add(row.official_url);
    });

    if (!data || data.length < pageSize) break;
    from += pageSize;
  }

  return urls;
}

async function translatePolicy({ source, item, articleText }) {
  const prompt = [
    "请把以下德国官方来源内容整理成德区政策展台的结构化 JSON。",
    "要求：只输出 JSON；不要输出 Markdown；无法确定的字段给出保守、清晰的默认值；不要编造官方未写明的结论。",
    "所有中文字段面向在德华人，语气克制；法律、税务、移民类内容必须提示以官方原文和主管机关答复为准。",
    "先判断它是否适合政策库：只有涉及权利义务、申请流程、补贴资助、税费、租住、居留入籍、教育工作、公共服务规则变化、交通能源环保规则等内容才算适合。",
    "外交表态、致辞、纪念活动、展览、单纯开放新闻、文化体育活动、人物接待、竞赛评选等不适合。",
    "",
    `来源层级：${source.regionLevel}`,
    `适用地区：${source.regionName}`,
    `发布机构：${source.publisher}`,
    `默认类别：${source.defaultCategory}`,
    `原文标题：${item.title}`,
    `原文链接：${item.link}`,
    `发布时间：${item.publishedAt || ""}`,
    "",
    "请返回这些字段：",
    "isPolicyRelevant, titleZh, titleDe, publisher, officialUrl, publishedAt, effectiveAt, regionLevel, regionName, category, targetGroups, summaryZh, keyChanges, userNotes, impactZh, contentZh, contentDeSummary, riskLevel",
    "regionLevel 必须严格使用这四个值之一：联邦、州、市、Landkreis。",
    `category 必须严格从这些固定主题中选择一个：${CANONICAL_CATEGORIES.join("、")}。`,
    `targetGroups 必须严格从这些固定人群标签中选择一个或多个：${CANONICAL_TARGET_GROUPS.join("、")}。`,
    "必须返回合法 JSON；字符串里的引号必须转义，不要把德文原文标题中的引号直接写进未转义字符串。",
    "",
    "原文正文：",
    articleText.slice(0, 24000)
  ].join("\n");

  const text = await callMiniMax(prompt);
  const parsed = await parseMiniMaxJson(text);
  if (parsed.isPolicyRelevant === false) {
    throw new Error("MiniMax classified item as not policy-relevant.");
  }
  const titleDe = stringOr(parsed.titleDe, item.title);
  const officialUrl = item.link;

  return {
    slug: createSlug(`${titleDe}-${officialUrl}`),
    titleZh: stringOr(parsed.titleZh, titleDe),
    titleDe,
    publisher: stringOr(parsed.publisher, source.publisher),
    officialUrl,
    publishedAt: normalizeDate(parsed.publishedAt || item.publishedAt) || new Date().toISOString().slice(0, 10),
    effectiveAt: normalizeDate(parsed.effectiveAt) || "",
    regionLevel: normalizeRegionLevel(parsed.regionLevel, source.regionLevel),
    regionName: stringOr(parsed.regionName, source.regionName),
    category: normalizeCategory(parsed, source.defaultCategory),
    targetGroups: normalizeTargetGroups(parsed, ["可能相关"]),
    summaryZh: stringOr(parsed.summaryZh, item.description || titleDe),
    keyChanges: arrayOr(parsed.keyChanges, ["请以官方原文为准。"]),
    userNotes: stringOr(parsed.userNotes, "该内容由 AI 根据官方来源初步整理，发布前需要人工核对官方原文。"),
    impactZh: stringOr(parsed.impactZh, "可能影响相关地区或主题下的居民、申请人或机构，具体适用性以官方说明为准。"),
    contentZh: stringOr(parsed.contentZh, parsed.summaryZh || item.description || titleDe),
    contentDeSummary: stringOr(parsed.contentDeSummary, item.description || ""),
    riskLevel: normalizeRisk(parsed.riskLevel),
    status: ingestStatus
  };
}

async function parseMiniMaxJson(text) {
  const raw = extractJson(text);
  try {
    return JSON.parse(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!repairJsonWithAi) {
      throw new Error(`MiniMax returned invalid JSON: ${message}`);
    }

    const repaired = await callMiniMax(
      [
        "下面文本本应是 JSON，但存在转义、逗号或括号错误。",
        "请只输出修复后的合法 JSON，不要输出 Markdown，不要增删字段，不要改写事实。",
        `解析错误：${message}`,
        "",
        raw.slice(0, 18000)
      ].join("\n"),
      { maxTokens: 2600, temperature: 0 }
    );
    return JSON.parse(extractJson(repaired));
  }
}

async function processItems({ source, items, drafts, existingOfficialUrls }) {
  let cursor = 0;

  async function worker() {
    while (drafts.length < limit && !shouldStopMiniMaxRequests()) {
      const item = items[cursor];
      cursor += 1;
      if (!item) return;
      await processItem({ source, item, drafts, existingOfficialUrls });
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

async function processItem({ source, item, drafts, existingOfficialUrls }) {
  try {
    const articleText = await getArticleText(item.link);
    const draft = await translatePolicy({ source, item, articleText });
    if (drafts.length >= limit) return;
    drafts.push(draft);
    if (shouldWrite && flushEach) {
      await upsertDrafts([draft]);
      existingOfficialUrls.add(item.link);
      console.log(`Upserted ${draft.titleZh}`);
    }
    console.log(`Drafted ${draft.titleZh} (${draft.regionName})`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isMiniMaxUsageLimitError(message)) {
      miniMaxUsageLimitReached = true;
    }
    console.warn(`Skipped ${item.title}: ${message}`);
  }
}

async function callMiniMax(prompt, options = {}) {
  const apiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is not set.");
  }

  if (shouldStopMiniMaxRequests()) {
    throw new Error(`MiniMax request limit reached: ${miniMaxRequestCount}/${maxRequests}`);
  }

  miniMaxRequestCount += 1;
  const response = await fetch(`${MINIMAX_BASE_URL.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(90000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      max_tokens: options.maxTokens ?? 3600,
      temperature: options.temperature ?? 0.2,
      system: "你是严谨的德国政策信息整理员，只基于官方原文输出结构化中文整理，不提供个案法律建议。",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 429 && isMiniMaxUsageLimitError(errorText)) {
      miniMaxUsageLimitReached = true;
    }
    throw new Error(`MiniMax request failed with ${response.status}: ${errorText}`);
  }

  const payload = await response.json();
  return (payload.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
}

async function upsertDrafts(drafts) {
  const supabase = createSupabaseWriterClient();
  const rows = dedupeRowsByOfficialUrl(await reuseExistingSlugs(supabase, drafts.map(toDbPayload)));
  const { error } = await supabase.from(POLICY_TABLE).upsert(rows, { onConflict: "slug" });
  if (error) {
    throw error;
  }
}

function hasReachedRequestLimit() {
  return maxRequests > 0 && miniMaxRequestCount >= maxRequests;
}

function shouldStopMiniMaxRequests() {
  return hasReachedRequestLimit() || miniMaxUsageLimitReached;
}

function isMiniMaxUsageLimitError(message) {
  return /usage limit exceeded|5-hour usage limit|600\/600|rate_limit_error/i.test(message);
}

function createSupabaseWriterClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase URL or secret key is missing; refusing to write.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function reuseExistingSlugs(supabase, rows) {
  const officialUrls = [...new Set(rows.map((row) => row.official_url).filter(Boolean))];
  if (officialUrls.length === 0) return rows;

  const { data, error } = await supabase
    .from(POLICY_TABLE)
    .select("slug,official_url")
    .in("official_url", officialUrls);

  if (error) {
    throw error;
  }

  const slugByUrl = new Map((data ?? []).map((row) => [row.official_url, row.slug]));
  return rows.map((row) => ({
    ...row,
    slug: slugByUrl.get(row.official_url) ?? row.slug
  }));
}

function dedupeRowsByOfficialUrl(rows) {
  const rowsByUrl = new Map();
  rows.forEach((row) => {
    if (!rowsByUrl.has(row.official_url)) {
      rowsByUrl.set(row.official_url, row);
    }
  });
  return [...rowsByUrl.values()];
}

function toDbPayload(policy) {
  return {
    slug: policy.slug,
    title_zh: policy.titleZh,
    title_de: policy.titleDe,
    publisher: policy.publisher,
    official_url: policy.officialUrl,
    published_at: policy.publishedAt,
    effective_at: policy.effectiveAt || null,
    region_level: policy.regionLevel,
    region_name: policy.regionName,
    category: policy.category,
    target_groups: policy.targetGroups,
    summary_zh: policy.summaryZh,
    key_changes: policy.keyChanges,
    user_notes: policy.userNotes,
    impact_zh: policy.impactZh,
    content_zh: policy.contentZh,
    content_de_summary: policy.contentDeSummary || null,
    risk_level: policy.riskLevel,
    status: policy.status
  };
}

async function getArticleText(url) {
  try {
    const html = await fetchText(url);
    return extractReadableText(html);
  } catch {
    return "";
  }
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(30000),
    headers: {
      "User-Agent": "de-policy-stage/0.1 policy source monitor"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return response.text();
}

function parseFeedItems(xml) {
  const entries = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const atomEntries = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const blocks = entries.length > 0 ? entries : atomEntries;

  return blocks.map((block) => ({
    title: decodeEntities(readTag(block, "title")),
    link: normalizeLink(readTag(block, "link") || readAttr(block, "link", "href")),
    description: decodeEntities(stripTags(readTag(block, "description") || readTag(block, "summary") || readTag(block, "content"))),
    publishedAt: normalizeDate(readTag(block, "pubDate") || readTag(block, "published") || readTag(block, "updated"))
  }));
}

function readTag(block, tag) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripCdata(match[1]).trim() : "";
}

function readAttr(block, tag, attr) {
  const match = block.match(new RegExp(`<${tag}[^>]*${attr}=["']([^"']+)["'][^>]*>`, "i"));
  return match ? match[1] : "";
}

function extractReadableText(html) {
  return decodeEntities(
    stripTags(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    )
  )
    .replace(/\s+/g, " ")
    .trim();
}

function matchesPolicyKeywords(...parts) {
  const text = parts.join(" ").toLowerCase();
  if (EXCLUDED_NEWS_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return false;
  }

  return POLICY_KEYWORDS.some((keyword) => text.includes(keyword));
}

function extractJson(value) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : value;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`MiniMax did not return JSON: ${value.slice(0, 300)}`);
  }
  return raw.slice(start, end + 1);
}

function createSlug(value) {
  const hash = crypto.createHash("sha1").update(value).digest("hex").slice(0, 8);
  const normalized = value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return `${normalized || "policy"}-${hash}`;
}

function normalizeDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    const match = String(value).match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (!match) return "";
    return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  }
  return date.toISOString().slice(0, 10);
}

function normalizeRisk(value) {
  return ["low", "medium", "high"].includes(value) ? value : "medium";
}

function normalizeCategory(parsed, fallback) {
  const raw = stringOr(parsed.category, fallback);
  if (CANONICAL_CATEGORIES.includes(raw)) return raw;

  const text = taxonomyText(parsed, raw);
  if (includesAny(text, ["入籍", "国籍", "永居", "长期居留", "naturalization", "einbürger", "niederlassung"])) return "入籍与长期居留";
  if (includesAny(text, ["签证", "居留", "外管局", "aufenthalt", "ausländer"])) return "居留与签证";
  if (includesAny(text, ["蓝卡", "工作签", "就业", "求职", "jobcenter", "arbeits", "employment"])) return "工作与蓝卡";
  if (includesAny(text, ["大学", "高校", "学生", "留学", "注册", "学校", "kita", "schule", "student", "university"])) return "留学与大学";
  if (includesAny(text, ["医保", "医疗", "医院", "护理", "急救", "保险", "health", "kranken", "pflege", "rettungsdienst"])) return "医保与保险";
  if (includesAny(text, ["家庭", "儿童", "父母", "子女", "托儿", "幼儿", "福利", "儿童金", "父母金", "庇护", "无家可归", "familien", "kind", "kinder"])) return "家庭与福利";
  if (includesAny(text, ["税", "社保", "费用", "财政", "预算", "纳税", "steuer", "gebühr", "haushalt"])) return "税务与社保";
  if (includesAny(text, ["交通", "驾照", "驾驶", "车辆", "停车", "公交", "自行车", "道路", "隧道", "出行", "verkehr", "führerschein", "straße", "tunnel"])) return "交通与驾照";
  if (includesAny(text, ["宠物", "犬税", "动物", "猫", "狗", "爬行", "蛇", "hund", "reptil"])) return "宠物与犬税";
  if (includesAny(text, ["预约", "登记", "市民服务", "办事", "公共服务", "住房", "租房", "供水", "警报", "数字化", "行政", "wohnen", "bürger", "verwaltung"])) return "生活行政";
  return "其他";
}

function normalizeTargetGroups(parsed, fallback) {
  const groups = new Set(arrayOr(parsed.targetGroups, []).filter((group) => CANONICAL_TARGET_GROUPS.includes(group)));
  const text = taxonomyText(parsed, "");

  if (includesAny(text, ["学生", "大学", "高校", "学校", "留学", "student", "schule", "university"])) groups.add("留学生");
  if (includesAny(text, ["求职", "招聘", "就业", "jobcenter", "arbeitslos", "bewerbung"])) groups.add("求职者");
  if (includesAny(text, ["工作签", "雇员", "就业", "工人", "arbeits", "employment"])) groups.add("工作签人群");
  if (includesAny(text, ["蓝卡", "blue card", "blaue karte"])) groups.add("蓝卡人群");
  if (includesAny(text, ["自雇", "创业", "自由职业", "企业主", "freiberuf", "startup"])) groups.add("自雇人士");
  if (includesAny(text, ["家庭", "儿童", "父母", "子女", "幼儿", "kita", "kind", "familie"])) groups.add("华人家庭");
  if (includesAny(text, ["新移民", "外籍", "移民", "居留", "入籍", "ausländer", "aufenthalt"])) groups.add("新移民");
  if (includesAny(text, ["车主", "驾驶", "驾照", "车辆", "停车", "隧道", "道路", "机动车", "verkehr", "führerschein", "tunnel"])) groups.add("车主");
  if (includesAny(text, ["宠物", "犬", "动物", "爬行", "蛇", "猫", "狗", "hund", "reptil"])) groups.add("宠物主人");

  return groups.size > 0 ? [...groups] : fallback;
}

function taxonomyText(parsed, fallback) {
  return [
    fallback,
    parsed.titleZh,
    parsed.titleDe,
    parsed.summaryZh,
    parsed.contentDeSummary,
    ...(Array.isArray(parsed.keyChanges) ? parsed.keyChanges : []),
    ...(Array.isArray(parsed.targetGroups) ? parsed.targetGroups : [])
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFKC");
}

function includesAny(text, needles) {
  return needles.some((needle) => text.includes(String(needle).toLowerCase().normalize("NFKC")));
}

function normalizeStatus(value) {
  return ["draft", "published", "unpublished", "expired"].includes(value) ? value : "draft";
}

function normalizeRegionLevel(value, fallback) {
  const text = stringOr(value, fallback);
  if (text.includes("联邦") || /bund/i.test(text)) return "联邦";
  if (text.includes("Landkreis") || text.includes("县")) return "Landkreis";
  if (text.includes("市") || /stadt|city/i.test(text)) return "市";
  if (text.includes("州") || /land|state/i.test(text)) return "州";
  return ["联邦", "州", "市", "Landkreis"].includes(fallback) ? fallback : "州";
}

function arrayOr(value, fallback) {
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : fallback;
  }
  return fallback;
}

function stringOr(value, fallback) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function normalizeLink(value) {
  return decodeEntities(value).trim();
}

function stripCdata(value) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

function stripTags(value) {
  return stripCdata(value).replace(/<[^>]*>/g, " ");
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
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
