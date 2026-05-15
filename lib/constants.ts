// ============================================================
// 政策展台 2.0 — 常量定义
// 对应 SPEC.md 3.5 / 3.6 节
// ============================================================

export const SITE_NAME = "政策展台 2.0";
export const SITE_DESCRIPTION = "面向在德华人的政策信息与就业资讯平台";

// --- 地区层级 ---
export const REGION_LEVELS = ["联邦", "州", "市", "Landkreis"] as const;

// --- 德国各州（中文名 -> 德语名映射）---
export const GERMAN_STATES_DISPLAY: { label: string; value: string }[] = [
  { label: "巴登-符腾堡", value: "Baden-Württemberg" },
  { label: "巴伐利亚",    value: "Bayern" },
  { label: "柏林",        value: "Berlin" },
  { label: "勃兰登堡",    value: "Brandenburg" },
  { label: "不来梅",      value: "Bremen" },
  { label: "汉堡",        value: "Hamburg" },
  { label: "黑森",        value: "Hessen" },
  { label: "梅克伦堡-前波美拉尼亚", value: "Mecklenburg-Vorpommern" },
  { label: "下萨克森",    value: "Niedersachsen" },
  { label: "北莱茵-威斯特法伦", value: "Nordrhein-Westfalen" },
  { label: "莱茵兰-普法尔茨", value: "Rheinland-Pfalz" },
  { label: "萨尔兰州",    value: "Saarland" },
  { label: "萨克森",      value: "Sachsen" },
  { label: "萨克森-安哈尔特", value: "Sachsen-Anhalt" },
  { label: "石勒苏益格-荷尔斯泰因", value: "Schleswig-Holstein" },
  { label: "图林根",      value: "Thüringen" },
];

// 兼容旧代码（德语名，用于 URL 参数值）
export const GERMAN_STATES = GERMAN_STATES_DISPLAY.map((s) => s.value);

// 州代码映射
export const STATE_CODE_MAP: Record<string, string> = {
  "Baden-Württemberg": "BW",
  "Bayern": "BY",
  "Berlin": "BE",
  "Brandenburg": "BB",
  "Bremen": "HB",
  "Hamburg": "HH",
  "Hessen": "HE",
  "Mecklenburg-Vorpommern": "MV",
  "Niedersachsen": "NI",
  "Nordrhein-Westfalen": "NW",
  "Rheinland-Pfalz": "RP",
  "Saarland": "SL",
  "Sachsen": "SN",
  "Sachsen-Anhalt": "ST",
  "Schleswig-Holstein": "SH",
  "Thüringen": "TH",
};

// --- 政策分类 ---
export const CATEGORIES = [
  { value: "居留与签证",   label: "居留与签证",   icon: "📋" },
  { value: "留学与大学",   label: "留学与大学",   icon: "🎓" },
  { value: "工作与蓝卡",   label: "工作与蓝卡",   icon: "💼" },
  { value: "入籍与长期居留", label: "入籍与长期居留", icon: "🏠" },
  { value: "税务与社保",   label: "税务与社保",   icon: "📊" },
  { value: "医保与保险",   label: "医保与保险",   icon: "🏥" },
  { value: "家庭与福利",   label: "家庭与福利",   icon: "👨‍👩‍👧" },
  { value: "交通与驾照",   label: "交通与驾照",   icon: "🚗" },
  { value: "宠物与犬税",   label: "宠物与犬税",   icon: "🐾" },
  { value: "生活行政",     label: "生活行政",     icon: "📬" },
  { value: "招聘信息",     label: "招聘信息",     icon: "💼" },
  { value: "其他",         label: "其他",         icon: "📌" },
] as const;

