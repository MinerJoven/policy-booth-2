# 政策展台 2.0 — 政策核心内容重建计划

> 目标：停止新闻采集，按开发文档重建 80-120 条办事指南型政策内容
> 参考：`德区政策展台_技术开发文档_v1.0.docx` · `SPEC.md`
> 状态：DE 新闻 pipeline 已暂停 ✅ · 5 个来源全部采集完成 ✅ · 前端已切换至 v2 数据源 ✅ · Phase 3 + Finanztip ✅

99 条记录已上线（https://policy-booth-2.vercel.app）

---

## 架构回顾

```
                ┌──────────────────┐
                │  政策采集（新）      │  ← Phase 1-3
                │  BeautifulSoup     │
                │  ETag 增量检测     │
                └────────┬─────────┘
                         ▼
                ┌──────────────────┐
                │  policy_pages 表   │  ← 已有，空表
                │  requirements_zh  │     字段对齐开发文档
                │  fees_zh          │
                │  duration_zh      │
                │  steps_zh         │
                └────────┬─────────┘
                         ▼
                ┌──────────────────┐
                │  AI 结构化提炼      │  ← DeepSeek V4-Flash
                │  非翻译，而是提炼      │     从原文提取办事指南
                └────────┬─────────┘
                         ▼
                ┌──────────────────┐
                │  前端 v2 (已有)     │  ← lib/data-v2.ts
                │  PolicyV2 组件     │     切换数据源即可
                └──────────────────┘
```

---

## Phase 0：清理与准备（~1 小时）

### 0.1 ✅ 已做
- 暂停 DE 新闻 cron（job_id: `0ade5b3db6b8`）

### 0.2 处理 874 条新闻数据
- 方案：从 `policy_booth_policies` 表删除或标记 `status = 'archived'`
- 前端主页不再显示"当前数据源：Liuzi Supabase"
- 删除 `de-policy-stage` 项目（Vercel 部署 + 本地代码）

### 0.3 验证 policy_pages 表
- 表已存在，字段对齐 ✅
- 确认 RLS 策略允许 anon key 读
- 确认 `getV2PolicyTableName()` 返回 `policy_pages`

---

## Phase 1：核心政策采集（P0 来源）~ 2-3 天

### 1.1 Make-it-in-Germany（联邦劳动部）— 最优先

**URL**: `https://www.make-it-in-germany.com/`

**内容范围**（开发文档 Table 4）：

| 主题 | 对应条目 |
|------|---------|
| 签证类型 | 找工作签证、就业居留、蓝卡、IT专家签证 |
| 居留许可 | 就业居留延期、家庭团聚、永居申请 |
| 就业许可 | 职业资质认证、语言要求、劳动许可 |
| 职业机会 | 行业概况、薪资水平、求职技巧 |

**采集方式**: `BeautifulSoup`（静态页面，结构稳定）
**条目数**: 约 20-25 条
**更新频率**: 月度（ETag 检测）

### 1.2 BAMF 联邦移民局

**URL**: `https://www.bamf.de/`

**内容范围**：

| 主题 | 对应条目 |
|------|---------|
| 居留分类 | Aufenthaltstitel 类型、Niederlassungserlaubnis、Erlaubnis zum Daueraufenthalt-EU |
| 融合课程 | 德语课程、Orientation course、费用减免 |
| 避难相关 | Asylverfahren（非面向华人但需覆盖） |

**采集方式**: `BeautifulSoup` + 部分 PDF 提取
**条目数**: 约 20-25 条
**更新频率**: 月度

### 1.3 DAAD 德国学术交流中心

**URL**: `https://www.daad.de/`

**内容范围**：

| 主题 | 对应条目 |
|------|---------|
| 留学签证 | Student visa、Studienvorbereitung |
| 学生居留 | Aufenthaltserlaubnis für Studium |
| 奖学金 | DAAD scholarship 类型与申请 |
| 打工许可 | Studentische Nebentätigkeit 规定 |

