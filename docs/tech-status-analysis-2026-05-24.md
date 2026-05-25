# 政策展台 2.0 — 技术现状与需求差异分析

> 编制时间：2026-05-24
> 项目地址：https://policy-booth-2.vercel.app
> 源码：`/home/joven/policy-booth-2`（Next.js + Python 爬虫）
> 参考文档：`SPEC.md`（技术规格文档）、`docs/plan-policy-rebuild.md`（重建计划）

---

## 一、当前状态总览

### 1.1 数据规模

| 指标 | 当前值 | SPEC 目标 |
|------|-------|-----------|
| 政策条目总数 | **99 条** | 80-120 条 ✅ |
| 完整办事指南（含材料+费用+时限+步骤） | **52 条（52%）** | 追求更高比例 ❌ |
| 仅含中文摘要（无结构化指南） | 47 条（48%） | — |
| 数据来源数 | **5 个** | 5-7 个 |
| 分类数 | **10/12** | 12 分类中缺 2 个 |
| 招聘职位数 | **2,203 条**（211 条上线） | 持续更新 |
| 地域层级覆盖 | **仅联邦级** | ❌ 州/市/区级缺失 |

### 1.2 前端服务状态（已上线 ✅）

| 功能 | 状态 | 备注 |
|------|------|------|
| 首页政策卡片 | ✅ 运行中 | 从 v2 数据源读取 |
| 政策列表页 `/policies` | ✅ 运行中 | 带分类/地区筛选 |
| 政策详情页 `/policies/[slug]` | ✅ 运行中 | 含办事指南区块 |
| 分类页 `/categories/[category]` | ✅ 运行中 | |
| 搜索功能 | ✅ 运行中 | |
| 招聘列表页 `/jobs` | ✅ 运行中 | |
| 招聘详情页 `/jobs/[refnr]` | ✅ 运行中 | |
| 关于页面 | ✅ 运行中 | |
| 首页招聘卡片 | ✅ 运行中 | |
| iPhone 底部导航 | ✅ 运行中 | |
| 分页翻页 | ✅ 运行中 | |
| SEO meta 标签 | ⚠️ 有但需优化 | |
| 后台管理 | ❌ 未开发 | SPEC 列出但未做 |
| Chrome 插件 | ❌ 未开发 | Phase 4 计划 |

### 1.3 数据来源列表

| 来源 | 条数 | 采集方式 | 可更新性 |
|------|-----|---------|---------|
| BAMF（联邦移民局） | 28 | BeautifulSoup 静态 | ✅ ETag 增量 |
| DAAD（学术交流中心） | 16 | BeautifulSoup 静态 | ✅ ETag 增量 |
| Make-it-in-Germany（联邦劳动部） | 32 | **Wayback Machine**（绕过 Radware） | ⚠️ 快照版，无法实时更新 |
| Auswärtiges Amt（外交部） | 13 | BeautifulSoup 静态 | ⚠️ 无 ETag，需全量重爬 |
| Finanztip（消费者理财指南） | 10 | BeautifulSoup 静态 | ⚠️ 无 ETag |

---

## 二、技术架构

### 2.1 整体架构

```
┌────────────────────────────────────────────────────────┐
│  离线采集层（Python，本地 Hermes 环境运行）              │
│                                                         │
│  5 个爬虫脚本 (scraper_bamf/daad/mig/aa/finanztip)      │
│    → ETag 增量检测（部分支持）                           │
│    → 原文写入 Supabase policy_pages 表                   │
│    → translated = false                                  │
│                      │                                   │
│                      ▼                                   │
│  翻译 Worker (translate_policy.py)                       │
│    → 扫描 translated=false → DeepSeek V4-Flash           │
│    → 结构化提炼（材料/费用/时限/步骤+中文标题摘要）      │
│    → 回写 translated=true                                │
└────────────────────────────┬───────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────┐
│  Supabase PostgreSQL (云端)                              │
│                                                         │
│  policy_pages 表（99条） — 政策内容                     │
│  jobs 表（2,203条） — 招聘数据                          │
│  policy_scraper_etags — ETag 缓存                       │
└────────────────────────────┬───────────────────────────┘
                             │
┌────────────────────────────▼───────────────────────────┐
│  Next.js 14 前端（Vercel 部署）                          │
│                                                         │
│  App Router / SSR+ISR / Tailwind CSS                    │
│  lib/data-v2.ts → Supabase REST API                     │
│  PolicyCard + PolicyDetail + JobCard + JobDetail         │
└────────────────────────────────────────────────────────┘
```

