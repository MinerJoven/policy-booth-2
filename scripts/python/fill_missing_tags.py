#!/usr/bin/env python3
"""
为已有 description_zh 但 tags 为空的职位补生成标签。
不重新翻译 description，只调用 classifyJob 生成 tags。
"""
import os, sys, json, time, subprocess, tempfile, re, httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Config ──────────────────────────────────────────────────────────────
def load_minimax_key() -> str:
    env_paths = [
        os.path.expanduser("~/.hermes/profiles/dev/.env"),
        os.path.expanduser("~/.hermes/.env"),
    ]
    for path in env_paths:
        if os.path.exists(path):
            for line in open(path):
                if "MINIMAX" in line and "API_KEY" in line and "=" in line:
                    key = line.split("=", 1)[1].strip()
                    if key and key != "***":
                        return key
    return ""

MINIMAX_KEY  = load_minimax_key()
MINIMAX_BASE = os.environ.get("MINIMAX_BASE_URL", "https://api.minimaxi.com/anthropic")
MINIMAX_MODEL = os.environ.get("MINIMAX_MODEL", "MiniMax-M2.7")
DELAY = 12
BATCH_SIZE = 10
MAX_TOKENS = 1500

# ── Tag 定义 ───────────────────────────────────────────────────────────
AVAILABLE_TAGS = [
    "IT/技术", "餐饮/酒店", "零售/销售", "制造/物流", "金融/会计",
    "教育/培训", "医疗/护理", "行政/文员", "市场/传媒", "工程/技术",
    "家政/服务", "客服/前台",
    "需要中文", "无语言要求", "英语即可",
    "留学生适合", "华人优先", "无经验可",
    "远程可选", "迷你岗", "实习岗", "可办工作签证",
]

SYSTEM_PROMPT = (
    "你是一个德国招聘信息分类助手。根据职位描述，从候选标签中选择1-4个最相关的标签。\n"
    "候选标签：" + ", ".join(AVAILABLE_TAGS) + "\n"
    "重要规则：\n"
    "- 需要中文：仅在职位明确要求中文水平（必须、会话、native）时才打此标签。仅写\"优先/加分项/有优势\"的不算需要中文\n"
    "- 标签只选最相关的，不确定的不打\n"
    "输出格式（严格JSON数组，不要有任何其他内容）：\n"
    '[{"refnr":"职位编号","tags":["标签1","标签2"]}]\n'
    "只输出JSON，不要解释，不要thinking。"
)

# ── DB ────────────────────────────────────────────────────────────────
def run_sql(sql: str) -> list[dict]:
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

def write_tags(results: list[dict]) -> int:
    """只更新 tags 字段，每次最多 20 条"""
    if not results:
        return 0
    BATCH = 20
    total = 0
    for batch_start in range(0, len(results), BATCH):
        batch = results[batch_start: batch_start + BATCH]
        sql_lines = ["BEGIN;"]
        for item in batch:
            pg_tags = "{" + ",".join(f'"{t}"' for t in item["tags"]) + "}"
            refnr = item["refnr"].replace("'", "''")
            sql_lines.append(
                f"UPDATE jobs SET tags = '{pg_tags}'::text[] "
                f"WHERE refnr = '{refnr}';"
            )
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
            total += len(batch)
        else:
            print(f"  SQL 失败: {proc.stderr.decode()[:200]}")
    return total

# ── Classify ──────────────────────────────────────────────────────────
def classify_batch(jobs: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    一次 API 调用对整批生成标签。返回 (成功列表, 失败列表)
    """
    parts = []
    for i, job in enumerate(jobs, 1):
        desc = (job.get("description_zh") or job.get("description_de") or "")[:2000]
        title = job.get("title_de", "")[:100]
        parts.append(f"===JOB {i}===\nrefnr: {job['refnr']}\n职位: {title}\n描述: {desc}")

    user_content = "\n\n".join(parts)

    payload = {
        "model": MINIMAX_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "max_tokens": MAX_TOKENS,
        "temperature": 0.1,
    }

    try:
        resp = httpx.post(
            f"{MINIMAX_BASE}/v1/messages",
            headers={"Authorization": f"Bearer {MINIMAX_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=60,
        )

        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code}: {resp.text[:200]}")
            return [], jobs

        data = resp.json()
        content = data.get("content", [])
        if isinstance(content, list):
            text = next((c.get("text", "") for c in content if c.get("type") == "text"), "")
        else:
            text = str(content)

        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            start = 1 if lines[0].strip().startswith("```") else 0
            end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            text = "\n".join(lines[start:end])

        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
        result = json.loads(text)

        if not isinstance(result, list):
            print(f"  返回不是数组: {type(result)}")
            return [], jobs

        result_map = {r["refnr"]: r for r in result}

        success, failed = [], []
        for job in jobs:
            refnr = job["refnr"]
            if refnr in result_map and "tags" in result_map[refnr]:
                success.append({
                    "refnr": refnr,
                    "tags": result_map[refnr].get("tags", []),
                })
            else:
                failed.append(job)

        return success, failed

    except json.JSONDecodeError as e:
        print(f"  JSON 解析失败: {e}")
        return [], jobs
    except Exception as e:
        print(f"  API 错误: {e}")
        return [], jobs

# ── Main ──────────────────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--delay", type=float, default=DELAY)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("读取需要标签的职位...")
    sql = (
        "SELECT refnr, title_de, description_zh, description_de "
        "FROM jobs "
        "WHERE is_active = true "
        "AND description_zh IS NOT NULL AND LENGTH(description_zh) > 10 "
        "AND (tags IS NULL OR array_length(tags, 1) IS NULL) "
        "ORDER BY refnr"
    )
    if args.limit > 0:
        sql += f" LIMIT {args.limit}"

    jobs = run_sql(sql)
    print(f"共 {len(jobs)} 条需要标签")

    if not jobs:
        print("没有需要标签的记录")
        return

    if args.dry_run:
        print(f"\n[DRY RUN] 前5条:")
        for j in jobs[:5]:
            print(f"  {j['refnr']}: {j.get('title_de','')[:50]}")
        return

    all_success = []
    all_failed = []

    for i in range(0, len(jobs), args.batch_size):
        batch = jobs[i: i + args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (len(jobs) + args.batch_size - 1) // args.batch_size

        refnrs = [j["refnr"] for j in batch]
        print(f"\n[{batch_num}/{total_batches}] 批次 {refnrs[0][:20]}... 等 {len(batch)} 条")

        success, failed = classify_batch(batch)
        print(f"  成功: {len(success)}, 失败: {len(failed)}")

        if success:
            written = write_tags(success)
            print(f"  写入: {written} 条")
            all_success.extend(success)

        if failed:
            print(f"  重试...")
            time.sleep(args.delay)
            success2, failed2 = classify_batch(failed)
            if success2:
                written2 = write_tags(success2)
                print(f"  重试成功: {written2} 条")
                all_success.extend(success2)
            all_failed.extend(failed2)

        time.sleep(args.delay)

    print(f"\n=== 完成 ===")
    print(f"成功: {len(all_success)} 条")
    print(f"失败: {len(all_failed)} 条")
    if all_failed:
        print("失败 refnr:")
        for j in all_failed[:10]:
            print(f"  - {j['refnr']}")

if __name__ == "__main__":
    main()