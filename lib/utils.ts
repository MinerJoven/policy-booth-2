import clsx, { type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(value?: string) {
  if (!value) {
    return "未注明";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  if (!year || !month || !day) {
    return value;
  }

  return `${Number(year)}年${Number(month)}月${Number(day)}日`;
}

export function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export function includesText(haystack: string, needle?: string) {
  if (!needle) {
    return true;
  }

  return normalizeText(haystack).includes(normalizeText(needle));
}

export function getSingleParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

export function toPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function encodeSegment(value: string) {
  return encodeURIComponent(value);
}

export function createSlug(value: string) {
  const normalized = normalizeText(value)
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "policy"}-${Date.now().toString(36)}`;
}
