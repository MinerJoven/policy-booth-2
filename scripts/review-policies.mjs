#!/usr/bin/env node
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const DEFAULT_OUTPUT_FILE = path.join(ROOT, "data", "ai-review-results.json");
const POLICY_TABLE = process.env.POLICY_BOOTH_TABLE || "policy_booth_policies";
const REVIEW_TABLE = process.env.POLICY_BOOTH_REVIEW_TABLE || "policy_booth_ai_reviews";
const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/anthropic";
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.7";

const args = parseArgs(process.argv.slice(2));
const shouldWrite = Boolean(args.write);
const outputFile = args.output || DEFAULT_OUTPUT_FILE;
const limit = Number.parseInt(args.limit ?? "5", 10);
const statusFilter = args.status || "published";
let miniMaxRequestCount = 0;

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});

async function main() {
  const supabase = createSupabaseWriterClient();
  const policies = await listPoliciesForReview(supabase);
  const reviews = [];

  for (const policy of policies) {
    try {
      console.log(`Reviewing ${policy.slug}`);
      const articleText = await getArticleText(policy.official_url);
      const sourceHash = createHash(articleText);
      const review = await reviewPolicy(policy, articleText);
      const record = toReviewRecord(policy, review, sourceHash);
      reviews.push(record);
      console.log(`${record.review_status}: ${policy.title_zh}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const record = toReviewRecord(
        policy,
        {
          reviewStatus: "uncertain",
          confidence: 0,
          findings: [message],
          suggestedAction: "manual_check",
          reviewSummary: "AI 复核未能完成，请稍后重试或检查官方来源。",
          updatedFields: {}
        },
        ""
      );
      reviews.push(record);
      console.warn(`Review failed for ${policy.slug}: ${message}`);
    }
  }

  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, `${JSON.stringify(reviews, null, 2)}\n`);
  console.log(`Wrote ${reviews.length} review records to ${outputFile}`);

  if (shouldWrite && reviews.length > 0) {
    const { error } = await supabase.from(REVIEW_TABLE).insert(reviews);
    if (error) {
      throw error;
    }
    console.log(`Inserted ${reviews.length} AI review records into ${REVIEW_TABLE}`);
  } else if (!shouldWrite) {
    console.log("Dry run only. Re-run with --write to persist AI reviews into Supabase.");
  }

  console.log(`MiniMax requests used: ${miniMaxRequestCount}`);
}

async function listPoliciesForReview(supabase) {
  let query = supabase
    .from(POLICY_TABLE)
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (args.id) query = query.eq("id", args.id);
  if (args.slug) query = query.eq("slug", args.slug);
  if (args.region) query = query.ilike("region_name", `%${escapeLike(args.region)}%`);
  if (args.category) query = query.eq("category", args.category);
  if (statusFilter !== "all") query = query.eq("status", statusFilter);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

async function reviewPolicy(policy, articleText) {
  const prompt = [
    "请对一条已经入库的德国官方政策中文整理做 AI 自动复核。",
    "目标：节省请求次数，所以本次请求内同时完成事实核对、时效性判断、来源可用性判断和是否适合继续展示的判断。",
    "只输出合法 JSON，不要输出 Markdown。",
    "不要提供个案法律建议；只能判断中文整理是否忠实于官方原文、是否遗漏关键限制、是否需要更新或下线。",
    "",
    "返回字段：",
    "reviewStatus: ok | needs_update | source_changed | source_unreachable | not_policy | uncertain",
    "confidence: 0 到 1 的数字",
    "findings: 字符串数组，列出发现的问题或确认点",
    "suggestedAction: keep | update | unpublish | manual_check",
    "reviewSummary: 中文一句话总结",
    "updatedFields: 对需要更新的字段给出建议值；没有建议时返回空对象",
    "",
    "已入库政策：",
    JSON.stringify(
      {
        slug: policy.slug,
        titleZh: policy.title_zh,
        titleDe: policy.title_de,
        publisher: policy.publisher,
        officialUrl: policy.official_url,
        publishedAt: policy.published_at,
        effectiveAt: policy.effective_at,
        regionLevel: policy.region_level,
        regionName: policy.region_name,
        category: policy.category,
        targetGroups: policy.target_groups,
        summaryZh: policy.summary_zh,
        keyChanges: policy.key_changes,
        userNotes: policy.user_notes,
        impactZh: policy.impact_zh,
        contentZh: policy.content_zh,
        contentDeSummary: policy.content_de_summary,
        riskLevel: policy.risk_level,
        status: policy.status
      },
      null,
      2
    ),
    "",
    "最新抓取的官方原文正文：",
    articleText.slice(0, 30000)
  ].join("\n");

  const text = await callMiniMax(prompt);
  const parsed = JSON.parse(extractJson(text));
  return {
    reviewStatus: normalizeReviewStatus(parsed.reviewStatus),
    confidence: normalizeConfidence(parsed.confidence),
    findings: arrayOr(parsed.findings, []),
    suggestedAction: normalizeSuggestedAction(parsed.suggestedAction),
    reviewSummary: stringOr(parsed.reviewSummary, "AI 复核完成。"),
    updatedFields: parsed.updatedFields && typeof parsed.updatedFields === "object" ? parsed.updatedFields : {}
  };
}

function toReviewRecord(policy, review, sourceHash) {
  return {
    policy_id: policy.id,
    policy_slug: policy.slug,
    official_url: policy.official_url,
    review_status: review.reviewStatus,
    confidence: review.confidence,
    findings: review.findings,
    suggested_action: review.suggestedAction,
    review_summary: review.reviewSummary,
    reviewed_model: MINIMAX_MODEL,
    source_hash: sourceHash || null,
    payload: review
  };
}

async function callMiniMax(prompt) {
  const apiKey = process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("MINIMAX_API_KEY is not set.");
  }

  miniMaxRequestCount += 1;
  const response = await fetch(`${MINIMAX_BASE_URL.replace(/\/$/, "")}/v1/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(120000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      max_tokens: 4200,
      temperature: 0,
      system: "你是严谨的德国官方政策中文整理复核员，只基于官方原文和已入库内容输出结构化 JSON。",
      messages: [{ role: "user", content: prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`MiniMax request failed with ${response.status}: ${await response.text()}`);
  }

  const payload = await response.json();
  return (payload.content || [])
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n")
    .trim();
}

function createSupabaseWriterClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase URL or secret key is missing.");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

async function getArticleText(url) {
  const html = await fetchText(url);
  return extractReadableText(html);
}

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    headers: {
      "User-Agent": "de-policy-stage/0.1 policy AI review"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return response.text();
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

function normalizeReviewStatus(value) {
  return ["ok", "needs_update", "source_changed", "source_unreachable", "not_policy", "uncertain"].includes(value)
    ? value
    : "uncertain";
}

function normalizeSuggestedAction(value) {
  return ["keep", "update", "unpublish", "manual_check"].includes(value) ? value : "manual_check";
}

function normalizeConfidence(value) {
  const number = Number.parseFloat(value);
  if (Number.isNaN(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function createHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
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

function escapeLike(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

function stripTags(value) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").replace(/<[^>]*>/g, " ");
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