**采集方式**: `BeautifulSoup`
**条目数**: 约 15-20 条
**更新频率**: 月度

### 1.4 采集脚本架构

每个来源一个独立 Python 脚本，放在 `/home/joven/policy-booth-2/scripts/python/policy/` 下：

```
scripts/python/policy/
├── __init__.py
├── base_scraper.py           # 基类：HTTP 请求、ETag 检测、HTML 清理
├── scraper_make_it_in_germany.py
├── scraper_bamf.py
├── scraper_daad.py
├── run_policy_collection.py   # 主入口：顺序执行所有 scraper
└── prompts/
    └── extract_guide.yaml     # DeepSeek 提炼 prompt
```

#### ETag 变更检测（核心省钱逻辑）

```python
def fetch_with_etag(url: str, stored_etag: str | None) -> tuple[str | None, str | None, bool]:
    """
    返回: (html_content, new_etag, has_changed)
    如果 304 → return (None, stored_etag, False)
    """
    headers = {"User-Agent": "policy-booth-2/1.0"}
    if stored_etag:
        headers["If-None-Match"] = stored_etag
    resp = requests.get(url, headers=headers)
    if resp.status_code == 304:
        return None, stored_etag, False
    return resp.text, resp.headers.get("ETag"), True
```

---

## Phase 2：AI 结构化提炼（~1 天）

### 2.1 不是"翻译"，而是"提炼办事指南"

原始开发文档明确要求：

> **Prompt 要求 AI 以 JSON 格式输出五个字段**：
> - `summary_zh`：300字摘要
> - `requirements_zh`：材料列表
> - `fees_zh`：费用
> - `duration_zh`：时限
> - `steps_zh`：步骤
>
> 明确要求「**用自己的话概括，不复制原文**」

### 2.2 DeepSeek Prompt 设计

```
你是一个德国办事指南编写助手。
你收到的是德国官方政策原文（德语/英语）。
请从中提取办事指南信息，以 JSON 格式输出：

{
  "title_zh": "中文标题（15字以内，清晰表达主题）",
  "title_de": "原始德文标题",
  "summary_zh": "300字以内中文摘要（告诉用户这是什么、谁需要、需做什么）",
  "requirements_zh": ["所需材料1", "所需材料2", ...],
  "fees_zh": "费用说明，如'约100-140欧元'",
  "duration_zh": "办理时限，如'通常4-8周'",
  "steps_zh": ["步骤1: ...", "步骤2: ...", ...],
  "category": "居留与签证 / 留学与大学 / 工作与蓝卡 / ...",
  "tags": ["相关标签1", "标签2"],
  "target_groups": ["留学生", "工作签人群", ...]
}

规则：
- 用自己的话概括，不要复制原文段落
- 不确定的字段设为空字符串或空数组
- 材料清单（requirements_zh）只列官方明确要求的材料
```

### 2.3 批量处理 Worker

复用现有的 `translate_jobs_batch.py` 模式：
- 查 `policy_pages WHERE translated=false`
- 每批 5 条，调用 DeepSeek
- 回写结构化字段 + `translated=true`

### 2.4 质量控制

首次采集完成后，人工抽查 10-15 条核心条目：
- 材料清单是否完整
- 费用数字是否正确
- 步骤是否可执行
- 分类是否准确

---

## Phase 3：扩展来源（P1）+ 本地化 — 已完成 ✅

### 3.1 Auswärtiges Amt 签证内容 ✅
- 采集 13 条签证/领事政策页面
- 包含：签证申请总览、申根协议、入境要求、国际婚姻、文件公证/认证、文件国际认可、庇护法、德国概况、德国国籍、签证FAQ等
- 静态页面，BeautifulSoup 直连
- 爬虫：`scripts/python/policy/scraper_aa.py`

