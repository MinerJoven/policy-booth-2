#!/usr/bin/env python3
"""
批量翻译 pipeline — 一次请求翻译多条，减少 API 调用轮次
- 读取所有 description_de 有值但 description_zh 为空的 jobs
- 每批 5 条，打在一个 prompt 里
- 解析 JSON 数组返回
- 失败整批重试，重试仍失败的单独拆开重试
"""
import os, sys, json, time, subprocess, tempfile, re, httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# ── Config ─────────────────────────────────────────────────────────────
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
BATCH_SIZE = 5        # 每批多少条
DELAY = 12            # 批次间间隔（秒）
MAX_TOKENS = 4000     # 增大 token 上限避免截断
RETRIES = 2          # 整批重试次数

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
    "你是一个德国招聘信息分析助手。我会发送多条德语职位描述，每条以===JOB N===开头。\n"
    "对每条职位：翻译成200字以内中文，从候选标签选1-4个。\n"
    "候选标签：" + ", ".join(AVAILABLE_TAGS) + "\n"
    "重要规则：\n"
    "- 需要中文：仅在职位明确要求中文水平（必须、会话、native）时才打此标签。仅写\"优先/加分项/有优势\"的不算需要中文\n"
    "- 标签只选最相关的，不确定的不打\n"
    "输出格式（严格JSON数组，不要有任何其他内容）：\n"
    '[{"refnr":"职位编号","description_zh":"中文翻译","tags":["标签1"]},...]\n'
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

def write_results(results: list[dict]) -> int:
    """批量写入数据库，每次最多 20 条"""
    if not results:
        return 0
    BATCH = 20
    total = 0
    for batch_start in range(0, len(results), BATCH):
        batch = results[batch_start: batch_start + BATCH]
        sql_lines = ["BEGIN;"]
        for item in batch:
            d = item["description_zh"].replace("'", "''")
            pg_tags = "{" + ",".join(f'"{t}"' for t in item["tags"]) + "}"
            refnr = item["refnr"].replace("'", "''")
            sql_lines.append(
                f"UPDATE jobs SET description_zh = '{d}', tags = '{pg_tags}'::text[], "
                f"translated = true, translated_at = NOW() WHERE refnr = '{refnr}';"
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

# ── Translate ─────────────────────────────────────────────────────────
def translate_batch(jobs: list[dict]) -> tuple[list[dict], list[dict]]:
    """
    一次 API 调用翻译整批。返回 (成功列表, 失败列表)
    失败列表里 refnr 有值但 description_zh 为 None
    """
    # 组装 prompt
    parts = []
    for i, job in enumerate(jobs, 1):
        desc = (job["description_de"] or "")[:3000]
        parts.append(f"===JOB {i}===\nrefnr: {job['refnr']}\n描述:\n{desc}")
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
            headers={
                "Authorization": f"Bearer {MINIMAX_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=60,
        )
        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code}: {resp.text[:200]}")
            return [], jobs  # 整批失败，全部重试

        data = resp.json()
        content = data.get("content", [])
        if isinstance(content, list):
            text = next((c.get("text", "") for c in content if c.get("type") == "text"), "")
        else:
            text = str(content)

        # 提取 JSON 数组
        text = text.strip()
        # 去掉 markdown code fence
        if text.startswith("```"):
            lines = text.split("\n")
            start = 1 if lines[0].strip().startswith("```") else 0
            end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            text = "\n".join(lines[start:end])

        # 清理控制字符
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)

        result = json.loads(text)
        if not isinstance(result, list):
            print(f"  返回不是数组: {type(result)}")
            return [], jobs

        # 建立 refnr → 结果 映射
        result_map = {r["refnr"]: r for r in result}

        success, failed = [], []
        for job in jobs:
            refnr = job["refnr"]
            if refnr in result_map and "description_zh" in result_map[refnr]:
                success.append({
                    "refnr": refnr,
                    "description_zh": result_map[refnr]["description_zh"],
                    "tags": result_map[refnr].get("tags", []),
                })
            else:
                failed.append(job)

        return success, failed

    except json.JSONDecodeError as e:
        print(f"  JSON 解析失败: {e}, 内容: {text[:200] if 'text' in dir() else 'N/A'}")
        return [], jobs
    except Exception as e:
        print(f"  API 错误: {e}")
        return [], jobs

