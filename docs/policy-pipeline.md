# 政策抓取与翻译发布流水线

这个流水线用于把德国官方来源中的政策类内容抓取、交给 MiniMax 翻译整理，并写入 `policy_booth_policies`。它复用现有的 `scripts/ingest-official-policies.mjs`，外层新增可恢复调度、来源修复和断点记录。

## 来源注册表

来源统一放在 `config/policy-source-registry.json`：

- `enabled: true`：当前会跑的来源。
- `enabled: false`：预留来源，已经放入联邦、各州和一批重点城市的官方主页，等确认 feed 后开启。
- `homepageUrl`：用于来源健康检查和自动发现 RSS/Atom。
- `repairHint`：当 feed 缺失或失效时，给 AI 修复 prompt 的上下文。

## 统一交互入口

日常使用可以只记一个命令：

```bash
npm run run
```

它会显示菜单，支持直接选择：

- 日常增量：抓近期内容，翻译并发布。
- 初次回填：尽量抓历史内容，翻译并发布。
- 继续上次断点。
- 来源健康检查 / AI 修复。
- 单来源试跑，不写入。
- 查看断点状态。

## 来源修复

先检查当前来源：

```bash
npm run repair:sources
```

检查某个预留来源，并让 MiniMax 给候选地址：

```bash
npm run repair:sources -- --source nordrhein-westfalen --includeDisabled --includeMissing --ai
```

如果候选地址验证为可用 feed，可以自动写回注册表：

```bash
npm run repair:sources -- --source nordrhein-westfalen --includeDisabled --includeMissing --ai --apply
```

修复报告会写到 `data/source-repair-report.json`。这个文件不入库。

## 初次全量抓取

适合第一次把当前 feed 可见的历史内容尽量抓下来并直接发布：

```bash
npm run pipeline:policies -- --mode backfill --write --status published --perSource 120 --maxRequests 560 --repairSources --aiRepair
```

说明：

- `--write --status published` 表示抓到后直接发布。
- `--skipExisting` 已由流水线默认传给底层脚本，重复运行不会重复发布同一个 `official_url`。
- `--maxRequests 560` 给 MiniMax token plan 留一点余量，避免刚好卡在 600/600。
- 如果官方 feed 本身只暴露最近若干条，流水线只能抓到 feed 可见范围；更深的历史归档需要为该来源补 archive/page crawler。

## 日常近期抓取

适合运营阶段，只抓最近内容：

```bash
npm run pipeline:policies -- --mode recent --write --status published --lookbackDays 14 --perSource 20 --maxRequests 560 --repairSources
```

也可以指定某个来源：

```bash
npm run pipeline:policies -- --mode recent --source stuttgart --write --status published
```

## 定点启动与 5 小时恢复

本地或自动化任务里可以指定几点开始：

```bash
npm run pipeline:policies -- --mode recent --write --status published --startAt 02:30 --maxRequests 560
```

如果撞到 MiniMax 5 小时请求墙，流水线会：

1. 写入 `data/policy-pipeline-state.json`。
2. 如果 `SUPABASE_SECRET_KEY` 与 `NEXT_PUBLIC_SUPABASE_URL` 可用，也会写入 `policy_booth_ingest_runs`。
3. 设置 `nextResumeAt = 当前时间 + 5小时`。

持续守护模式：

```bash
npm run pipeline:policies -- --mode backfill --write --status published --maxRequests 560 --resumeAfterHours 5 --loop
```

非守护模式可以交给外部定时器每小时或每 5 小时调用一次；如果还没到 `nextResumeAt`，脚本会自动退出，不会浪费请求：

```bash
npm run pipeline:policies -- --mode backfill --write --status published --maxRequests 560
```

## Supabase 断点表

请在 Liuzi Supabase 里重新执行 `supabase/schema.sql`，它只会创建/更新 `policy_booth_` 前缀对象。其中 `policy_booth_ingest_runs` 用来记录流水线运行、暂停和恢复断点。

## 参数速查

- `--mode backfill|recent`：初次全量或日常增量。
- `--write`：实际写入 Supabase；不传则只 dry run。
- `--status published|draft`：写入状态。
- `--perSource 20`：每个来源本轮最多处理多少条。
- `--maxRequests 560`：本轮最多 MiniMax 请求数。
- `--lookbackDays 14`：近期模式回看天数。
- `--source stuttgart`：只跑某个来源。
- `--repairSources`：跑前检查 feed 健康。
- `--aiRepair`：feed 失效时调用 MiniMax 提候选地址。
- `--applyRepair`：候选 feed 验证通过后写回注册表。
- `--startAt HH:mm`：等到本地时间指定时刻再启动。
- `--resumeAfterHours 5`：撞墙后暂停多久。
- `--loop`：长驻进程，暂停后自动等到恢复点继续。
