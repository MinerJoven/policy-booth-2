#!/usr/bin/env node
/**
 * 政策展台 2.0 — 政策内容增量检测与采集脚本
 * 对应 SPEC.md 4.1 节 ETag 增量检测
 * 
 * 数据源: BAMF, Make-it-in-Germany, DAAD
 * 写入: policy_pages 表 + translation_queue 表
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import httpx from "httpx";
import { loadPolicyEnv, assertPolicyWriteEnv } from "./policy-env.mjs";

// ─── 配置 ───────────────────────────────────────────────
const POLICY_TABLE = "policy_pages";
const QUEUE_TABLE = "translation_queue";
const IS_FULL_SCRAPE = process.env.FULL_SCRAPE === "true";

// 政策来源配置
const POLICY_SOURCES = [
  // ===== BAMF 联邦移民局 =====
  {
    source_name: "联邦移民局 (BAMF)",
    source_url_base: "https://www.bamf.de",
    publisher: "Bundesamt für Migration und Flüchtlinge",
    region_level: "联邦",
    region_name: "联邦",
    entries: [
      {
        service_key: "bamf_aufenthaltserlaubnis_studium",
        slug: "aufenthaltserlaubnis-studium",
        source_url: "https://www.bamf.de/DE/Themen/MigrationAufenthalt/TechedMigration/Aufenthaltstitel/aufenthaltstitel-node.html",
        category: "居留与签证",
        tags: ["留学", "居留"],
      },
      {
        service_key: "bamf_aufenthaltserlaubnis_suche",
        slug: "aufenthaltserlaubnis-suche",
        source_url: "https://www.bamf.de/DE/Themen/MigrationAufenthalt/TechedMigration/Aufenthaltstitel/aufenthaltserlaubnis-suche-node.html",
        category: "居留与签证",
        tags: ["求职", "居留"],
      },
      {
        service_key: "bamf_blaukartee",
        slug: "blaukartee",
        source_url: "https://www.bamf.de/DE/Themen/MigrationAufenthalt/TechedMigration/Aufenthaltstitel/blaue-karte-eu/blaue-karte-eu-node.html",
        category: "工作与蓝卡",
        tags: ["工作", "蓝卡", "欧盟蓝卡"],
      },
      {
        service_key: "bamf_niederlassungserlaubnis",
        slug: "niederlassungserlaubnis",
        source_url: "https://www.bamf.de/DE/Themen/MigrationAufenthalt/TechedMigration/Aufenthaltstitel/niederlassungserlaubnis-node.html",
        category: "入籍与长期居留",
        tags: ["永居", "入籍"],
      },
      {
        service_key: "bamf_familiennachzug",
        slug: "familiennachzug",
        source_url: "https://www.bamf.de/DE/Themen/MigrationAufenthalt/TechedMigration/Familiennachzug/familiennachzug-node.html",
        category: "家庭与福利",
        tags: ["家庭", "家属"],
      },
      {
        service_key: "bamf_einbuergerung",
        slug: "einbuergerung",
        source_url: "https://www.bamf.de/DE/Themen/MigrationAufenthalt/Einbuergerung/einbuergerung-node.html",
        category: "入籍与长期居留",
        tags: ["入籍", "德国籍"],
      },
    ],
  },

  // ===== Make-it-in-Germany =====
  {
    source_name: "德国官方海外招聘门户",
    source_url_base: "https://www.make-it-in-germany.com",
    publisher: "Federal Ministry for Economic Affairs and Energy",
    region_level: "联邦",
    region_name: "联邦",
    entries: [
      {
        service_key: "mitig_visa_work",
        slug: "visa-working-germany",
        source_url: "https://www.make-it-in-germany.com/visa/work-visa",
        category: "工作与蓝卡",
        tags: ["工作签", "签证"],
      },
      {
        service_key: "mitig_visa_study",
        slug: "visa-studying-germany",
        source_url: "https://www.make-it-in-germany.com/visa/study-visa",
        category: "留学与大学",
        tags: ["学生签", "留学"],
      },
      {
        service_key: "mitig_jobsearch",
        slug: "job-search-visa",
        source_url: "https://www.make-it-in-germany.com/visa/jobseekers",
        category: "居留与签证",
        tags: ["求职签", "找工作"],
      },
      {
        service_key: "mitig_working_holiday",
        slug: "working-holiday-germany",
        source_url: "https://www.make-it-in-germany.com/visa/working-holiday",
        category: "居留与签证",
        tags: ["打工度假", "青年交流"],
      },
    ],
  },

  // ===== DAAD =====
  {
    source_name: "德国学术交流中心",
    source_url_base: "https://www.daad.de",
    publisher: "Deutscher Akademischer Austauschdienst",
    region_level: "联邦",
    region_name: "联邦",
    entries: [
      {
        service_key: "daad_study_germany",
        slug: "daad-study-in-germany",
        source_url: "https://www.daad.de/en/study-in-germany/",
        category: "留学与大学",
        tags: ["留学", "大学", "DAAD"],
      },
      {
        service_key: "daad_scholarship",
        slug: "daad-scholarships",
        source_url: "https://www.daad.de/en/study-in-germany/scholarships/",
        category: "留学与大学",
        tags: ["奖学金", "DAAD", "资助"],
      },
    ],
  },

  // ===== Auswärtiges Amt 外交部 =====
  {
    source_name: "德意志联邦共和国外交部",
    source_url_base: "https://www.auswaertiges-amt.de",
    publisher: "Auswärtiges Amt",
    region_level: "联邦",
    region_name: "联邦",
    entries: [
      {
        service_key: "aa_visa_overview",
        slug: "visa-overview-germany",
        source_url: "https://www.auswaertiges-amt.de/en/visa-and-residence/visa-national",
        category: "居留与签证",
        tags: ["签证", "旅游签", "访问签"],
      },
      {
        service_key: "aa_schengen_stay",
        slug: "schengen-stay-overview",
        source_url: "https://www.auswaertiges-amt.de/en/visa-and-residence/residence-electronic-device",
        category: "居留与签证",
        tags: ["申根", "90天"],
      },
    ],
  },
];

// ─── Supabase 客户端 ─────────────────────────────────────
loadPolicyEnv();
assertPolicyWriteEnv();

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
);

// ─── HTTP 客户端 ─────────────────────────────────────────
const http = httpx.createClient({
  timeout: 30000,
  headers: {
    "User-Agent": "Policy-Booth-2/1.0 (German policy aggregator for Chinese users)",
    "Accept": "text/html,application/xhtml+xml",
    "Accept-Language": "de-DE,de;q=0.9",
  },
});

// ─── 工具函数 ────────────────────────────────────────────
function md5hash(text) {
  return crypto.createHash("md5").update(text || "").digest("hex");
}

async function fetchWithETag(url, storedETag = null, storedLastModified = null) {
  const headers = {};
  if (!IS_FULL_SCRAPE) {
    if (storedETag) headers["If-None-Match"] = storedETag;
    if (storedLastModified) headers["If-Modified-Since"] = storedLastModified;
  }

  try {
    const resp = await http.get(url, { headers });
    const status = resp.statusCode;
    const etag = resp.headers["etag"] || null;
    const lastModified = resp.headers["last-modified"] || null;
    const body = resp.content;

    return { status, etag, lastModified, body, changed: true };
  } catch (err) {
    console.error(`[ERROR] Failed to fetch ${url}: ${err.message}`);
    return { status: 0, etag: null, lastModified: null, body: null, changed: false, error: err.message };
  }
}

function parseHtmlBasic(html) {
  // 用正则简单提取标题和正文段落
  const result = { title: "", content: "", publishedDate: "" };

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) result.title = titleMatch[1].replace(/\s*[-|].*$/, "").trim();

  const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  if (h1Match) result.title = h1Match[1].trim();

  // 提取正文段落（排除导航/脚注）
  const paragraphBlocks = [];
  const pRegex = /<p[^>]*>([^<]{50,})<\/p>/gi;
  let match;
  while ((match = pRegex.exec(html)) !== null) {
    const text = match[1].replace(/<[^>]+>/g, "").trim();
    if (!text.match(/cookie|datenschutz|impressum|©/i)) {
      paragraphBlocks.push(text);
    }
  }
  result.content = paragraphBlocks.slice(0, 20).join("\n\n");

  // 提取日期
  const dateMatch = html.match(/\b(\d{1,2}\.\d{1,2}\.\d{4}|\d{4}-\d{2}-\d{2})\b/);
  if (dateMatch) result.publishedDate = dateMatch[1];

  return result;
}

async function upsertPolicyPage(entry, source, parsed, etag, lastModified) {
  const contentHash = md5hash(parsed.content);
  const now = new Date().toISOString();

  const row = {
    service_key: entry.service_key,
    slug: entry.slug,
    title_de: parsed.title || entry.service_key,
    title_zh: null,
    summary_zh: null,
    requirements_zh: [],
    fees_zh: "",
    duration_zh: "",
    steps_zh: [],
    region_level: entry.region_level || source.region_level,
    region_name: entry.region_name || source.region_name,
    category: entry.category,
    tags: entry.tags || [],
    publisher: entry.publisher || source.publisher,
    source_url: entry.source_url,
    source_name: entry.source_name || source.publisher,
    content_hash: contentHash,
    last_fetched_at: now,
    translated: false,
    translated_at: null,
    updated_at: now,
  };

  // 检查是否需要插入
  const { data: existing } = await supabase
    .from(POLICY_TABLE)
    .select("id, content_hash, translated")
    .eq("service_key", entry.service_key)
    .single();

  if (existing && existing.content_hash === contentHash) {
    // 内容未变，只更新时间戳
    await supabase
      .from(POLICY_TABLE)
      .update({ last_fetched_at: now })
      .eq("service_key", entry.service_key);
    console.log(`  [SKIP] ${entry.service_key} — 内容未变化`);
    return { action: "skipped", service_key: entry.service_key };
  }

  // Upsert policy page
  const { data, error } = await supabase
    .from(POLICY_TABLE)
    .upsert(row, { onConflict: "service_key" })
    .select("id")
    .single();

  if (error) {
    console.error(`  [ERROR] Failed to upsert ${entry.service_key}: ${error.message}`);
    return { action: "error", service_key: entry.service_key, error: error.message };
  }

  // 如果是新增或内容有变化，加入翻译队列
  const isNew = !existing;
  const contentChanged = existing && existing.content_hash !== contentHash;

  if (isNew || contentChanged) {
    await supabase.from(QUEUE_TABLE).upsert({
      source_type: "policy",
      source_id: data.id,
      source_url: entry.source_url,
      priority: contentChanged ? 1 : 0,
      status: "pending",
    }).eq("source_type", "policy").eq("source_id", data.id);
    
    console.log(`  [${isNew ? "NEW" : "UPDATED"}] ${entry.service_key}${contentChanged ? " (内容变化，需重新翻译)" : ""}`);
    return { action: isNew ? "inserted" : "updated", service_key: entry.service_key };
  }

  return { action: "unchanged", service_key: entry.service_key };
}

// ─── 主流程 ───────────────────────────────────────────────
async function main() {
  console.log("=".repeat(60));
  console.log(`政策内容检查 — ${new Date().toISOString()}`);
  console.log(`模式: ${IS_FULL_SCRAPE ? "全量重爬" : "增量检测 (ETag)"}`);
  console.log("=".repeat(60));

  const stats = { processed: 0, inserted: 0, updated: 0, skipped: 0, errors: 0 };

  for (const source of POLICY_SOURCES) {
    console.log(`\n📂 ${source.source_name} (${source.entries.length} 条)`);

    for (const entry of source.entries) {
      stats.processed++;

      // 获取数据库中存储的 ETag
      let storedETag = null, storedLastModified = null;
      if (!IS_FULL_SCRAPE) {
        const { data: existing } = await supabase
          .from(POLICY_TABLE)
          .select("id")
          .eq("service_key", entry.service_key)
          .single();
        // ETag 存储在 last_fetched_at 字段的旁列我们改用 content_hash
        // 完整实现需要额外列存储 ETag，简化版用 content_hash 对比
      }

      const { status, etag, lastModified, body, changed, error } = await fetchWithETag(
        entry.source_url,
        storedETag,
        storedLastModified
      );

      if (error) {
        console.error(`  [NETWORK ERROR] ${entry.service_key}: ${error}`);
        stats.errors++;
        continue;
      }

      if (status === 304) {
        console.log(`  [304] ${entry.service_key} — 未变化`);
        stats.skipped++;
        continue;
      }

      if (status !== 200 || !body) {
        console.error(`  [HTTP ${status}] ${entry.service_key}`);
        stats.errors++;
        continue;
      }

      const parsed = parseHtmlBasic(body);
      if (!parsed.content || parsed.content.length < 100) {
        console.warn(`  [WARN] ${entry.service_key} — 内容过短，可能需要 JS 渲染`);
      }

      const result = await upsertPolicyPage(entry, source, parsed, etag, lastModified);
      if (result.action === "inserted") stats.inserted++;
      else if (result.action === "updated") stats.updated++;
      else if (result.action === "skipped") stats.skipped++;
      else if (result.action === "error") stats.errors++;

      // 礼貌延迟
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log("\n" + "=".repeat(60));
  console.log("汇总:");
  console.log(`  处理: ${stats.processed}`);
  console.log(`  新增: ${stats.inserted}`);
  console.log(`  更新: ${stats.updated}`);
  console.log(`  未变: ${stats.skipped}`);
  console.log(`  错误: ${stats.errors}`);
  console.log("=".repeat(60));
}

main().catch(err => {
  console.error("[FATAL]", err);
  process.exit(1);
});
