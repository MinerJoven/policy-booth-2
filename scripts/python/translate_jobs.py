#!/usr/bin/env python3
"""
翻译 + 打标签 pipeline
- 读取所有 description_de 为 NULL 的 jobs
- 调 MiniMax M2.7 翻译成中文，同时输出标签
- 批量写入 description_zh + tags 字段
- 分批处理，每批 5 条，中间 4-5s 延迟
"""
import os, sys, json, time, subprocess, tempfile, base64

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import httpx

# ── Config ─────────────────────────────────────────────────────────────
def load_minimax_key() -> str:
    """从 hermes profile .env 直接读取 MiniMax API key"""
    env_paths = [
        os.path.expanduser("~/.hermes/profiles/dev/.env"),
        os.path.expanduser("~/.hermes/.env"),
    ]
    for path in env_paths:
        if os.path.exists(path):
            with open(path) as f:
                for line in f:
                    if "MINIMAX" in line and "API_KEY" in line and "=" in line:
                        key = line.split("=", 1)[1].strip()
                        if key and key != "***":
                            return key
    return ""

MINIMAX_KEY  = load_minimax_key()
MINIMAX_BASE = os.environ.get("MINIMAX_BASE_URL", "https://api.minimaxi.com/anthropic")
MINIMAX_MODEL = os.environ.get("MINIMAX_MODEL", "MiniMax-M2.7")

BA_DETAIL_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails"
HEADERS        = {"X-API-Key": "jobboerse-jobsuche", "User-Agent": "policy-booth-2/1.0"}

# ── Tag 定义 ───────────────────────────────────────────────────────────
# 每条职位最多 4 个标签，格式 ["标签1", "标签2", ...]
AVAILABLE_TAGS = [
    # 职业领域
    "IT/技术", "餐饮/酒店", "零售/销售", "制造/物流", "金融/会计",
    "教育/培训", "医疗/护理", "行政/文员", "市场/传媒", "工程/技术",
    "家政/服务", "客服/前台",
    # 语言要求
    "需要中文", "无语言要求", "英语即可",
    # 适合人群
    "留学生适合", "华人优先", "无经验可",
    # 工作条件
    "远程可选", "迷你岗", "实习岗",
    # 签证相关
    "可办工作签证",
]

TAG_DISPLAY = {
    "IT/技术": "IT/技术",
    "餐饮/酒店": "餐饮/酒店",
    "零售/销售": "零售/销售",
    "制造/物流": "制造/物流",
    "金融/会计": "金融/会计",
    "教育/培训": "教育/培训",
    "医疗/护理": "医疗/护理",
    "行政/文员": "行政/文员",
    "市场/传媒": "市场/传媒",
    "工程/技术": "工程/技术",
    "家政/服务": "家政/服务",
    "客服/前台": "客服/前台",
    "需要中文": "需要中文",
    "无语言要求": "无语言要求",
    "英语即可": "英语即可",
    "留学生适合": "留学生适合",
    "华人优先": "华人优先",
    "无经验可": "无经验可",
    "远程可选": "远程可选",
    "迷你岗": "迷你岗",
    "实习岗": "实习岗",
    "可办工作签证": "可办工作签证",
}

# ── System prompt ──────────────────────────────────────────────────────
SYSTEM_PROMPT = """你是一个德国招聘信息分析助手。每个任务我会发送一条德语职位描述，你需要：
1. 将其翻译成中文（200字以内，保留关键细节）
2. 根据内容判断该职位的标签，从以下候选列表中选择最合适的1-4个标签

候选标签列表：
IT/技术, 餐饮/酒店, 零售/销售, 制造/物流, 金融/会计,
教育/培训, 医疗/护理, 行政/文员, 市场/传媒, 工程/技术,
家政/服务, 客服/前台,
需要中文, 无语言要求, 英语即可,
留学生适合, 华人优先, 无经验可,
远程可选, 迷你岗, 实习岗, 可办工作签证

输出格式（严格按以下 JSON，不要有任何其他内容）：
{
  "description_zh": "中文翻译（200字以内）",
  "tags": ["标签1", "标签2", ...]
}

注意：
- description_zh 必须是完整的中文段落，不是单词翻译
- tags 数量1-4个，只选最相关的
- 只输出 JSON，不要解释"""