### 3.2 Your Europe（欧盟）❌ — 不可用
- Your Europe 已全面转型为 AI 搜索门户，几乎所有子页面重定向到首页
- 仅 Professional qualifications 页面有静态内容（1,643 chars），不足以建立独立爬虫
- 替代方案：可通过 Make-it-in-Germany（已采集 32 条）和 Auswärtiges Amt（13 条补全 EU 内容）

### 3.3 Finanztip 消费者理财指南 ✅
- 采集 10 条实用指南页面
- 覆盖四大缺口分类：
  - **税务与社保**: 个人所得税、报税指南（新增分类 🆕）
  - **医保与保险**: 医疗保险、责任险、法律险
  - **家庭与福利**: 住房补贴、儿童金、父母金
  - **生活行政**: 活期账户、信用卡选择
- 静态 HTML，BeautifulSoup 直连
- 爬虫：`scripts/python/policy/scraper_finanztip.py`

### 3.4 各市 Ausländerbehörde（可暂缓）
- 本地材料清单、预约流程、费用
- Playwright JS 渲染
- 约 10 条（覆盖主要城市）

---

## Phase 4：前端切换 + 部署（~1 天）

### 4.1 切换数据源

当前：
```
app/(public)/policies/page.tsx        → lib/data.ts (v1 → policy_booth_policies)
app/(public)/policies/[slug]/page.tsx → lib/data.ts
app/(public)/page.tsx                 → lib/data.ts (首页政策卡片)
```

改为：
```
→ lib/data-v2.ts (v2 → policy_pages)
```

**关键**：`data-v2.ts` 已有 `listPoliciesData()` 和 `getPolicyBySlugData()`，函数名和 v1 一样，切换代价小。

### 4.2 更新 PolicyDetail 组件

当前 `PolicyDetail` 展示 v1 字段（`contentZh`, `officialUrl`, `riskLevel`, `status`）。

需要增加 v2 独有的**办事指南区块**：

```
┌─────────────────────────────────┐
│  所需材料                        │
│  ┌── ✅ 有效护照                │
│  ├── ✅ 大学学位证书             │
│  ├── ✅ 工作合同                 │
│  └── ✅ 健康保险证明              │
│                                  │
│  费用: 约 100-140 欧元           │
│  时长: 通常 4-8 周               │
│                                  │
│  办理步骤                         │
│  1. 与雇主签订工作合同             │
│  2. 准备上述材料                  │
│  3. 向当地外管局提交申请           │
│  4. 等待审核（约4周）             │
└─────────────────────────────────┘
```

### 4.3 更新 PolicyCard 组件

- 不再展示 `contentZh` 截断（v1 自由文本）
- 改为展示 `summary_zh` + 底部显示材料数量/费用/时限等关键信息

### 4.4 部署

```bash
cd /home/joven/policy-booth-2
npx vercel --prod --yes
```

---

## 时间线估计

| 阶段 | 内容 | 预估时间 |
|------|------|---------|
| **Phase 0** | 清理数据、验证表结构 | 1 小时 |
| **Phase 1** | 3 个 P0 来源的 scraping 脚本 | 2-3 天 |
| **Phase 2** | AI 提炼 prompt + 批量翻译 worker | 1 天 |
| **Phase 3** | Auswärtiges Amt + Your Europe | 1 天（AA可用 ✅ / Your Europe 不可用 ❌） |
| **Phase 4** | 前端切换 + 部署上线 | 1 天 |
| **合计** | 核心功能（Phase 0+1+2+4） | **4-5 天可上线** |

---

## 成功标准

- [x] 网站不再显示任何新闻内容
- [x] 首页展示 80-120 条办事指南型政策（当前 99 条）
- [x] 每条政策含中文摘要
- [ ] 更多政策含完整办事指南（材料清单、费用、时限、步骤）— 当前 48/89(53%) 完整
- [x] 来源来自 BAMF / Make-it-in-Germany / DAAD / Auswärtiges Amt 四家来源
- [ ] 每月 ETag 增量更新，无变化不重爬
