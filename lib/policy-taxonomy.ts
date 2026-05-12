import { CATEGORIES, REGIONS, TARGET_GROUPS } from "@/lib/constants";
import type { Policy, RegionLevel } from "@/lib/types";

type TaxonomyInput = {
  titleZh?: string;
  titleDe?: string;
  category?: string;
  targetGroups?: string[];
  summaryZh?: string;
  keyChanges?: string[];
  userNotes?: string;
  impactZh?: string;
  contentZh?: string;
  contentDeSummary?: string;
  regionLevel?: string;
  regionName?: string;
};

type RegionAlias = {
  name: string;
  state: string;
  level: RegionLevel;
  patterns: RegExp[];
};

export type RegionGroup = {
  state: string;
  cities: string[];
};

const CATEGORY_VALUES = CATEGORIES.map((category) => category.value) as readonly string[];
const TARGET_VALUES = TARGET_GROUPS.map((group) => group) as readonly string[];

const REGION_ALIASES: RegionAlias[] = [
  {
    name: "Stuttgart",
    state: "Baden-Württemberg",
    level: "市",
    patterns: [/stuttgart/i, /斯图加特/]
  },
  {
    name: "Landkreis Ludwigsburg",
    state: "Baden-Württemberg",
    level: "Landkreis",
    patterns: [/ludwigsburg/i, /路德维希堡/]
  },
  {
    name: "Baden-Württemberg",
    state: "Baden-Württemberg",
    level: "州",
    patterns: [/baden[-\s]?w/i, /巴登|符腾堡|符騰堡/]
  },
  {
    name: "Bayern",
    state: "Bayern",
    level: "州",
    patterns: [/bayern|bavaria/i, /巴伐利亚|巴伐利亞/]
  },
  {
    name: "Berlin",
    state: "Berlin",
    level: "州",
    patterns: [/berlin/i, /柏林/]
  },
  {
    name: "Hessen",
    state: "Hessen",
    level: "州",
    patterns: [/hessen|hessian/i, /黑森/]
  },
  {
    name: "Schleswig-Holstein",
    state: "Schleswig-Holstein",
    level: "州",
    patterns: [/schleswig[-\s]?holstein/i, /石勒苏益格|荷尔斯泰因/]
  }
];

export function normalizePolicyForDisplay(policy: Policy): Policy {
  const normalizedRegionLevel = normalizeRegionLevel(policy.regionLevel, policy.regionName);

  return {
    ...policy,
    regionLevel: normalizedRegionLevel,
    regionName: normalizeRegionName(policy.regionName, normalizedRegionLevel),
    category: inferPolicyCategory(policy),
    targetGroups: inferTargetGroups(policy)
  };
}

export function inferPolicyCategory(input: TaxonomyInput) {
  const text = getTaxonomyText(input);

  if (hasAny(text, ["入籍", "国籍", "永居", "长期居留", "永久居留", "naturalization", "einbürger", "niederlassung"])) {
    return "入籍与长期居留";
  }

  if (hasAny(text, ["签证", "居留", "外管局", "aufenthalt", "ausländer", "residence permit", "蓝卡申请"])) {
    return "居留与签证";
  }

  if (hasAny(text, ["蓝卡", "工作签", "就业", "求职", "雇员", "工人", "jobcenter", "arbeits", "employment"])) {
    return "工作与蓝卡";
  }

  if (hasAny(text, ["大学", "高校", "学生签", "留学", "注册", "学校", "教育", "kita", "schule", "student", "university"])) {
    return "留学与大学";
  }

  if (hasAny(text, ["医保", "医疗", "医院", "护理", "急救", "保险", "health", "kranken", "pflege", "rettungsdienst"])) {
    return "医保与保险";
  }

  if (hasAny(text, ["家庭", "儿童", "父母", "子女", "托儿", "幼儿", "福利", "儿童金", "父母金", "庇护", "无家可归", "familien", "kind", "kinder"])) {
    return "家庭与福利";
  }

  if (hasAny(text, ["税", "社保", "费用", "财政", "预算", "纳税", "steuer", "gebühr", "haushalt"])) {
    return "税务与社保";
  }

  if (hasAny(text, ["交通", "驾照", "驾驶", "车辆", "停车", "公交", "自行车", "道路", "隧道", "出行", "verkehr", "führerschein", "straße", "tunnel"])) {
    return "交通与驾照";
  }

  if (hasAny(text, ["宠物", "犬税", "动物", "猫", "狗", "爬行", "蛇", "hund", "reptil"])) {
    return "宠物与犬税";
  }

  if (hasAny(text, ["预约", "登记", "市民服务", "办事", "公共服务", "住房", "租房", "供水", "警报", "数字化", "行政", "wohnen", "bürger", "verwaltung"])) {
    return "生活行政";
  }

  return "其他";
}

