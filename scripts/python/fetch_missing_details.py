#!/usr/bin/env python3
"""
抓取缺失 description_de 的职位详情
使用 supabase CLI 做 DB 操作，不依赖 service role key
"""
import os, sys, json, base64, time, subprocess, re, httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

BA_DETAIL_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails"
HEADERS = {"X-API-Key": "jobboerse-jobsuche", "User-Agent": "policy-booth-2/1.0"}

def run_sql(sql: str) -> list[dict]:
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", "--output", "json"],
        input=sql.encode(), capture_output=True, timeout=60
    )
    if proc.returncode != 0:
        print(f"SQL error: {proc.stderr.decode()[:200]}")
        return []
    try:
        return json.loads(proc.stdout.decode())
    except:
        return []

def fetch_detail(refnr: str) -> str | None:
    enc = base64.b64encode(refnr.encode()).decode()
    try:
        resp = httpx.get(f"{BA_DETAIL_BASE}/{enc}", headers=HEADERS, timeout=20)
        if resp.status_code != 200:
            return None
        data = resp.json()
        return data.get("stellenangebotsBeschreibung") or None
    except Exception as e:
        print(f"  fetch error {refnr}: {e}")
        return None

def update_detail(refnr: str, desc_de: str):
    """写 description_de 到 DB"""
    d = desc_de.replace("'", "''")
    sql = f"UPDATE jobs SET description_de = '{d}' WHERE refnr = '{refnr.replace(chr(39), chr(39)+chr(39))}';"
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked"],
        input=sql.encode(), capture_output=True, timeout=30
    )
    if proc.returncode == 0:
        return True
    print(f"  SQL update failed: {proc.stderr.decode()[:100]}")
    return False

def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()

    print("读取缺失 description_de 的职位...")
    sql = (
        "SELECT refnr, title_de FROM jobs "
        "WHERE (description_de IS NULL OR LENGTH(description_de) <= 20) "
        "AND is_active = true ORDER BY refnr"
    )
    if args.limit > 0:
        sql += f" LIMIT {args.limit}"
    jobs = run_sql(sql)
    print(f"共 {len(jobs)} 条缺失")

    if not jobs:
        print("没有缺失记录")
        return

    success, failed = 0, 0
    for i, job in enumerate(jobs, 1):
        refnr = job["refnr"]
        title = job.get("title_de", "")[:40]
        print(f"\n[{i}/{len(jobs)}] {refnr} — {title}")
        desc = fetch_detail(refnr)
        time.sleep(0.5)
        if desc and len(desc) > 20:
            if update_detail(refnr, desc):
                print(f"  ✓ 写入成功 ({len(desc)} chars)")
                success += 1
            else:
                failed += 1
        else:
            print(f"  ✗ 抓取失败或内容太短")
            failed += 1

    print(f"\n=== 完成 ===")
    print(f"成功: {success}, 失败: {failed}")

if __name__ == "__main__":
    main()
