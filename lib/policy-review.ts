import crypto from "node:crypto";
import { generateMiniMaxText } from "@/lib/minimax";

export type PolicyReviewStatus =
  | "ok"
  | "needs_update"
  | "source_changed"
  | "source_unreachable"
  | "not_policy"
  | "uncertain";

export type PolicyReviewAction = "keep" | "update" | "unpublish" | "manual_check";

export type PolicyReviewInput = {
  id: string;
  slug: string;
  title_zh: string;
  title_de: string;
  publisher: string;
  official_url: string;
  published_at: string;
  effective_at: string | null;
  region_level: string;
  region_name: string;
  category: string;
  target_groups: string[];
  summary_zh: string;
  key_changes: string[];
  user_notes: string;
  impact_zh: string;
  content_zh: string;
  content_de_summary: string | null;
  risk_level: string;
  status: string;
};

export type PolicyReviewResult = {
  reviewStatus: PolicyReviewStatus;
  confidence: number;
  findings: string[];
  suggestedAction: PolicyReviewAction;
  reviewSummary: string;
  updatedFields: Record<string, unknown>;
  sourceHash: string;
  model: string;
};

export async function runPolicyAiReview(policy: PolicyReviewInput): Promise<PolicyReviewResult> {
  const articleText = await getArticleText(policy.official_url);
  const sourceHash = crypto.createHash("sha256").update(articleText).digest("hex");
  const prompt = [
    "请对一条已经入库的德国官方政策中文整理做 AI 自动复核。",
    "目标：一次请求内同时完成事实核对、时效性判断、来源可用性判断和是否适合继续展示的判断。",
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
    JSON.stringify(toPromptPolicy(policy), null, 2),
    "",
    "最新抓取的官方原文正文：",
    articleText.slice(0, 30000)
  ].join("\n");

  const text = await generateMiniMaxText({
    prompt,
    maxTokens: 4200,
    temperature: 0,
    system: "你是严谨的德国官方政策中文整理复核员，只基于官方原文和已入库内容输出结构化 JSON。"
  });

  const parsed = JSON.parse(extractJson(text));
  return {
    reviewStatus: normalizeReviewStatus(parsed.reviewStatus),
    confidence: normalizeConfidence(parsed.confidence),
    findings: arrayOr(parsed.findings, []),
    suggestedAction: normalizeSuggestedAction(parsed.suggestedAction),
    reviewSummary: stringOr(parsed.reviewSummary, "AI 复核完成。"),
    updatedFields: parsed.updatedFields && typeof parsed.updatedFields === "object" ? parsed.updatedFields : {},
    sourceHash,
    model: process.env.MINIMAX_MODEL ?? "MiniMax-M2.7"
  };
}

export function toReviewRecord(policy: PolicyReviewInput, review: PolicyReviewResult) {
  return {
    policy_id: policy.id,
    policy_slug: policy.slug,
    official_url: policy.official_url,
    review_status: review.reviewStatus,
    confidence: review.confidence,
    findings: review.findings,
    suggested_action: review.suggestedAction,
    review_summary: review.reviewSummary,
    reviewed_model: review.model,
    source_hash: review.sourceHash || null,
    payload: review
  };
}

async function getArticleText(url: string) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(45000),
    headers: {
      "User-Agent": "de-policy-stage/0.1 policy AI review"
    }
  });

  if (!response.ok) {
    throw new Error(`Fetch failed ${response.status} for ${url}`);
  }

  return extractReadableText(await response.text());
}

function toPromptPolicy(policy: PolicyReviewInput) {
  return {
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
  };
}

function extractReadableText(html: string) {
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

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : value;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`MiniMax did not return JSON: ${value.slice(0, 300)}`);
  }
  return raw.slice(start, end + 1);
}

function normalizeReviewStatus(value: unknown): PolicyReviewStatus {
  return ["ok", "needs_update", "source_changed", "source_unreachable", "not_policy", "uncertain"].includes(
    String(value)
  )
    ? (value as PolicyReviewStatus)
    : "uncertain";
}

function normalizeSuggestedAction(value: unknown): PolicyReviewAction {
  return ["keep", "update", "unpublish", "manual_check"].includes(String(value))
    ? (value as PolicyReviewAction)
    : "manual_check";
}

function normalizeConfidence(value: unknown) {
  const number = Number.parseFloat(String(value));
  if (Number.isNaN(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function arrayOr(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const cleaned = value.map((item) => String(item).trim()).filter(Boolean);
    return cleaned.length > 0 ? cleaned : fallback;
  }
  return fallback;
}

function stringOr(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  return text || fallback;
}

function stripTags(value: string) {
  return value.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").replace(/<[^>]*>/g, " ");
}

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}