export function inferTargetGroups(input: TaxonomyInput) {
  const normalized = new Set<string>();
  const text = getTaxonomyText(input);
  const category = inferPolicyCategory(input);

  if (hasAny(text, ["学生", "大学", "高校", "学校", "留学", "student", "schule", "university"])) normalized.add("留学生");
  if (hasAny(text, ["求职", "招聘", "就业", "jobcenter", "arbeitslos", "bewerbung"])) normalized.add("求职者");
  if (hasAny(text, ["工作签", "雇员", "就业", "工人", "arbeits", "employment"])) normalized.add("工作签人群");
  if (hasAny(text, ["蓝卡", "blue card", "blaue karte"])) normalized.add("蓝卡人群");
  if (hasAny(text, ["自雇", "创业", "自由职业", "企业主", "freiberuf", "startup"])) normalized.add("自雇人士");
  if (hasAny(text, ["家庭", "儿童", "父母", "子女", "幼儿", "kita", "kind", "familie"])) normalized.add("华人家庭");
  if (hasAny(text, ["新移民", "外籍", "移民", "居留", "入籍", "ausländer", "aufenthalt"])) normalized.add("新移民");
  if (hasAny(text, ["车主", "驾驶", "驾照", "车辆", "停车", "隧道", "道路", "机动车", "verkehr", "führerschein", "tunnel"])) normalized.add("车主");
  if (hasAny(text, ["宠物", "犬", "动物", "爬行", "蛇", "猫", "狗", "hund", "reptil"])) normalized.add("宠物主人");

  if (category === "留学与大学") normalized.add("留学生");
  if (category === "入籍与长期居留" || category === "居留与签证") normalized.add("新移民");
  if (category === "工作与蓝卡") normalized.add(hasAny(text, ["蓝卡", "blue card", "blaue karte"]) ? "蓝卡人群" : "工作签人群");
  if (category === "家庭与福利") normalized.add("华人家庭");
  if (category === "交通与驾照") normalized.add("车主");
  if (category === "宠物与犬税") normalized.add("宠物主人");

  if (normalized.size === 0) normalized.add("可能相关");
  return [...normalized];
}

export function normalizeRegionName(regionName: string, regionLevel?: string) {
  if (regionLevel === "联邦" || hasAny(normalizeLookup(regionName), ["deutschland", "bund", "联邦"])) {
    return REGIONS.federalLabel;
  }

  return findRegionAlias(regionName)?.name ?? clean(regionName);
}

export function normalizeRegionLevel(regionLevel: string, regionName: string): RegionLevel {
  if (regionLevel === "联邦" || regionLevel === "州" || regionLevel === "市" || regionLevel === "Landkreis") {
    return regionLevel;
  }

  const alias = findRegionAlias(regionName);
  return alias?.level ?? "州";
}

export function getStateForRegion(regionName: string, regionLevel?: string) {
  if (regionLevel === "联邦") return REGIONS.federalLabel;
  return findRegionAlias(regionName)?.state ?? normalizeRegionName(regionName, regionLevel);
}

export function matchesRegionName(policy: Policy, regionName: string) {
  const wanted = normalizeRegionName(regionName);
  const ownRegion = normalizeRegionName(policy.regionName, policy.regionLevel);
  const ownState = getStateForRegion(policy.regionName, policy.regionLevel);

  return ownRegion === wanted || ownState === wanted;
}

export function getRegionGroups(policies: Policy[]): RegionGroup[] {
  const groups = new Map<string, Set<string>>();

  for (const policy of policies) {
    if (policy.regionLevel === "联邦") continue;

    const state = getStateForRegion(policy.regionName, policy.regionLevel);
    const region = normalizeRegionName(policy.regionName, policy.regionLevel);

    if (!groups.has(state)) groups.set(state, new Set());
    if (region !== state) groups.get(state)?.add(region);
  }

  const stateOrder = new Map(REGIONS.states.map((state, index) => [state, index]));
  return [...groups.entries()]
    .map(([state, cities]) => ({ state, cities: [...cities].sort((a, b) => a.localeCompare(b, "de")) }))
    .sort((a, b) => (stateOrder.get(a.state) ?? 999) - (stateOrder.get(b.state) ?? 999) || a.state.localeCompare(b.state, "de"));
}

function findRegionAlias(regionName: string) {
  const text = normalizeLookup(regionName);
  return REGION_ALIASES.find((alias) => alias.patterns.some((pattern) => pattern.test(text)));
}

function getTaxonomyText(input: TaxonomyInput) {
  return normalizeLookup(
    [
      input.titleZh,
      input.titleDe,
      input.summaryZh,
      ...(input.keyChanges ?? []),
      input.contentDeSummary
    ]
      .filter(Boolean)
      .join(" ")
  );
}

function hasAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(normalizeLookup(needle)));
}

function normalizeLookup(value: string) {
  return clean(value)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/不涉及.{0,36}(居留|签证|移民|税务|工作|法律|权益|专业建议)[^。.!?]*/g, " ")
    .replace(/不构成.{0,36}(法律|税务|移民|专业建议)[^。.!?]*/g, " ")
    .replace(/\s+/g, " ");
}

function clean(value?: string) {
  return typeof value === "string" ? value.trim() : "";
}
