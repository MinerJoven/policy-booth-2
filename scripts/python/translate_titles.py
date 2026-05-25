#!/usr/bin/env python3
"""
快速翻译 title_de → title_zh
支持 JSON Lines 和 JSON 数组两种格式
"""
import os, sys, json, time, subprocess, tempfile, re, httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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
DELAY = 8
BATCH_SIZE = 5
MAX_TOKENS = 1500

SYSTEM_PROMPT = (
    "你是一个德语职位标题翻译助手。将德语职位标题翻译成简洁的中文（不超过30字）。\n"
    "规则：\n"
    "- 保留 (m/w/d) 或 (m/f/d) 等性别标注，保留英文专业术语\n"
    "- 德语常见词：Praktikum=实习, Ausbildung=培训, Fachkraft=专员, Assistenz=助理\n"
    '- 只输出JSON：{"refnr":"编号","title_zh":"中文标题"}\n'
    "只输出JSON，不要解释，不要thinking，不要任何思考过程。"
)

def run_sql(sql: str) -> list[dict]:
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", "--output", "json"],
        input=sql.encode(), capture_output=True, timeout=60
    )
    if proc.returncode != 0:
        return []
    try:
        return json.loads(proc.stdout.decode())
    except:
        return []

def write_titles(results: list[dict]) -> int:
    if not results:
        return 0
    BATCH = 20
    total = 0
    for batch_start in range(0, len(results), BATCH):
        batch = results[batch_start: batch_start + BATCH]
        sql_lines = ["BEGIN;"]
        for item in batch:
            t = item["title_zh"].replace("'", "''")
            refnr = item["refnr"].replace("'", "''")
            sql_lines.append(f"UPDATE jobs SET title_zh = '{t}' WHERE refnr = '{refnr}';")
        sql_lines.append("COMMIT;")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as f:
            f.write("\n".join(sql_lines))
            sql_file = f.name
        proc = subprocess.run(
            ["supabase", "db", "query", "--linked"],
            stdin=open(sql_file, "rb"), capture_output=True, timeout=60
        )
        os.unlink(sql_file)
        if proc.returncode == 0:
            total += len(batch)
    return total

def translate_batch(jobs: list[dict]) -> tuple[list[dict], list[dict]]:
    parts = []
    for i, job in enumerate(jobs, 1):
        parts.append(f"===JOB {i}===\nrefnr: {job['refnr']}\n标题: {job['title_de']}")

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
            json=payload, timeout=60,
        )
        if resp.status_code != 200:
            return [], jobs

        data = resp.json()
        content = data.get("content", [])

        # 只取 type="text" 的块，忽略 thinking 块
        text_blocks = []
        for c in content:
            if isinstance(c, dict) and c.get("type") == "text":
                t = c.get("text", "").strip()
                if t:
                    text_blocks.append(t)

        text = "\n".join(text_blocks)
        if not text:
            return [], jobs

        # 去掉 code fence
        if text.startswith("```"):
            lines = text.split("\n")
            start = 1 if lines[0].strip().startswith("```") else 0
            end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            text = "\n".join(lines[start:end]).strip()

        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text).strip()

        # 支持 JSON Lines（每行一个JSON）或 JSON 数组
        result = None
        if text.startswith("{"):
            # JSON Lines: 逐行解析
            results = []
            for line in text.split("\n"):
                line = line.strip()
                if line.startswith("{"):
                    try:
                        results.append(json.loads(line))
                    except:
                        pass
            if results:
                result = results

        if result is None:
            try:
                parsed = json.loads(text)
                if isinstance(parsed, list):
                    result = parsed
                elif isinstance(parsed, dict):
                    result = [parsed]
            except:
                pass

        if result is None:
            return [], jobs

        result_map = {r["refnr"]: r for r in result}
        success, failed = [], []
        for job in jobs:
            refnr = job["refnr"]
            if refnr in result_map and "title_zh" in result_map[refnr]:
                success.append({"refnr": refnr, "title_zh": result_map[refnr]["title_zh"]})
            else:
                failed.append(job)
        return success, failed

    except:
        return [], jobs

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--delay", type=float, default=DELAY)
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    print("读取缺少 title_zh 的职位...")
    sql = (
        "SELECT refnr, title_de FROM jobs "
        "WHERE is_active = true AND (title_zh IS NULL OR title_zh = '') "
        "ORDER BY refnr"
    )
    if args.limit > 0:
        sql += f" LIMIT {args.limit}"

    jobs = run_sql(sql)
    print(f"共 {len(jobs)} 条需要标题翻译")

    if not jobs:
        print("没有需要翻译标题的记录")
        return

    all_success, all_failed = [], []

    for i in range(0, len(jobs), args.batch_size):
        batch = jobs[i: i + args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (len(jobs) + args.batch_size - 1) // args.batch_size

        print(f"\n[{batch_num}/{total_batches}] {batch[0]['refnr'][:20]}... 等 {len(batch)} 条")

        success, failed = translate_batch(batch)
        print(f"  成功: {len(success)}, 失败: {len(failed)}")

        if success:
            written = write_titles(success)
            print(f"  写入: {written} 条")
            all_success.extend(success)

        if failed:
            time.sleep(args.delay)
            success2, failed2 = translate_batch(failed)
            if success2:
                written2 = write_titles(success2)
                print(f"  重试成功: {written2} 条")
                all_success.extend(success2)
            all_failed.extend(failed2)

        time.sleep(args.delay)

    print(f"\n=== 完成 ===")
    print(f"成功: {len(all_success)} 条，失败: {len(all_failed)} 条")
    if all_failed:
        for j in all_failed[:5]:
            print(f"  - {j['refnr']}")

if __name__ == "__main__":
    main()