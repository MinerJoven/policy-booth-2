# 政策展台 2.0 — 技术规格文档 (SPEC)

> 项目名：**政策展台 2.0** (Policy Booth 2.0)
> 版本：v2.0 | 基于 Windows `德区政策展台_技术开发文档_v1.0.docx` (2025)
> 定位：面向在德华人的政策信息与就业资讯平台

---

## 目录

1. [产品定位与核心价值](#1-产品定位与核心价值)
2. [系统架构总览](#2-系统架构总览)
3. [数据库设计](#3-数据库设计)
4. [数据采集层](#4-数据采集层)
5. [翻译队列](#5-翻译队列)
6. [前端应用](#6-前端应用)
7. [API 设计](#7-api-设计)
8. [定时调度](#8-定时调度)
9. [技术选型](#9-技术选型)
10. [分阶段开发计划](#10-分阶段开发计划)

---

## 1. 产品定位与核心价值

### 1.1 目标用户

| 用户类型 | 主要需求 | 核心场景 |
|---|---|---|
| 在读留学生 | 签证延期、打工许可、实习机会 | 学生居留申请、Werkstudent 职位搜索 |
| 应届毕业生 | 就业居留、蓝卡申请 | 工作签证流程、对口职位匹配 |
| 就业移民 | 居留续签、家属团聚 | 各城市 Ausländerbehörde 信息 |
| 陪同家属 | 就业许可、语言课程 | BAMF 融合课程查询 |
| 计划赴德者 | 签证类型选择 | Make-it-in-Germany 政策导航 |

### 1.2 合规路线：方案 C

> **不做政府网站的竞争者，而是做中文世界与德国政府官方信息之间的「翻译层」。**

- 摘要内容由 AI 基于原文提炼，是二次创作，不构成原文复制
- 结构化信息（材料清单、费用金额、办理时限）属于客观事实，不受著作权保护
- 每条内容均附原站链接，流量回流官方网站

### 1.3 两大核心功能模块

1. **政策内容** — 德国官方政策的中文摘要、结构化整理、原站链接
2. **招聘信息** — 联邦劳动局（BA）Jobbörse 职位库中文翻译+华人特供标签

---

## 2. 系统架构总览

### 2.1 数据流架构

```
┌─────────────────────────────────────────────────────────────────┐
│  离线采集层（Python / Node.js 爬虫，定时运行）                    │
│                                                                  │
│  ┌──────────────────┐    ┌──────────────────┐                  │
│  │  政策内容采集      │    │  招聘信息采集      │                  │
│  │  ETag 增量检测    │    │  BA Jobbörse API │                  │
│  │  变化则重爬       │    │  日同步           │                  │
│  └────────┬─────────┘    └────────┬─────────┘                  │
│           ▼                        ▼                             │
│  ┌─────────────────────────────────────────┐                     │
│  │  Supabase PostgreSQL                    │                     │
│  │  · policy_pages (translated=false)      │                     │
│  │  · jobs (is_active, translated=false)   │                     │
│  └────────────────────┬────────────────────┘                     │
│                       ▼                                          │
│  ┌─────────────────────────────────────────┐                     │
│  │  翻译队列 Worker                         │                     │
│  │  扫描 translated=false → 批量 MiniMax   │                     │
│  │  回写翻译字段 → translated=true          │                     │
│  └─────────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  在线服务层（Next.js App Router，Vercel 部署）                     │
│                                                                  │
│  用户请求 → Next.js API Route → Supabase 查询（永远读缓存）        │
│  「查看原文」按钮 → 跳转官方来源 URL                               │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心技术栈

| 层次 | 技术选型 | 理由 |
|---|---|---|
| 前端框架 | Next.js 14 (App Router) | SSR/SSG 支持，SEO 友好，与现有技术栈一致 |
| 语言 | TypeScript | 类型安全 |
| 样式 | Tailwind CSS | 响应式快，中文内容排版便利 |
| 数据库 | Supabase (PostgreSQL) | 托管 PostgreSQL + RLS + REST API |
| 爬虫（静态页）| Python + BeautifulSoup + httpx | 轻量，维护成本低 |
| 爬虫（JS渲染页）| Python + Playwright | 处理各市 Ausländerbehörde |
| AI 翻译 | MiniMax 2.7 | 中文效果优秀，成本可控 |
| 定时调度 | GitHub Actions Cron | 免费 2000 分钟/月，零运维 |
| 部署 | Vercel | Next.js 原生支持 |

---

## 3. 数据库设计

### 3.1 表总览

| 表名 | 用途 | 备注 |
|---|---|---|
| `policy_pages` | 政策内容主表 | v2.0 新设计，对齐 Windows 文档字段 |
| `jobs` | 招聘信息主表 | v2.0 新增，BA Jobbörse 数据 |
| `translation_queue` | 统一翻译队列 | v2.0 新增，政策+招聘共用 |
| `policy_booth_ai_reviews` | AI 复核记录 | 已有，复用 |
| `policy_booth_ingest_runs` | 采集运行记录 | 已有，复用 |

### 3.2 政策内容表：`policy_pages`

```sql
CREATE TABLE policy_pages (
  -- 基础标识
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_key     TEXT UNIQUE NOT NULL,        -- 全局唯一键，如 aufenthaltserlaubnis_studium
  slug            TEXT UNIQUE NOT NULL,         -- URL 友好标识符

  -- 标题与摘要
  title_zh        TEXT NOT NULL,                -- 中文标题（AI 翻译）
  title_de        TEXT NOT NULL,                -- 德文原始标题
  summary_zh      TEXT NOT NULL,                -- 300字以内中文摘要（AI 提炼，非原文直译）

  -- 结构化信息（核心差异于 v1）
  requirements_zh JSONB NOT NULL DEFAULT '[]',  -- 所需材料数组，如 ["有效护照","健康保险证明"]
  fees_zh         TEXT NOT NULL DEFAULT '',     -- 费用说明，如「约 100–110 欧元」
  duration_zh     TEXT NOT NULL DEFAULT '',     -- 办理时限，如「通常 4–8 周」
  steps_zh        JSONB NOT NULL DEFAULT '[]', -- 办理步骤数组

  -- 分类信息
  region_level    TEXT NOT NULL CHECK (region_level IN ('联邦', '州', '市', 'Landkreis')),
  region_name     TEXT NOT NULL,                -- 具体地区或 '联邦'
  category        TEXT NOT NULL,                -- 政策类别（见 3.4）
  tags            TEXT[] NOT NULL DEFAULT '{}', -- 分类标签，如 ["居留","留学生"]

  -- 来源信息
  publisher       TEXT NOT NULL,                -- 发布机构名称
  source_url      TEXT NOT NULL,                -- 原始官方页面 URL
  source_name     TEXT NOT NULL,                -- 来源机构名，如「联邦移民局（BAMF）」

  -- 翻译状态
  translated      BOOLEAN NOT NULL DEFAULT FALSE,
  translated_at   TIMESTAMPTZ,                   -- 最近一次翻译时间

  -- 变更检测
  content_hash    TEXT,                         -- 原文 MD5，用于变更检测
  last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 统计
  view_count      INTEGER NOT NULL DEFAULT 0,

  -- 时间戳
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX policy_pages_service_key_idx ON policy_pages(service_key);
CREATE INDEX policy_pages_slug_idx ON policy_pages(slug);
CREATE INDEX policy_pages_translated_idx ON policy_pages(translated);
CREATE INDEX policy_pages_category_idx ON policy_pages(category);
CREATE INDEX policy_pages_region_name_idx ON policy_pages(region_name);
CREATE INDEX policy_pages_region_level_idx ON policy_pages(region_level);
CREATE INDEX policy_pages_tags_idx ON policy_pages USING GIN(tags);
CREATE INDEX policy_pages_published_at_idx ON policy_pages(last_fetched_at DESC);
```

### 3.3 招聘信息表：`jobs`

```sql
CREATE TABLE jobs (
  -- 主键
  refnr           TEXT PRIMARY KEY,             -- BA 岗位唯一编号

  -- 职位信息
  title_de        TEXT NOT NULL,                -- 原始德语职位名
  title_zh        TEXT,                         -- 中文职位名（AI 翻译，≤20字）
  brief_zh        TEXT,                         -- 两句话中文岗位摘要（AI 生成）

  -- 雇主与地点
  employer        TEXT NOT NULL,                 -- 雇主名称
  city            TEXT NOT NULL,                 -- 工作城市
  state_code      TEXT NOT NULL,                 -- 所属州代码（BW/BY/BE 等）

  -- 工作类型
  work_type       TEXT[] NOT NULL DEFAULT '{}',  -- 工作类型数组，如 ["全职","远程"]
  is_limited      BOOLEAN NOT NULL DEFAULT FALSE,-- 是否固定期限合同
  entry_date      DATE,                         -- 入职日期

  -- 华人特供标签
  tags            TEXT[] NOT NULL DEFAULT '{}',  -- 如 ["留学生适合","需要中文","远程办公"]

  -- 来源
  source_url      TEXT NOT NULL,                -- BA 原始详情页链接
  published_at    DATE,                         -- BA 平台上架日期

  -- 同步状态
  is_active       BOOLEAN NOT NULL DEFAULT TRUE, -- false 表示 BA 已下架
  translated      BOOLEAN NOT NULL DEFAULT FALSE,
  translated_at   TIMESTAMPTZ,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- 时间戳
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX jobs_refnr_idx ON jobs(refnr);
CREATE INDEX jobs_translated_idx ON jobs(translated);
CREATE INDEX jobs_is_active_idx ON jobs(is_active);
CREATE INDEX jobs_city_idx ON jobs(city);
CREATE INDEX jobs_state_code_idx ON jobs(state_code);
CREATE INDEX jobs_published_at_idx ON jobs(published_at DESC);
CREATE INDEX jobs_tags_idx ON jobs USING GIN(tags);
CREATE INDEX jobs_work_type_idx ON jobs USING GIN(work_type);
```

### 3.4 翻译队列表：`translation_queue`

```sql
CREATE TABLE translation_queue (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type     TEXT NOT NULL CHECK (source_type IN ('policy', 'job')),
  source_id       TEXT NOT NULL,                 -- policy_pages.id 或 jobs.refnr
  source_url      TEXT,                         -- 用于 AI 复核时抓取
  priority        INTEGER NOT NULL DEFAULT 0,   -- 数字越大越优先
  attempts        INTEGER NOT NULL DEFAULT 0,   -- 已尝试次数
  max_attempts    INTEGER NOT NULL DEFAULT 3,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'processing', 'done', 'failed', 'skipped')),
  error_message   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at     TIMESTAMPTZ
);

CREATE INDEX translation_queue_status_idx ON translation_queue(status);
CREATE INDEX translation_queue_priority_idx ON translation_queue(priority DESC, created_at ASC);
CREATE INDEX translation_queue_source_idx ON translation_queue(source_type, source_id);
```

### 3.5 分类枚举（category 字段）

```typescript
export const CATEGORIES = [
  { value: '居留与签证',   label: '居留与签证',   icon: '📋' },
  { value: '留学与大学',   label: '留学与大学',   icon: '🎓' },
  { value: '工作与蓝卡',   label: '工作与蓝卡',   icon: '💼' },
  { value: '入籍与长期居留', label: '入籍与长期居留', icon: '🏠' },
  { value: '税务与社保',   label: '税务与社保',   icon: '📊' },
  { value: '医保与保险',   label: '医保与保险',   icon: '🏥' },
  { value: '家庭与福利',   label: '家庭与福利',   icon: '👨‍👩‍👧' },
  { value: '交通与驾照',   label: '交通与驾照',   icon: '🚗' },
  { value: '宠物与犬税',   label: '宠物与犬税',   icon: '🐾' },
  { value: '生活行政',     label: '生活行政',     icon: '📬' },
  { value: '招聘信息',     label: '招聘信息',     icon: '💼' },
  { value: '其他',         label: '其他',         icon: '📌' },
] as const;
```

### 3.6 华人特有招聘标签

```typescript
export const JOB_TAGS = [
  { value: '需要中文',     label: '需要中文' },      // 职位含 Chinesisch/Mandarin/Chinese
  { value: '留学生适合',   label: '留学生适合' },    // Werkstudent 或 Praktikum
  { value: '远程办公',     label: '远程办公' },      // arbeitszeit 含远程
  { value: '无语言要求',   label: '无语言要求' },    // English OK / no German required
] as const;

export const WORK_TYPES = [
  { value: '全职', label: '全职', arbeitszeit: 'vz' },
  { value: '兼职', label: '兼职', arbeitszeit: 'tz' },
  { value: '远程', label: '远程/居家', arbeitszeit: 'ho' },
  { value: '迷你岗', label: '迷你岗', arbeitszeit: 'mj' },
  { value: '实习', label: '实习/培训', arbeitszeit: 'aa' },
] as const;
```

---

## 4. 数据采集层

### 4.1 政策内容采集（ETag 增量检测）

**核心原则：无变化不重爬、不重译，最小化 AI token 消耗。**

#### 更新流程（每月执行）

```
① 对所有已收录 URL 发出 HTTP HEAD 请求，携带上次存储的 ETag
② 服务器返回 304 → 内容未变，跳过，无任何费用产生
③ 服务器返回 200 + 新 ETag → 内容已更新，触发重新抓取
④ 新内容写入 DB，标记 translated = false，进入翻译队列
⑤ 翻译 worker 批量调用 MiniMax 提炼中文摘要，回写 DB
```

#### 内容来源矩阵

| 优先级 | 来源 | 覆盖内容 | 爬取方式 |
|---|---|---|---|
| P0 | Make-it-in-Germany (联邦劳动部) | 签证、居留、就业许可、语言 | BeautifulSoup |
| P0 | BAMF 官网 | 庇护、难民、居留分类、融合课程 | BeautifulSoup + PDF |
| P0 | DAAD | 留学签证、学生居留、奖学金 | BeautifulSoup |
| P1 | Auswärtiges Amt | 入境签证、双边协定 | BeautifulSoup |
| P1 | Your Europe (EU) | 在德居住、工作、社保 | BeautifulSoup |
| P2 | 各市 Ausländerbehörde | 本地材料清单、预约、费用 | Playwright (JS渲染) |
| P3 | Deutsche Rentenversicherung | 养老金、社保 | BeautifulSoup |

#### 内容变更检测

- 每次抓取后计算 `content_hash = MD5(raw_html)`
- 与上次存储的 `content_hash` 对比
- 变化则重写 `translated = false`，触发翻译队列

### 4.2 招聘信息采集（BA Jobbörse API）

**API 接入规格**

| 参数 | 值 |
|---|---|
| 接口基础地址 | `https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4` |
| 认证方式 | 请求头 `X-API-Key: jobboerse-jobsuche` |
| 文档来源 | github.com/bundesAPI/jobsuche-api |

#### 核心查询参数

| 参数名 | 说明 | 示例 |
|---|---|---|
| `was` | 职位关键词 | Werkstudent Informatik |
| `wo` | 地点 | Stuttgart |
| `umkreis` | 搜索半径（公里）| 50 |
| `arbeitszeit` | 工作类型 | vz=全职；tz=兼职；ho=远程 |
| `veroeffentlichtseit` | 发布天数范围 | 7（近7天）|
| `angebotsart` | 信息类型 | 1=工作；2=培训；4=实习 |
| `pav` | 是否含私人中介 | false |
| `page / size` | 分页 | page=1, size=25 |

#### 同步关键词（华人特供）

```python
POLICY_KEYWORDS = [
    "Werkstudent", "Praktikum", "Ausbildung",
    "Chinesisch", "Mandarin", "Chinese",
    "Informatik", "Software", "Data",
    "English", "International",
]
```

#### 日同步流程（每日 02:00 UTC）

```
① 并发拉取多个关键词下的近7天岗位
② 按 refnr 去重（同一岗位可能被多个关键词命中）
③ 批量 upsert 写入 jobs 表，新增岗位标记 is_active=true, translated=false
④ 检测下架：DB 中 is_active=true 但本次未返回的 refnr → 更新为 is_active=false
⑤ 翻译 worker 处理所有 translated=false 的新岗位
```

---

## 5. 翻译队列

### 5.1 统一翻译触发逻辑

| 触发时机 | 处理逻辑 |
|---|---|
| 政策内容 ETag 变化 | 重置 `translated=false` → worker 重新提炼摘要 |
| 招聘岗位新增 | 插入时 `translated=false` → worker 翻译职位名 + 生成摘要 |
| 已翻译内容 | `translated=true` → 跳过，不消耗 token |

### 5.2 政策内容 AI 提炼 Prompt

**核心策略：结构化输出，不复制原文。**

```
请将以下德国官方政策页面内容提炼为结构化中文信息。

输出格式（严格 JSON）：
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
```

### 5.3 招聘内容 AI 翻译 Prompt

```
将以下德语职位信息翻译为中文（职位名≤20字，摘要≤50字）：

职位名：{title_de}
职位描述：{description}

输出 JSON：
{
  "title_zh": "中文职位名（≤20字）",
  "brief_zh": "两句话中文摘要（≤50字，描述核心职责和要求）"
}
```

### 5.4 成本控制策略

- **ETag 检测**：政策页月均实际变化率约 10–20%，80%以上请求无 AI 调用
- **招聘翻译极简化**：每条岗位只翻译职位名（≤20字）+ 两句摘要
- **批量处理**：每批 20 条，避免高频单次调用
- **缓存优先**：前端查询永远读 DB 缓存，不做实时 AI 调用

---

## 6. 前端应用

### 6.1 技术架构

- **框架**：Next.js 14 (App Router)
- **语言**：TypeScript
- **样式**：Tailwind CSS
- **部署**：Vercel（与 Next.js 原生集成）
- **数据库**：Supabase（REST API，公共只读键受 RLS 限制）

### 6.2 路由总览

| 路由 | 页面 | 渲染模式 |
|---|---|---|
| `/` | 首页 | SSR（含最新政策，需实时）|
| `/policies` | 政策列表页 | SSR（筛选参数动态）|
| `/policies/[slug]` | 政策详情页 | ISR (revalidate: 3600) |
| `/jobs` | 招聘列表页 | SSR |
| `/jobs/[refnr]` | 招聘详情页 | ISR |
| `/categories/[category]` | 分类页 | ISR |
| `/regions/[region]` | 地区页 | ISR |
| `/search` | 搜索结果页 | CSR |
| `/about` | 关于我们 | SSG |
| `/admin` | 后台首页 | 服务端 + Auth Guard |
| `/admin/policies` | 政策管理列表 | 服务端 + Auth Guard |
| `/admin/policies/new` | 新增政策 | 服务端 + Auth Guard |
| `/admin/policies/[id]` | 编辑政策 | 服务端 + Auth Guard |
| `/admin/jobs` | 招聘管理列表 | 服务端 + Auth Guard |
| `/admin/login` | 后台登录 | 服务端 |

### 6.3 政策详情页 UI 区域

```
┌─────────────────────────────────────────────────┐
│  主题分类  ·  地区标签  ·  更新时间               │
├─────────────────────────────────────────────────┤
│  中文标题                                         │
│  Deutscher Originaltitel（小字灰色）              │
├─────────────────────────────────────────────────┤
│  📋 基础信息                                      │
│    发布机构 / 来源机构 / 官方链接 / 更新时间        │
├─────────────────────────────────────────────────┤
│  💡 一句话总结                                    │
├─────────────────────────────────────────────────┤
│  📦 所需材料（图标列表）                          │
│  💰 费用说明                                       │
│  ⏱️ 办理时限                                       │
│  📝 办理步骤（编号列表）                           │
├─────────────────────────────────────────────────┤
│  标签列表                                         │
├─────────────────────────────────────────────────┤
│  ⚠️ 免责声明                                       │
│  「本内容摘要自官方来源，具体以官方页面为准」         │
├─────────────────────────────────────────────────┤
│  [查看官方详情 →]  跳转官方来源 URL              │
└─────────────────────────────────────────────────┘
```

### 6.4 招聘列表页 UI 区域

```
┌─────────────────────────────────────────────────┐
│  [城市/州筛选]  [工作类型]  [华人标签]  [搜索框]    │
├─────────────────────────────────────────────────┤
│  岗位卡片：                                      │
│  中文职位名 · 雇主 · 城市 · 发布时间              │
│  两句话摘要                                      │
│  标签：[留学生适合] [需要中文] [远程办公]           │
│  [3天内上架 → NEW 徽章]                          │
├─────────────────────────────────────────────────┤
│  数据最后同步：XXXX-XX-XX 10:00                  │
│  [在劳动局官网投递 →]                             │
└─────────────────────────────────────────────────┘
```

### 6.5 前端环境变量

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJxxx...    # 公共只读（受 RLS 限制）
SUPABASE_SERVICE_ROLE_KEY=eyJxxx...        # 仅服务端使用（Admin API）
```

---

## 7. API 设计

### 7.1 政策相关 API

#### `GET /api/policies`
获取政策列表，支持筛选、排序、分页。

```
Query: region_level, region_name, category, tags, page, page_size, sort
Response: { data: Policy[], total, page, page_size }
```

#### `GET /api/policies/[slug]`
获取单条政策完整内容。

```
Response: Policy (所有字段)
```

### 7.2 招聘相关 API

#### `GET /api/jobs`
获取招聘列表，支持筛选、分页。

```
Query: city, state_code, work_type[], tags[], page, page_size, q(搜索)
Response: { data: Job[], total, page, page_size }
```

#### `GET /api/jobs/[refnr]`
获取单条招聘详情。

```
Response: Job (所有字段)
```

### 7.3 搜索 API

#### `GET /api/search`
全文搜索（政策 + 招聘）。

```
Query: q (关键词), type (policy|job|all), region, category
Response: { policies: Policy[], jobs: Job[], total }
```

---

## 8. 定时调度

### 8.1 GitHub Actions Cron 任务

| 任务 | Cron 表达式 (UTC) | 说明 |
|---|---|---|
| `sync-jobs` | `0 2 * * *` | 每日 02:00，BA API 全量拉取 → 去重 → upsert |
| `translate-jobs` | `0 3 * * *` | 每日 03:00，处理 translated=false 的招聘条目 |
| `check-policy-updates` | `0 5 1 * *` | 每月 1 日 05:00，全量 ETag 检测 |
| `scrape-auslanderbehoerde` | `0 4 * * 1` | 每周一 04:00，Playwright 爬取重点城市 |
| `translate-policies` | `0 6 * * *` | 每日 06:00，处理 translated=false 的政策条目 |

### 8.2 手动触发

- 紧急政策更新（如法规修订）通过 GitHub Actions Dispatch 手动触发
- 前台提供「请求复核」按钮，提交后进入翻译队列

---

## 9. 技术选型

| 层次 | 技术 | 版本 |
|---|---|---|
| 前端框架 | Next.js | 14+ |
| 语言 | TypeScript | 5+ |
| 样式 | Tailwind CSS | 3+ |
| 数据库 | Supabase (PostgreSQL) | - |
| Python 爬虫 | Python | 3.11+ |
| Python HTTP | httpx + BeautifulSoup | latest |
| JS 渲染爬虫 | Playwright | latest |
| AI 翻译 | MiniMax 2.7 | - |
| CI/CD | GitHub Actions | - |
| 部署 | Vercel | - |

---

## 10. 分阶段开发计划

### Phase 1：招聘模块（Week 1–2）

- [ ] BA Jobbörse API 对接脚本
- [ ] Supabase `jobs` 表 + `translation_queue` 表
- [ ] 招聘翻译 worker
- [ ] 招聘列表前端（含城市/工作类型/华人标签筛选）
- [ ] GitHub Actions 日同步

**里程碑：上线最小可用版本（招聘数据实时更新）**

### Phase 2：政策核心内容（Week 3–4）

- [ ] 新建 `policy_pages` 表（对齐文档字段）
- [ ] BAMF + Make-it-in-Germany + DAAD 爬取
- [ ] ETag 增量检测逻辑
- [ ] MiniMax 提炼 Prompt 调优
- [ ] 政策卡片组件 + 分类浏览页

**里程碑：80条核心政策上线（覆盖居留/签证/留学）**

### Phase 3：本地化增强（Month 2）

- [ ] 各市 Ausländerbehörde 爬取（Playwright）
- [ ] 按城市筛选政策细节
- [ ] Your Europe EU 来源接入
- [ ] Auswärtiges Amt 签证内容

**里程碑：实现按城市查询本地办理信息**

### Phase 4：质量与工具（持续维护）

- [ ] 政策内容人工审核标注
- [ ] Chrome 插件（在官网叠加中文）
- [ ] 政策变更邮件通知
- [ ] 用户收藏 / 历史记录

**里程碑：Chrome 插件上线 + 用户留存体系建立**

---

*文档生成时间：2026-05-12 | 基于 Windows 德区政策展台_技术开发文档_v1.0.docx (2025) 重新编写*