### 2.2 关键文件结构

```
/home/joven/policy-booth-2/
├── app/(public)/                    # 前端页面
│   ├── page.tsx                     # 首页
│   ├── policies/page.tsx            # 政策列表
│   ├── policies/[slug]/page.tsx     # 政策详情
│   ├── categories/[category]/       # 分类页
│   ├── regions/[region]/            # 地区页
│   ├── search/page.tsx              # 搜索页
│   ├── jobs/                        # 招聘模块
│   └── about/page.tsx               # 关于
├── components/
│   ├── policy/PolicyCard.tsx        # 政策卡片组件
│   ├── policy/PolicyDetail.tsx      # 政策详情组件
│   ├── jobs/JobCard.tsx             # 招聘卡片
│   └── jobs/JobDetail.tsx           # 招聘详情
├── lib/
│   ├── data-v2.ts                   # 策略数据源（当前使用）
│   ├── data.ts                      # 旧数据源（v1，已废弃）
│   ├── constants.ts                 # 分类/标签/州定义
│   └── types-v2.ts                  # 类型定义
├── scripts/python/policy/           # 政策爬虫（Python）
│   ├── base_scraper.py              # 基类
│   ├── scraper_bamf.py              # BAMF 爬虫
│   ├── scraper_daad.py              # DAAD 爬虫
│   ├── scraper_mig_wayback.py       # MIG 爬虫（Wayback）
│   ├── scraper_aa.py                # AA 爬虫
│   ├── scraper_finanztip.py         # Finanztip 爬虫
│   ├── translate_policy.py          # AI 提炼 Worker
│   └── run_policy_pipeline.py       # Pipeline 编排
├── scripts/python/                   # 招聘爬虫
│   ├── ba_job_sync.py               # BA API 同步
│   ├── ba_job_fetch_details.py      # 详情补抓
│   └── ba_job_translate.py          # AI 翻译
├── docs/plan-policy-rebuild.md      # 重建计划
├── SPEC.md                          # 技术规格
└── .env                             # 环境变量（Supabase/DeepSeek）
```

### 2.3 核心技术栈（实际 vs SPEC）

| 层次 | SPEC 规定 | 实际使用 | 差异 |
|------|----------|---------|------|
| 前端框架 | Next.js 14 App Router | Next.js 14 App Router | ✅ 一致 |
| 语言 | TypeScript | TypeScript | ✅ 一致 |
| 样式 | Tailwind CSS | Tailwind CSS | ✅ 一致 |
| 数据库 | Supabase PostgreSQL | Supabase PostgreSQL | ✅ 一致 |
| 爬虫（静态页）| Python + BeautifulSoup + httpx | Python + BeautifulSoup + httpx | ✅ 一致 |
| 爬虫（JS渲染）| Python + Playwright | ❌ **未实现** | 🔴 |
| AI 翻译 | MiniMax 2.7 | **DeepSeek V4-Flash** | ⚠️ 已切换（更便宜、中文表现更好） |
| 定时调度 | GitHub Actions Cron | **Hermes Agent cron** | ⚠️ 已切换（本地可控） |
| 部署 | Vercel | Vercel | ✅ 一致 |
| 翻译队列表 | `translation_queue` 表 | ❌ **未创建**，直接扫描 `translated` 字段 | 🔴 |

### 2.4 数据库 `policy_pages` 字段 vs SPEC 定义

| SPEC 字段 | 实际存在 | 是否填充 | 差异 |
|-----------|---------|---------|------|
| id (UUID PK) | ✅ | ✅ | — |
| service_key (TEXT UNIQUE) | ✅ | ✅ | 格式: `{prefix}_{URL_clean}` |
| slug (TEXT UNIQUE) | ✅ | ✅ | URL 友好 |
| title_zh (TEXT NOT NULL) | ✅ | ✅ 100% | — |
| title_de (TEXT NOT NULL) | ✅ | ✅ 100% | — |
| summary_zh (TEXT NOT NULL) | ✅ | ✅ 100% | AI 提炼 |
| requirements_zh (JSONB) | ✅ | ✅ 52% | 仍需提升 |
| fees_zh (TEXT) | ✅ | ✅ 52% | 仅完整指南含 |
| duration_zh (TEXT) | ✅ | ✅ 52% | 仅完整指南含 |
| steps_zh (JSONB) | ✅ | ✅ 52% | 仅完整指南含 |
| region_level (TEXT NOT NULL) | ✅ | ✅ 100% | 全部为"联邦" |
| region_name (TEXT NOT NULL) | ✅ | ✅ 100% | 全部为"Deutschland" |
| category (TEXT NOT NULL) | ✅ | ✅ 100% | 有映射 |
| tags (TEXT[]) | ✅ | ✅ 100% | 来源相关标签 |
| publisher (TEXT NOT NULL) | ✅ | ✅ 100% | — |
| source_url (TEXT NOT NULL) | ✅ | ✅ 100% | — |
| source_name (TEXT NOT NULL) | ✅ | ✅ 100% | — |
| translated (BOOLEAN) | ✅ | ✅ 100% | — |
| content_hash (TEXT) | ❌ | ❌ | 🔴 **缺失** |
| translated_at (TIMESTAMPTZ) | ✅ | ✅ 100% | — |
| last_fetched_at (TIMESTAMPTZ) | ✅ | ✅ 100% | — |
| view_count (INTEGER) | ✅ | ✅ 全部=0 | 未启用浏览计数 |
| created_at / updated_at | ✅ | ✅ | — |

