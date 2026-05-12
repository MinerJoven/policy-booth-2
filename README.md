# 德区政策展台

面向在德华人的德国官方政策中文整理、筛选、搜索与来源追踪平台。它是 `deyuguantou-index` 下的“德区政策展台”子功能。

## 当前实现

- 公开端：`/`、`/policies`、`/policies/[slug]`、`/categories/[category]`、`/regions/[region]`、`/search`、`/about`
- 后台端：`/admin/login`、`/admin`、`/admin/policies`、`/admin/policies/new`、`/admin/policies/[id]`
- API：`/api/policies`、`/api/policies/[id]`、`/api/search`、`/api/admin/policies`、`/api/admin/policies/[id]`、`/api/admin/policies/[id]/status`
- 登录：使用 Liuzi 共享 Supabase Auth，后台通过和 `deyuguantou-index` 一致的邮箱密码登录。默认允许 `joventien001@outlook.com` 与 `joventien001@gmail.com`，也可继续用 `ADMIN_EMAILS` 追加管理员邮箱。
- 数据：默认仍可回退到本地示例政策；持久化写入使用共享 Supabase 中独立的 `policy_booth_policies` 表，避免影响其他子项目数据表。
- 采集流水线：`npm run pipeline:policies` 可复用地执行来源检查、抓取、MiniMax 翻译、发布和断点恢复；详见 `docs/policy-pipeline.md`。

## 本地运行

```bash
npm install
npm run dev
```

打开 `http://localhost:3000`。

## 构建验证

```bash
npm run typecheck
npm run lint
npm run build
```

## 政策抓取与发布

推荐使用统一交互入口：

```bash
npm run run
```

进入后按菜单选择“日常增量”“初次回填”“继续断点”或“来源修复”。

来源注册表在 `config/policy-source-registry.json`，其中已预留联邦、各州和重点城市来源。初次回填：

```bash
npm run pipeline:policies -- --mode backfill --write --status published --perSource 120 --maxRequests 560 --repairSources --aiRepair
```

日常增量：

```bash
npm run pipeline:policies -- --mode recent --write --status published --lookbackDays 14 --perSource 20 --maxRequests 560 --repairSources
```

撞到 MiniMax 5 小时请求限制时，流水线会写入断点并设置下一次恢复时间。更多参数见 `docs/policy-pipeline.md`。

## Supabase 配置

共享账号系统接入 Liuzi Supabase：

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
ADMIN_EMAILS=
ADMIN_ROLE_VALUES=admin,owner,super_admin
POLICY_BOOTH_TABLE=policy_booth_policies
POLICY_BOOTH_INGEST_RUNS_TABLE=policy_booth_ingest_runs
```

`NEXT_PUBLIC_SUPABASE_URL` 与 `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` 用于 Auth。后台持久化写入需要服务端专用的 `SUPABASE_SECRET_KEY`。如果暂时不配置 secret key，登录仍可接入，但后台新增/编辑不会写入数据库。

`/auth/session` 可接收 index 传入的 Supabase session hash，并写入本项目服务端 cookie，便于从全站主页带登录态进入后台。

## 数据库初始化

在 Liuzi 共享 Supabase 中执行 `supabase/schema.sql`。该脚本只创建 `policy_booth_` 前缀对象，不会修改“驾考模拟”“留子自习室”等其他子项目的表。

## 注意

当前内置政策均为演示数据，不代表最新政策事实。正式上线前需要接入真实官方来源，并对高风险内容保持法律、税务、移民等专业免责声明。
