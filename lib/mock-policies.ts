import type { Policy } from "@/lib/types";

export const mockPolicies: Policy[] = [
  {
    id: "policy-blue-card-demo",
    slug: "blue-card-salary-threshold-demo",
    titleZh: "蓝卡申请条件信息页更新（示例）",
    titleDe: "Blaue Karte EU: Informationen zu Voraussetzungen",
    publisher: "Make it in Germany",
    officialUrl: "https://www.make-it-in-germany.com/de/visum-aufenthalt/arten/blaue-karte-eu",
    publishedAt: "2026-04-22",
    effectiveAt: "2026-05-01",
    regionLevel: "联邦",
    regionName: "联邦",
    category: "工作与蓝卡",
    targetGroups: ["蓝卡人群", "工作签人群", "求职者"],
    summaryZh:
      "官方信息页对蓝卡申请条件说明进行更新，准备申请或续签蓝卡的人群应核对最新要求。",
    keyChanges: [
      "页面强调申请人需要结合岗位、学历和薪资条件综合核对。",
      "官方来源保留了蓝卡申请路径和常见问题入口。",
      "对已经在德国工作的申请人，仍建议以外管局个案答复为准。"
    ],
    userNotes:
      "如果你正在准备蓝卡申请材料，建议先从官方页面确认当前条件，再与雇主、外管局或专业人士核对个案材料。",
    impactZh:
      "这类信息通常影响准备申请蓝卡、转换工作签或评估工作合同条件的人群。不同城市外管局的材料清单可能存在差异。",
    contentZh:
      "这是一条用于项目演示的政策整理内容。蓝卡相关政策通常涉及职位、学历、薪资和居留目的等多个条件，用户不应只依据中文摘要判断自己是否符合条件。\n\n本站在详情页保留官方链接、发布时间、生效时间和风险提示，方便用户回到官方来源核验。对于正在递签、换签或续签的人，建议把官方说明作为信息入口，再结合外管局或专业人士答复进行确认。",
    contentDeSummary:
      "Die offizielle Informationsseite beschreibt Voraussetzungen und Verfahrenshinweise zur Blauen Karte EU.",
    riskLevel: "high",
    status: "published",
    viewCount: 1840,
    createdAt: "2026-04-22T10:00:00.000Z",
    updatedAt: "2026-04-24T09:30:00.000Z"
  },
  {
    id: "policy-naturalization-demo",
    slug: "naturalization-law-process-demo",
    titleZh: "入籍流程官方说明更新（示例）",
    titleDe: "Informationen zur Einbürgerung",
    publisher: "Bundesamt für Migration und Flüchtlinge",
    officialUrl: "https://www.bamf.de/DE/Themen/Integration/ZugewanderteTeilnehmende/Einbuergerung/einbuergerung-node.html",
    publishedAt: "2026-04-12",
    regionLevel: "联邦",
    regionName: "联邦",
    category: "入籍与长期居留",
    targetGroups: ["新移民", "工作签人群", "蓝卡人群", "华人家庭"],
    summaryZh:
      "官方入籍说明页提供申请条件、流程和咨询入口，准备入籍的人群应以所在地主管机构要求为准。",
    keyChanges: [
      "页面集中列出入籍主题的官方信息入口。",
      "不同城市或 Landkreis 的预约与材料流程仍可能不同。",
      "涉及居留年限、语言、经济能力等条件时，需要逐项核对。"
    ],
    userNotes:
      "如果你正在计划入籍，建议先确认自己所在地的主管机构，再核对官方材料清单和预约规则。",
    impactZh:
      "这类内容可能影响准备入籍、永居后规划身份转换、或为家庭成员查询入籍路径的人群。",
    contentZh:
      "这是一条用于项目演示的政策整理内容。入籍政策通常具有较高个案差异，中文整理只能帮助用户理解官方信息结构，不能替代主管机构审核。\n\n详情页的重点不是判断用户一定能否入籍，而是展示官方来源、关键条件维度、用户可能需要注意的流程差异，以及高风险免责声明。",
    contentDeSummary:
      "Die BAMF-Seite verweist auf allgemeine Informationen und zuständige Stellen zur Einbürgerung.",
    riskLevel: "high",
    status: "published",
    viewCount: 1320,
    createdAt: "2026-04-12T08:00:00.000Z",
    updatedAt: "2026-04-13T11:20:00.000Z"
  },
  {
    id: "policy-stuttgart-appointment-demo",
    slug: "stuttgart-residence-appointment-demo",
    titleZh: "Stuttgart 外管局预约流程说明更新（示例）",
    titleDe: "Terminvereinbarung bei der Ausländerbehörde Stuttgart",
    publisher: "Landeshauptstadt Stuttgart",
    officialUrl: "https://www.stuttgart.de",
    publishedAt: "2026-03-28",
    regionLevel: "市",
    regionName: "Stuttgart",
    category: "居留与签证",
    targetGroups: ["留学生", "工作签人群", "新移民"],
    summaryZh:
      "Stuttgart 市级办事信息页说明外管局预约入口，相关人群应留意材料和预约渠道变化。",
    keyChanges: [
      "市级页面集中展示预约和联系入口。",
      "居留类业务通常需要提前准备身份证明、居住证明和申请材料。",
      "具体材料以办理事项和外管局答复为准。"
    ],
    userNotes:
      "市级外管局流程变化对预约时间和材料准备影响较大，建议在提交申请前再次核对官方页面。",
    impactZh:
      "可能影响在 Stuttgart 办理学生居留、工作居留、家庭团聚或地址相关手续的人。",
    contentZh:
      "这是一条用于项目演示的市级政策整理内容。德国居留相关办事流程常常由所在城市或 Landkreis 具体执行，因此同一联邦政策在不同地区可能对应不同材料清单和预约入口。\n\n页面设计需要把地区层级、适用地区、官方来源和风险提示放在醒目位置，帮助用户知道这条内容是否与自己所在地相关。",
    contentDeSummary:
      "Die städtische Seite verweist auf Termin- und Kontaktinformationen der Ausländerbehörde.",
    riskLevel: "high",
    status: "published",
    viewCount: 920,
    createdAt: "2026-03-28T14:10:00.000Z",
    updatedAt: "2026-04-01T12:00:00.000Z"
  },
  {
    id: "policy-deutschlandticket-demo",
    slug: "deutschlandticket-price-notice-demo",
    titleZh: "Deutschlandticket 票价信息说明（示例）",
    titleDe: "Informationen zum Deutschlandticket",
    publisher: "Bundesministerium für Verkehr",
    officialUrl: "https://www.bmv.de",
    publishedAt: "2026-04-05",
    effectiveAt: "2026-04-15",
    regionLevel: "联邦",
    regionName: "联邦",
    category: "交通与驾照",
    targetGroups: ["留学生", "求职者", "华人家庭", "车主"],
    summaryZh:
      "交通票务信息页说明 Deutschlandticket 的使用范围和订阅入口，通勤用户可关注票价和取消规则。",
    keyChanges: [
      "信息页强调订阅制票务的适用范围。",
      "用户应留意所属交通公司设置的购买和取消时间。",
      "区域性补贴或学生优惠可能由州或高校单独说明。"
    ],
    userNotes:
      "如果你使用 Deutschlandticket 通勤，重点关注订阅取消期限、适用交通范围和本地交通公司的说明。",
    impactZh:
      "通常影响日常通勤、跨城市出行、学生交通票和家庭出行预算。",
    contentZh:
      "这是一条用于项目演示的低风险信息类内容。交通票务政策通常不涉及居留或法律身份判断，但仍可能影响用户的日常开销和出行安排。\n\n页面需要用更短的段落展示适用范围、发布时间、生效时间和官方链接，避免用户从社交平台二手信息中误解订阅规则。",
    contentDeSummary:
      "Die Informationsseite beschreibt Nutzung, Abo-Modell und Hinweise zum Deutschlandticket.",
    riskLevel: "low",
    status: "published",
    viewCount: 760,
    createdAt: "2026-04-05T09:00:00.000Z",
    updatedAt: "2026-04-05T09:00:00.000Z"
  },
  {
    id: "policy-berlin-dog-tax-demo",
    slug: "berlin-hundesteuer-registration-demo",
    titleZh: "Berlin 犬税登记入口说明（示例）",
    titleDe: "Hundesteuer in Berlin",
    publisher: "Berlin.de",
    officialUrl: "https://service.berlin.de",
    publishedAt: "2026-02-18",
    regionLevel: "州",
    regionName: "Berlin",
    category: "宠物与犬税",
    targetGroups: ["宠物主人", "新移民"],
    summaryZh:
      "Berlin 官方服务页面说明养犬登记和犬税办理入口，宠物主人应关注登记期限和费用信息。",
    keyChanges: [
      "州级服务页面提供犬税办理入口。",
      "宠物主人通常需要按所在地规则完成登记。",
      "迁入、迁出或不再养犬时可能需要更新信息。"
    ],
    userNotes:
      "如果你在 Berlin 养犬，建议核对登记时间、费用、减免条件和变更申报方式。",
    impactZh:
      "主要影响在 Berlin 养犬、刚迁入 Berlin 或准备领养犬只的人。",
    contentZh:
      "这是一条用于项目演示的生活行政内容。犬税属于地方规则，用户最需要确认的是自己所在地区是否适用、何时登记、如何申报变更。\n\n详情页需要清楚显示地区层级和适用地区，避免用户把 Berlin 的流程误用到其他城市。",
    contentDeSummary:
      "Die Berliner Serviceseite verweist auf Anmeldung, Abmeldung und Hinweise zur Hundesteuer.",
    riskLevel: "medium",
    status: "published",
    viewCount: 410,
    createdAt: "2026-02-18T13:15:00.000Z",
    updatedAt: "2026-03-03T10:45:00.000Z"
  },
  {
    id: "policy-parental-benefit-demo",
    slug: "elterngeld-digital-application-demo",
    titleZh: "父母金线上申请信息说明（示例）",
    titleDe: "ElterngeldDigital",
    publisher: "Bundesministerium für Familie, Senioren, Frauen und Jugend",
    officialUrl: "https://familienportal.de",
    publishedAt: "2026-01-25",
    regionLevel: "联邦",
    regionName: "联邦",
    category: "家庭与福利",
    targetGroups: ["华人家庭", "新移民"],
    summaryZh:
      "家庭部信息页说明父母金线上申请入口，准备生育或育儿的家庭可关注申请流程和材料。",
    keyChanges: [
      "官方入口集中说明父母金相关服务。",
      "线上申请可用范围可能因州而异。",
      "申请金额和资格通常需要结合收入、居住状态和家庭情况判断。"
    ],
    userNotes:
      "如果你准备申请父母金，建议先确认所在州是否支持线上流程，再核对材料和截止时间。",
    impactZh:
      "可能影响在德生育、育儿、计划休 Elternzeit 或查询家庭福利的华人家庭。",
    contentZh:
      "这是一条用于项目演示的中风险内容。家庭福利通常与居住状态、工作状态、收入和所在地服务入口有关，中文整理应帮助用户理解流程入口，而不是给出金额或资格结论。\n\n项目页面需要突出官方来源和用户注意事项，尤其是截止时间、材料准备和州级差异。",
    contentDeSummary:
      "Das Familienportal verweist auf Informationen und digitale Dienste zum Elterngeld.",
    riskLevel: "medium",
    status: "published",
    viewCount: 680,
    createdAt: "2026-01-25T16:00:00.000Z",
    updatedAt: "2026-01-26T10:10:00.000Z"
  },
  {
    id: "policy-expired-demo",
    slug: "old-student-visa-notice-demo",
    titleZh: "旧版学生居留材料说明（已过期示例）",
    titleDe: "Alte Hinweise zum Aufenthaltstitel für Studierende",
    publisher: "示例城市外管局",
    officialUrl: "https://example.com",
    publishedAt: "2025-11-10",
    effectiveAt: "2025-12-01",
    regionLevel: "市",
    regionName: "München",
    category: "留学与大学",
    targetGroups: ["留学生"],
    summaryZh:
      "这条示例内容用于展示过期政策提示，不应作为当前办事依据。",
    keyChanges: [
      "旧版材料说明已被新版流程替代。",
      "详情页应展示过期 Banner，而不是直接 404。",
      "相关政策推荐会引导用户查看同类新内容。"
    ],
    userNotes:
      "这条内容仅用于演示过期状态处理。办理学生居留应查看最新官方页面。",
    impactZh:
      "用于验证已过期政策的展示逻辑。",
    contentZh:
      "这是一条已过期的演示内容，用于测试状态机和详情页提示。用户进入旧链接时，页面需要明确说明该内容不再作为当前参考。",
    riskLevel: "high",
    status: "expired",
    supersededBy: "policy-stuttgart-appointment-demo",
    viewCount: 210,
    createdAt: "2025-11-10T09:00:00.000Z",
    updatedAt: "2026-03-30T09:00:00.000Z"
  }
];