# ── Tools ───────────────────────────────────────────────────────────────
def run_sql(sql: str) -> list[dict]:
    """通过 supabase db query 执行 SQL，返回 JSON 数组"""
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", "--output", "json"],
        input=sql.encode(),
        capture_output=True, timeout=60
    )
    if proc.returncode != 0:
        print(f"SQL error: {proc.stderr.decode()[:200]}")
        return []
    try:
        return json.loads(proc.stdout.decode())
    except:
        return []

def fetch_description_de(refnr: str) -> str | None:
    """通过 BA Details API 获取原始德语描述（description_de）"""
    enc = base64.b64encode(refnr.encode()).decode()
    try:
        resp = httpx.get(f"{BA_DETAIL_BASE}/{enc}", headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        data = resp.json()
        return data.get("stellenangebotsBeschreibung") or None
    except Exception as e:
        print(f"  fetch_detail error {refnr}: {e}")
        return None

def translate_one(refnr: str, description_de: str, attempt: int = 0) -> dict | None:
    """调 MiniMax M2.7 翻译 + 打标签，返回 {"description_zh": ..., "tags": [...]}"""
    # 把描述截到 3000 字符，避免超出 token 限制
    desc = description_de[:3000] if description_de else ""

    payload = {
        "model": MINIMAX_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": f"职位描述：\n{desc}"}
        ],
        "max_tokens": 500,
        "temperature": 0.1,
    }
    try:
        resp = httpx.post(
            f"{MINIMAX_BASE}/v1/messages",
            headers={
                "Authorization": f"Bearer {MINIMAX_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=30,
        )
        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code}: {resp.text[:200]}")
            return None
        data = resp.json()
        # MiniMax M2.7 返回 content 是数组，取 text 元素
        content = data.get("content", [])
        if isinstance(content, list):
            text = next((c["text"] for c in content if c.get("type") == "text"), None)
        else:
            text = content if isinstance(content, str) else None
        if not text:
            print(f"  No text in response")
            return None
        # text 是 MiniMax 返回的 content 数组中 type="text" 的项
        # 结构: [{"type": "text", "text": "{...json...}"}]
        # 需要把 text 字段本身当作 JSON 解析
        try:
            inner = json.loads(text)  # text 是 '{"type":"text","text":"..."}' 这样的字串
            actual_content = inner.get("text", "") if isinstance(inner, dict) else str(inner)
        except json.JSONDecodeError:
            actual_content = text

        # actual_content 现在应该是 '```json\n{...}\n```' 格式
        actual_content = actual_content.strip()
        if actual_content.startswith("```"):
            # Strip code block markers
            lines = actual_content.split("\n")
            # Remove first line (```json) and last line (```)
            start_idx = 1
            end_idx = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            actual_content = "\n".join(lines[start_idx:end_idx])

        # 清理不可见控制字符
        actual_content = actual_content.replace("\x00", "").replace("\r", "")

        # 修复常见 JSON 破坏问题：中文引号、其他不可见控制符
        import re
        # Remove any control characters except \n and \t
        actual_content = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', actual_content)

        try:
            result = json.loads(actual_content)
        except json.JSONDecodeError as e:
            # 尝试修复：如果 description_zh 值里有未转义的引号，截断到上一个安全位置
            m = re.search(r'"description_zh":\s*"([^"]*(?:\\.[^"]*)*)"', actual_content)
            if m:
                desc_val = m.group(1)
                if desc_val.endswith(('\\', '"')):
                    print(f"  [修复尝试] desc_zh 截断在: {desc_val[-30:]}")
            print(f"  JSON parse error: {e}, content starts: {actual_content[:150]}")
            return None

        if "description_zh" in result and "tags" in result:
            return result
        print(f"  Missing keys: {result}")
        return None
    except json.JSONDecodeError as e:
        print(f"  JSON parse error: {e}, resp: {resp.text[:300]}")
        return None
    except Exception as e:
        print(f"  API error: {e}")
        return None

def build_update_sql(refnr: str, description_zh: str, tags: list[str]) -> str:
    """生成 UPDATE SQL，单条"""
    d = description_zh.replace("'", "''")
    # PostgreSQL text[] literal: '{elem1,elem2,...}' — no quotes around strings inside
    pg_tags = "{" + ",".join(f'"{t}"' for t in tags) + "}"
    return (
        f"UPDATE jobs SET "
        f"description_zh = '{d}', "
        f"tags = '{pg_tags}'::text[], "
        f"translated = true, "
        f"translated_at = NOW() "
        f"WHERE refnr = '{refnr.replace(chr(39), chr(39)+chr(39))}';"
    )