---

## 三、需求差异（实际 vs SPEC）

### 3.1 分类覆盖率（12 分类 → 覆盖 10/12）

| 分类（SPEC 定义） | 条目数 | 状态 | 缺口 |
|------------------|-------|------|------|
| 居留与签证 | 26 | ✅ 较充实 | |
| 留学与大学 | 19 | ✅ 较充实 | |
| 工作与蓝卡 | 24 | ✅ 较充实 | |
| 生活行政 | 10 | ⚠️ 一般 | |
| 家庭与福利 | 7 | ⚠️ 偏少 | |
| 医保与保险 | 5 | ❌ 偏少 | |
| **入籍与长期居留** | **3** | ❌ **太少** | 🔴 |
| **税务与社保** | **2** | ❌ **太少** | 🔴 (新分类) |
| **交通与驾照** | **1** | ❌ **太少** | 🔴 |
| **宠物与犬税** | **0** | ❌ **不存在** | 🔴🔴 完全缺失 |
| **招聘信息** | N/A | 前端有独立页面 | 政策模块无此分类条目 |
| 其他 | 2 | — | |

### 3.2 地域层级覆盖（SPEC 要求 4 级 × 16 州 × 城市）

| 层级 | 当前覆盖 | 要求 |
|------|---------|------|
| **联邦** | ✅ 99 条 | 联邦级政策信息 ✅ |
| **州 (Bundesland)** | ❌ **0 条** | 各州差异化法规（犬税/教育/节假日等） |
| **市 (Stadt)** | ❌ **0 条** | 各城市 Ausländerbehörde 流程/材料 |
| **区 (Landkreis)** | ❌ **0 条** | 本地办事指南 |

**影响**：当前所有的 99 条政策全部标记为`region_level = "联邦"`。用户无法按城市/州筛选本地信息，这是 SPEC 与实现之间最大的结构性差异。

### 3.3 功能缺失

| SPEC 功能 | 状态 | 说明 |
|-----------|------|------|
| ETag 增量检测 | ⚠️ 部分支持 | BAMF 和 DAAD 有 ETag；AA 无 ETag；Finanztip 无 ETag；MIG 用 Wayback 无法增量 |
| `translation_queue` 表 | ❌ **未创建** | 当前直接扫描 translated=false，无优先级/重试/错误追踪 |
| content_hash 变更检测 | ❌ 未实现 | 无法检测原文是否更新 |
| Playwright JS 渲染爬虫 | ❌ 未实现 | 无法爬取各市外管局动态页面 |
| GitHub Actions 定时调度 | ❌ **已迁移到 Hermes cron** | 本地 Cron，非 GitHub Actions |
| 后台管理 | ❌ 未开发 | 无 Admin 页面，无 Auth Guard |
| 政策变更通知 | ❌ 未开发 | |
| 用户收藏/历史 | ❌ 未开发 | |
| Chrome 插件 | ❌ 未开发 | |

---

## 四、待解决的关键问题

按影响程度从高到低排列：

### 🔴 P0 — 必须解决

#### 1. "宠物与犬税"分类完全缺失
- **原因**：没有适合的联邦级来源（犬税是城市级法规，每个城市费率不同）
- **影响**：是 SPEC 中明确列出的分类，且是很多华人用户的实际需求
- **解决思路**：人工确定 5-8 个主要城市犬税页面 → 写按城市迭代的爬虫 → 每条存入一个独立记录（region_level="市"）