def retry_single(job: dict) -> dict | None:
    """单个 job 重试，用更短的描述"""
    desc = (job["description_de"] or "")[:1500]  # 截更短
    user_content = f"===JOB 1===\nrefnr: {job['refnr']}\n描述:\n{desc}"

    payload = {
        "model": MINIMAX_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "max_tokens": 800,
        "temperature": 0.1,
    }
    try:
        resp = httpx.post(
            f"{MINIMAX_BASE}/v1/messages",
            headers={"Authorization": f"Bearer {MINIMAX_KEY}", "Content-Type": "application/json"},
            json=payload,
            timeout=45,
        )
        if resp.status_code != 200:
            return None
        data = resp.json()
        content = data.get("content", [])
        text = next((c.get("text", "") for c in content if c.get("type") == "text"), "") if isinstance(content, list) else str(content)
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            start = 1 if lines[0].strip().startswith("```") else 0
            end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            text = "\n".join(lines[start:end])
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
        result = json.loads(text)
        if isinstance(result, list) and len(result) > 0:
            return result[0]
        return None
    except:
        return None

# ── Main ──────────────────────────────────────────────────────────────
def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--delay", type=float, default=DELAY)
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    print("读取待翻译职位...")
    sql = (
        "SELECT refnr, title_de, employer, COALESCE(description_de, '') as description_de "
        "FROM jobs WHERE description_de IS NOT NULL AND LENGTH(description_de) > 20 "
        "AND (description_zh IS NULL OR description_zh = '') "
        "ORDER BY refnr"
    )
    if args.limit > 0:
        sql += f" LIMIT {args.limit}"

    jobs = run_sql(sql)
    print(f"共 {len(jobs)} 条待翻译")

    if not jobs:
        print("没有待翻译记录")
        return

    if args.dry_run:
        print(f"\n[DRY RUN] 前3条:")
        for j in jobs[:3]:
            print(f"  {j['refnr']}: {j['description_de'][:80]}...")
        return

    # 分批
    all_success = []
    all_failed = []

    for i in range(0, len(jobs), args.batch_size):
        batch = jobs[i: i + args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (len(jobs) + args.batch_size - 1) // args.batch_size

        refnrs = [j["refnr"] for j in batch]
        titles = [j.get("title_de", "")[:30] for j in batch]
        print(f"\n[{batch_num}/{total_batches}] 批次 {refnrs[0][:20]}... 等 {len(batch)} 条")

        success, failed = translate_batch(batch)
        print(f"  成功: {len(success)}, 失败: {len(failed)}")

        if success:
            written = write_results(success)
            print(f"  写入: {written} 条")
            all_success.extend(success)

        if failed:
            # 整批重试一次
            print(f"  整批重试...")
            time.sleep(args.delay)
            success2, failed2 = translate_batch(failed)
            if success2:
                written2 = write_results(success2)
                print(f"  重试成功: {written2} 条")
                all_success.extend(success2)
            else:
                all_failed.extend(failed2)
                # 单条拆开重试（只重试1次）
                for job in failed2:
                    r = retry_single(job)
                    time.sleep(args.delay)
                    if r and "description_zh" in r:
                        write_results([{
                            "refnr": job["refnr"],
                            "description_zh": r["description_zh"],
                            "tags": r.get("tags", []),
                        }])
                        print(f"  单条重试成功: {job['refnr'][:30]}")
                        all_success.append({"refnr": job["refnr"], "description_zh": r["description_zh"], "tags": r.get("tags", [])})
                    else:
                        print(f"  单条重试失败: {job['refnr'][:30]}")

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