// --- 华人特有招聘标签 ---
export const JOB_TAGS = [
  // 语言要求
  { value: "需要中文",   label: "需要中文" },
  { value: "无语言要求", label: "无语言要求" },
  { value: "英语即可",   label: "英语即可" },
  // 适合人群
  { value: "留学生适合", label: "留学生适合" },
  { value: "华人优先",   label: "华人优先" },
  { value: "无经验可",   label: "无经验可" },
  // 工作条件
  { value: "远程可选",   label: "远程可选" },
  { value: "迷你岗",     label: "迷你岗" },
  { value: "实习岗",     label: "实习岗" },
  // 签证相关
  { value: "可办工作签证", label: "可办工作签证" },
  // 职业领域
  { value: "IT/技术",     label: "IT/技术" },
  { value: "餐饮/酒店",   label: "餐饮/酒店" },
  { value: "零售/销售",   label: "零售/销售" },
  { value: "制造/物流",   label: "制造/物流" },
  { value: "金融/会计",   label: "金融/会计" },
  { value: "教育/培训",   label: "教育/培训" },
  { value: "医疗/护理",   label: "医疗/护理" },
  { value: "行政/文员",   label: "行政/文员" },
  { value: "市场/传媒",   label: "市场/传媒" },
  { value: "工程/技术",   label: "工程/技术" },
  { value: "家政/服务",   label: "家政/服务" },
  { value: "客服/前台",   label: "客服/前台" },
] as const;

// --- 工作类型 ---
export const WORK_TYPES = [
  { value: "全职",    label: "全职",    arbeitszeit: "vz" },
  { value: "兼职",    label: "兼职",    arbeitszeit: "tz" },
  { value: "远程",    label: "远程",    arbeitszeit: "ho" },
  { value: "迷你岗",  label: "迷你岗",  arbeitszeit: "mj" },
  { value: "实习",    label: "实习",    arbeitszeit: "aa" },
] as const;

// arbeitszeit 值到标签的映射
export const WORK_TYPE_FROM_API: Record<string, string> = {
  "vz": "全职",
  "tz": "兼职",
  "ho": "远程",
  "mj": "迷你岗",
  "aa": "实习",
};

// --- 风险等级（保留，与旧版兼容）---
export type RiskLevel = "low" | "medium" | "high";

export const RISK_CONFIG: Record<RiskLevel, { label: string; tone: string; border: string }> = {
  low: {
    label: "低风险",
    tone: "bg-neutral-100 text-neutral-700 border-neutral-200",
    border: "border-l-neutral-400",
  },
  medium: {
    label: "中风险",
    tone: "bg-amber-50 text-amber-800 border-amber-200",
    border: "border-l-policy-gold",
  },
  high: {
    label: "高风险",
    tone: "bg-red-50 text-red-800 border-red-200",
    border: "border-l-policy-red",
  },
};

// --- REGIONS（兼容旧组件 + v2 新增）---
export const REGIONS = {
  federalLabel: "联邦",
  states: [
    "Baden-Württemberg", "Bayern", "Berlin", "Brandenburg",
    "Bremen", "Hamburg", "Hessen", "Mecklenburg-Vorpommern",
    "Niedersachsen", "Nordrhein-Westfalen", "Rheinland-Pfalz",
    "Saarland", "Sachsen", "Sachsen-Anhalt",
    "Schleswig-Holstein", "Thüringen",
  ],
  cities: ["Berlin", "München", "Hamburg", "Köln", "Stuttgart", "Frankfurt am Main"],
};

// --- TARGET_GROUPS（兼容旧组件）---
export const TARGET_GROUPS = [
  "留学生", "求职者", "工作签人群", "蓝卡人群",
  "自雇人士", "华人家庭", "新移民", "车主", "宠物主人", "可能相关",
] as const;

// --- 政策状态配置（兼容旧组件）---
export type PolicyStatus = "draft" | "published" | "unpublished" | "expired";

export const STATUS_CONFIG: Record<PolicyStatus, { label: string; tone: string }> = {
  draft:       { label: "草稿",     tone: "bg-neutral-100 text-neutral-700" },
  published:   { label: "已发布",   tone: "bg-emerald-50 text-emerald-800" },
  unpublished: { label: "已下架",   tone: "bg-stone-100 text-stone-700" },
  expired:     { label: "已过期",    tone: "bg-red-50 text-red-800" },
};

// --- 免责声明 ---
export const LEGAL_DISCLAIMER =
  "本站内容仅为德国官方公开信息的中文整理与辅助理解，不构成个案法律、税务、移民或其他专业建议。具体情况请以官方原文和相关机构答复为准。";

// --- BA Jobbörse API ---
export const BA_API_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4";
export const BA_API_KEY = "jobboerse-jobsuche"; // 固定公开值