# ── Main ───────────────────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=5)
    parser.add_argument("--delay", type=float, default=4.0)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--refetch-de", action="store_true", help="重新抓取 description_de（针对已抓过但翻译失败的）")
    args = parser.parse_args()

    print("读取待翻译职位列表...")
    # 找出 description_de 有值但 description_zh 为 NULL 的记录
    sql = (
        "SELECT refnr, title_de, employer, COALESCE(description_de, '') as description_de, "
        "COALESCE(description_zh, '') as description_zh "
        "FROM jobs WHERE description_de IS NOT NULL AND LENGTH(description_de) > 20 "
        "AND (description_zh IS NULL OR description_zh = '')"
    )
    if args.limit > 0:
        sql += f" LIMIT {args.limit}"

    jobs = run_sql(sql)
    print(f"共 {len(jobs)} 条待翻译（description_de 有内容但 description_zh 为空）")

    if not jobs:
        # 尝试读取所有有 description_de 的记录
        sql2 = "SELECT refnr, title_de, employer, COALESCE(description_de, '') as description_de FROM jobs WHERE description_de IS NOT NULL AND LENGTH(description_de) > 20"
        all_jobs = run_sql(sql2)
        print(f"所有有 description_de 的记录: {len(all_jobs)}")
        if all_jobs:
            # 检查 description_zh 情况
            for j in all_jobs[:3]:
                print(f"  {j['refnr']}: description_zh = '{j.get('description_zh','')[:50]}'")
        return

    results = []
    errors  = []

    for i, job in enumerate(jobs):
        refnr = job["refnr"]
        title = job.get("title_de", "")
        employer = job.get("employer", "")
        desc_de = job.get("description_de", "")

        # 重新抓取 description_de
        if args.refetch_de:
            print(f"  [{i+1}/{len(jobs)}] 重新抓取: {refnr}")
            desc_de = fetch_description_de(refnr)
            time.sleep(0.3)
            if not desc_de:
                print(f"    抓取失败，跳过")
                errors.append({"refnr": refnr, "reason": "fetch_failed"})
                continue

        print(f"  [{i+1}/{len(jobs)}] {refnr} — {title[:30]} ({employer})")
        result = translate_one(refnr, desc_de)
        time.sleep(args.delay)

        if result:
            results.append({
                "refnr": refnr,
                "description_zh": result["description_zh"],
                "tags": result["tags"],
            })
            print(f"    ✓ tags={result['tags']}")
        else:
            errors.append({"refnr": refnr, "reason": "api_error"})
            print(f"    ✗ 翻译失败")

        # 每20条打一次进度
        if (i + 1) % 20 == 0:
            print(f"\n  进度: {i+1}/{len(jobs)} | 成功: {len(results)} | 失败: {len(errors)}\n")

    print(f"\n翻译完成: {len(results)} 成功, {len(errors)} 失败")

    if args.dry_run:
        print("\n[DRY RUN] 前3条预览:")
        for r in results[:3]:
            print(f"  {r['refnr']}: {r['description_zh'][:80]}...")
            print(f"    tags: {r['tags']}")
        return

    if not results:
        print("没有结果可更新")
        return

    # 批量写入数据库，每次最多 20 条（避免 SQL 过长）
    BATCH = 20
    total_updated = 0
    for batch_start in range(0, len(results), BATCH):
        batch = results[batch_start: batch_start + BATCH]
        sql_lines = ["BEGIN;"]
        for item in batch:
            sql_lines.append(build_update_sql(item["refnr"], item["description_zh"], item["tags"]))
        sql_lines.append("COMMIT;")

        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as f:
            f.write("\n".join(sql_lines))
            sql_file = f.name

        proc = subprocess.run(
            ["supabase", "db", "query", "--linked"],
            stdin=open(sql_file, "rb"),
            capture_output=True, timeout=60
        )
        os.unlink(sql_file)

        if proc.returncode == 0:
            total_updated += len(batch)
            print(f"  已写入 {len(batch)} 条 (总计 {total_updated}/{len(results)})")
        else:
            print(f"  SQL 执行失败: {proc.stderr.decode()[:200]}")
            # 继续下一批

    print(f"\n✓ 完成！共写入 {total_updated} 条翻译+标签")

    if errors:
        print(f"\n失败记录 ({len(errors)} 条):")
        for e in errors[:10]:
            print(f"  - {e['refnr']}: {e['reason']}")

if __name__ == "__main__":
    main()