import fs from "node:fs";
import path from "node:path";

const DEFAULT_LIUZI_SUPABASE_URL = "https://naxlnlokfbfzqnswxmag.supabase.co";
const DEFAULT_LIUZI_PUBLISHABLE_KEY = "sb_publishable_jRxubM1Y_QSgbJw83Uz10Q_hug7V-tz";

export function loadPolicyEnv(root = process.cwd()) {
  for (const file of [".env.local", ".env", ".env.production", ".env.development"]) {
    loadEnvFile(path.join(root, file));
  }

  process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL || DEFAULT_LIUZI_SUPABASE_URL;
  process.env.SUPABASE_URL ||= process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||=
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    DEFAULT_LIUZI_PUBLISHABLE_KEY;
}

export function getPolicyEnvStatus() {
  return {
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    hasSupabaseSecret: Boolean(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY),
    hasMiniMaxKey: Boolean(process.env.MINIMAX_API_KEY || process.env.ANTHROPIC_API_KEY)
  };
}

export function assertPolicyWriteEnv() {
  const status = getPolicyEnvStatus();
  const missing = [];

  if (!status.supabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL");
  if (!status.hasSupabaseSecret) missing.push("SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new Error(`Missing required write environment variables: ${missing.join(", ")}`);
  }
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    process.env[key] = unquote(rawValue.trim());
  }
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).replace(/\\n/g, "\n");
  }

  return value.replace(/\s+#.*$/, "");
}