#### 2. 地域层级全部为"联邦"，无州/市/区级数据
- **原因**：所有 5 个数据源都是联邦级机构
- **影响**：无法实现"按城市筛选政策"的 SPEC 要求；无法覆盖各州差异化法规
- **解决思路**：
  - 短期：各城市犬税/外管局页面，手动确定 URL 后批量爬取
  - 中期：Playwright 爬取 10 个主要城市 Ausländerbehörde 页面
  - 长期：各州门户网站（NRW/柏林/巴伐利亚等）的本地服务爬虫

#### 3. Make-it-in-Germany 无法直接访问（Radware 反爬）
- **原因**：该站点被 Radware + hCaptcha 保护，htpx/BeautifulSoup 无法直连
- **现状**：通过 Wayback Machine 快照迂回，但：
  - 快照日期为 2026-01-02，**无法反映最新政策变化**
  - 无法做增量更新（每次需要重新通过 CDX 找快照）
  - 一些页面可能没有快照或快照不完整
- **影响**：工作签证/蓝卡/机会卡等核心签证信息可能滞后
- **解决思路**：
  - 短期：维持 Wayback 方案，定期（季度）手动更新
  - 中期：尝试 Playwright + 代理池绕过，或寻找替代来源（如 BAMF 的 Fachkräfte 信息页）

### 🟡 P1 — 重要但可后置

#### 4. 52% 完整指南比例有提升空间
- **问题**：47 条（48%）仅含中文摘要，缺乏材料清单/费用/时限/步骤
- **原因**：部分来源内容属于说明性文章（如申根协议、庇护法说明），天然缺乏办事步骤
- **解决思路**：
  - 接受部分内容的天然限制（概念说明类文章不可能有步骤）
  - 对 Finanztip 等理财指南类内容，优化 AI prompt 提取更多结构化信息
  - 手动补全高优先级条目（最常被搜索的条目）

#### 5. `translation_queue` 表未实现
- **问题**：当前翻译工作流直接扫描 `translated=false`，无队列管理
- **影响**：无法做优先级控制、失败重试追踪、执行记录
- **解决思路**：创建 `translation_queue` 表，将 pipeline 改为从队列读取

#### 6. `content_hash` 字段缺失
- **影响**：无法自动检测原文变更，无法触发重新翻译
- **解决思路**：添加 `content_hash TEXT` 列，爬虫抓取后计算 MD5

#### 7. 招聘模块标签分配有待优化
- **问题**：2,203 条职位中仅 299 条有华人特供标签（需要中文/华人优先等）
- **原因**：标签分配逻辑在详情抓取阶段运行，但部分职位描述不足
- **解决思路**：改进标签匹配规则，增加关键词库覆盖范围

### 🔵 P2 — 可长期规划

#### 8. 无后台管理系统
- **现状**：SPEC 列出的 `/admin/*` 路由均未实现
- **影响**：无法人工审核/编辑/上架/下架政策条目
- **解决思路**：Phase 4 内容，需要 Supabase Auth + 管理员角色

#### 9. SEO 优化不完整
- **问题**：meta 标签有基本设置但不够详细，无结构化数据标记
- **影响**：搜索引擎收录和排名效果有限
- **解决思路**：添加 JSON-LD 结构化数据、完善每个页面的标题/描述/关键词

#### 10. 无浏览计数功能
- **问题**：`view_count` 字段全部为 0
- **影响**：无法了解用户最关心的内容 → 无法指导内容优化优先级

---

## 五、推荐优先级路线

### 短期（1-2 周）
1. **城市犬税数据** — 补全 SPEC 中缺失的"宠物与犬税"分类，同时首次引入州/市级地域层级
2. **`content_hash` 字段 + `translation_queue` 表** — 基础数据质量管理

### 中期（1-2 月）
3. **10 个主要城市 Ausländerbehörde Playwright 爬虫** — 按城市筛选外管局信息
4. **Make-it-in-Germany 反爬替代方案** — 寻找稳定方案（代理池 或 替代来源）
5. **提升完整指南比例** — 手动补全 + AI prompt 优化

### 长期（3 月+）
6. **后台管理系统** — 内容审核/编辑/管理
7. **Chrome 插件** — 官方页面叠加中文
8. **用户收藏/历史** — 留存体系
9. **各州门户网站爬虫** — 全面覆盖州级法规差异

---

**附录**：
- `SPEC.md` — 完整技术规格文档
- `docs/plan-policy-rebuild.md` — 重建计划（含完成度记录）
- `scripts/python/policy/` — 所有爬虫脚本
