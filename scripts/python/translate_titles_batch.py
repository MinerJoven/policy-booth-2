#!/usr/bin/env python3
"""
批量翻译职位标题 title_de → title_zh
229条，批量5条/请求，约46次API调用
"""
import os, sys, json, time, subprocess, tempfile, re, httpx
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def load_deepseek_key() -> str:
    env_paths = [
        os.path.expanduser("~/.hermes/.env"),
    ]
    for path in env_paths:
        if os.path.exists(path):
            for line in open(path):
                if "DEEPSEEK_API_KEY" in line and "=" in line:
                    key = line.split("=", 1)[1].strip()
                    if key and key != "***":
                        return key
    return ""

DEEPSEEK_KEY   = load_deepseek_key()
DEEPSEEK_BASE  = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-v4-flash"
BATCH_SIZE = 5
DELAY = 12
MAX_TOKENS=1200

SYSTEM_PROMPT = (
    "你是一个德国招聘信息翻译助手。把德语职位标题翻译成中文。\n"
    "输出格式（严格JSON数组，不要有任何其他内容）：\n"
    '[{"refnr":"编号","title_zh":"中文标题"},...]\n'
    "只输出JSON，不要解释，不要thinking。"
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

def write_results(results: list[dict]) -> int:
    if not results:
        return 0
    BATCH = 50
    total = 0
    for b_start in range(0, len(results), BATCH):
        batch = results[b_start: b_start + BATCH]
        sql_lines = ["BEGIN;"]
        for item in batch:
            t = item["title_zh"].replace("'", "''")
            r = item["refnr"].replace("'", "''")
            sql_lines.append(f"UPDATE jobs SET title_zh = '{t}' WHERE refnr = '{r}';")
        sql_lines.append("COMMIT;")
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as f:
            f.write("\n".join(sql_lines))
            f.flush()
            fname = f.name
        proc = subprocess.run(
            ["supabase", "db", "query", "--linked"],
            stdin=open(fname, "rb"), capture_output=True, timeout=60
        )
        os.unlink(fname)
        if proc.returncode == 0:
            total += len(batch)
    return total

def translate_batch(jobs: list[dict]) -> tuple[list[dict], list[dict]]:
    parts = [f'===JOB {i}===\nrefnr: {j["refnr"]}\n标题: {j["title_de"]}'
             for i, j in enumerate(jobs, 1)]
    user_content = "\n\n".join(parts)
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": SYSTEM_PROMPT},
                     {"role": "user", "content": user_content}],
        "max_tokens": MAX_TOKENS,
        "temperature": 0.1,
    }
    try:
        resp = httpx.post(
            f"{DEEPSEEK_BASE}/v1/chat/completions",
            headers={"Authorization": f"Bearer {DEEPSEEK_KEY}", "Content-Type": "application/json"},
            json=payload, timeout=45,
        )
        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code}")
            return [], jobs
        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)
        parsed = json.loads(text)
        if not isinstance(parsed, list):
            return [], jobs
        result_map = {r["refnr"]: r for r in parsed}
        success, failed = [], []
        for job in jobs:
            rn = job["refnr"]
            if rn in result_map and "title_zh" in result_map[rn]:
                success.append({"refnr": rn, "title_zh": result_map[rn]["title_zh"]})
            else:
                failed.append(job)
        return success, failed
    except Exception as e:
        print(f"  错误: {e}")
        return [], jobs

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--delay", type=float, default=DELAY)
    args = parser.parse_args()

    print("读取待翻译标题...")
    sql = "SELECT refnr, title_de FROM jobs WHERE title_zh IS NULL OR title_zh = '' ORDER BY refnr"
    jobs = run_sql(sql)
    print(f"共 {len(jobs)} 条待翻译")

    if not jobs:
        print("没有待翻译记录")
        return

    all_success, all_failed = 0, 0
    total_batches = (len(jobs) + args.batch_size - 1) // args.batch_size

    for i in range(0, len(jobs), args.batch_size):
        batch = jobs[i: i + args.batch_size]
        bn = i // args.batch_size + 1
        print(f"\n[{bn}/{total_batches}] {batch[0]['refnr'][:30]}...")
        success, failed = translate_batch(batch)
        print(f"  成功: {len(success)}, 失败: {len(failed)}")
        if success:
            w = write_results(success)
            print(f"  写入: {w} 条")
            all_success += len(success)
        if failed:
            all_failed += len(failed)
        time.sleep(args.delay)

    print(f"\n=== 完成 ===")
    print(f"成功: {all_success} 条")
    print(f"失败: {all_failed} 条")

if __name__ == "__main__":
    main()
