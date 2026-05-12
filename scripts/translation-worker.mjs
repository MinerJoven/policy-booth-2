#!/usr/bin/env node
/**
 * 政策展台 2.0 — 翻译 Worker
 * 对应 SPEC.md 第 5 节
 *
 * 统一处理 policy_pages 和 jobs 的翻译任务：
 * - 政策: 调用 MiniMax 提炼结构化中文摘要
 * - 招聘: 翻译职位名（≤20字）+ 两句摘要（≤50字）
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

// --- Config ---
const V2_POLICY_TABLE = process.env.V2_POLICY_TABLE || "policy_pages";
const V2_JOBS_TABLE = process.env.V2_JOBS_TABLE || "jobs";
const TRANSLATION_QUEUE_TABLE = process.env.V2_TRANSLATION_QUEUE_TABLE || "translation_queue";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "";

const MINIMAX_BASE_URL = process.env.MINIMAX_BASE_URL || "https://api.minimaxi.com/anthropic";
const MINIMAX_MODEL = process.env.MINIMAX_MODEL || "MiniMax-M2.7";
const BATCH_SIZE = 20;
const MAX_RETRIES = 3;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY or SUPABASE_URL");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// --- MiniMax API ---
async function generateMiniMaxText({ prompt, system, maxTokens = 4000, temperature = 0.1 }) {
  const response = await fetch(`${MINIMAX_BASE_URL}/v1/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY || ""}`,
      "x-api-key": process.env.MINIMAX_API_KEY || "",
    },
    body: JSON.stringify({
      model: MINIMAX_MODEL,
      max_tokens: maxTokens,
      temperature,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MiniMax API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  // MiniMax anthropic-compatible format
  const content = data.content;
  if (Array.isArray(content)) {
    return content.find((c) => c.type === "text")?.text || "";
  }
  return content?.text || "";
}

// --- Prompts ---

const POLICY_PROMPT = `请将以下德国官方政策页面内容提炼为结构化中文信息。

输出格式（严格 JSON，不要输出任何其他内容）：
{
  "title_zh": "中文标题（20字以内）",
  "summary_zh": "300字以内中文摘要（用自己的话概括，不复制原文）",
  "requirements_zh": ["材料1", "材料2", ...],
  "fees_zh": "费用说明（如无明确费用则填'未查到'）",
  "duration_zh": "办理时限说明（如'通常4-8周'）",
  "steps_zh": ["步骤1", "步骤2", ...]
}

重要原则：
- 必须用自己的话概括，不直接复制德文原文
- 材料清单只填有明确文件要求的条目
- fees/duration 只填官方明确说明的，无则填"未查到"
- 保持法律合规，不提供个案建议

官方政策页面内容：
`;

const JOB_PROMPT = `将以下德语职位信息翻译为中文：

职位名：{title_de}

输出 JSON（严格 JSON，不要输出任何其他内容）：
{
  "title_zh": "中文职位名（≤20字）",
  "brief_zh": "两句话中文摘要（≤50字，描述核心职责和要求）"
}`;

// --- Translation Logic ---

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`No JSON found in response: ${text.slice(0, 200)}`);
  }
  return raw.slice(start, end + 1);
}

async function translatePolicy(policy) {
  const sourceText = policy.source_text || "";
  const prompt = POLICY_PROMPT + sourceText.slice(0, 30000);

  const text = await generateMiniMaxText({
    prompt,
    system: "你是严谨的德国官方政策中文整理翻译员，严格按照指定 JSON 格式输出，不要输出任何其他内容。",
    maxTokens: 4000,
    temperature: 0.1,
  });

  const parsed = JSON.parse(extractJson(text));
  return {
    title_zh: String(parsed.title_zh || "").slice(0, 100),
    summary_zh: String(parsed.summary_zh || "").slice(0, 600),
    requirements_zh: Array.isArray(parsed.requirements_zh) ? parsed.requirements_zh.slice(0, 20) : [],
    fees_zh: String(parsed.fees_zh || "未查到").slice(0, 200),
    duration_zh: String(parsed.duration_zh || "未查到").slice(0, 200),
    steps_zh: Array.isArray(parsed.steps_zh) ? parsed.steps_zh.slice(0, 20) : [],
    translated: true,
    translated_at: new Date().toISOString(),
  };
}

async function translateJob(job) {
  const prompt = JOB_PROMPT.replace("{title_de}", job.title_de || "");

  const text = await generateMiniMaxText({
    prompt,
    system: "你是德国招聘信息的中文翻译员，严格按照指定 JSON 格式输出，不要输出任何其他内容。",
    maxTokens: 500,
    temperature: 0.1,
  });

  const parsed = JSON.parse(extractJson(text));
  return {
    title_zh: String(parsed.title_zh || "").slice(0, 20),
    brief_zh: String(parsed.brief_zh || "").slice(0, 100),
    translated: true,
    translated_at: new Date().toISOString(),
  };
}

// --- Queue Processing ---

async function processQueue() {
  console.log("[Translation Worker] Starting...");

  // Claim pending items
  const { data: items, error } = await supabase
    .from(TRANSLATION_QUEUE_TABLE)
    .select("*")
    .eq("status", "pending")
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (error || !items || items.length === 0) {
    console.log("[Translation Worker] No pending items");
    return;
  }

  console.log(`[Translation Worker] Processing ${items.length} items`);

  // Mark as processing
  const ids = items.map((i) => i.id);
  await supabase
    .from(TRANSLATION_QUEUE_TABLE)
    .update({ status: "processing", attempts: items[0].attempts + 1 })
    .in("id", ids);

  const results = await Promise.allSettled(
    items.map(async (item) => {
      try {
        if (item.source_type === "policy") {
          // Fetch policy source text (simplified - real impl would fetch source_url)
          const { data: policy } = await supabase
            .from(V2_POLICY_TABLE)
            .select("id, source_url, content_hash")
            .eq("id", item.source_id)
            .maybeSingle();

          if (!policy) throw new Error(`Policy ${item.source_id} not found`);

          const translated = await translatePolicy({ source_url: policy.source_url });

          await supabase
            .from(V2_POLICY_TABLE)
            .update({ ...translated, updated_at: new Date().toISOString() })
            .eq("id", item.source_id);

        } else if (item.source_type === "job") {
          const { data: job } = await supabase
            .from(V2_JOBS_TABLE)
            .select("refnr, title_de")
            .eq("refnr", item.source_id)
            .maybeSingle();

          if (!job) throw new Error(`Job ${item.source_id} not found`);

          const translated = await translateJob(job);

          await supabase
            .from(V2_JOBS_TABLE)
            .update({ ...translated, updated_at: new Date().toISOString() })
            .eq("refnr", item.source_id);
        }

        await supabase
          .from(TRANSLATION_QUEUE_TABLE)
          .update({ status: "done", processed_at: new Date().toISOString() })
          .eq("id", item.id);

        console.log(`[OK] ${item.source_type} ${item.source_id}`);
      } catch (err) {
        const attempts = (item.attempts || 0) + 1;
        const newStatus = attempts >= MAX_RETRIES ? "failed" : "pending";

        await supabase
          .from(TRANSLATION_QUEUE_TABLE)
          .update({
            status: newStatus,
            error_message: String(err.message).slice(0, 500),
            attempts,
            processed_at: newStatus === "failed" ? new Date().toISOString() : null,
          })
          .eq("id", item.id);

        console.error(`[FAIL] ${item.source_type} ${item.source_id}: ${err.message}`);
      }
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;
  console.log(`[Translation Worker] Done: ${succeeded} succeeded, ${failed} failed`);
}

// --- CLI ---
processQueue().catch((err) => {
  console.error("[Translation Worker] Fatal error:", err);
  process.exit(1);
});
