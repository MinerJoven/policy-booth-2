#!/usr/bin/env python3
"""
生成 UPDATE SQL 用于填充 description_de 字段
读取所有活跃职位 refnr，调 BA Details API 获取描述，
生成 SQL 语句写入 /tmp/job_desc_updates.sql
然后用 supabase db query --linked 执行
"""
import os, sys, json, base64, time, subprocess, argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import httpx

BA_DETAIL_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails"
HEADERS = {"X-API-Key": "jobboerse-jobsuche", "User-Agent": "policy-booth-2/1.0"}

def fetch_detail(refnr: str) -> str | None:
    enc = base64.b64encode(refnr.encode()).decode()
    try:
        resp = httpx.get(f"{BA_DETAIL_BASE}/{enc}", headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        data = resp.json()
        return data.get("stellenangebotsBeschreibung") or None
    except:
        return None

def escape_sql(s: str) -> str:
    return s.replace("'", "''").replace("\x00", "")[:10000]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--skip-existing", action="store_true", help="跳过已有 description_de 的职位")
    args = parser.parse_args()

    # 读取现有数据（需要 SUPABASE_URL 环境变量）
    try:
        from supabase import create_client
        url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
        if url and key:
            sb = create_client(url, key)
            result = sb.table("jobs").select("refnr, description_de").eq("is_active", True).execute()
            jobs = result.data or []
        else:
            print("No supabase creds, using dry-run mode")
            args.dry_run = True
            jobs = []
    except Exception as e:
        print(f"Supabase error: {e}, using dry-run mode")
        args.dry_run = True
        jobs = []

    if args.skip_existing and jobs:
        jobs = [j for j in jobs if not j.get("description_de") or len(j.get("description_de", "")) < 20]
        print(f"跳过已有描述后剩余 {len(jobs)} 个职位")

    if args.limit > 0:
        jobs = jobs[:args.limit]

    print(f"处理 {len(jobs)} 个职位...")

    updates = []
    for i, job in enumerate(jobs):
        refnr = job["refnr"]
        existing = job.get("description_de", "")
        if args.skip_existing and existing and len(existing) > 20:
            continue

        print(f"  [{i+1}/{len(jobs)}] Fetching {refnr}...", end=" ", flush=True)
        desc = fetch_detail(refnr)
        time.sleep(0.3)

        if desc:
            print(f"OK ({len(desc)} chars)")
            updates.append((refnr, desc))
        else:
            print("FAIL")

    print(f"\n成功获取 {len(updates)} 个描述")

    if args.dry_run:
        print("\n[DRY RUN] 前3条SQL:")
        for refnr, desc in updates[:3]:
            print(f"UPDATE jobs SET description_de = '{escape_sql(desc)[:100])}...' WHERE refnr = '{refnr}';")
        return

    if not updates:
        print("没有更新")
        return

    # 生成 SQL 文件
    sql_lines = ["BEGIN;"]
    for refnr, desc in updates:
        sql = f"UPDATE jobs SET description_de = '{escape_sql(desc)}' WHERE refnr = '{refnr.replace("'", "''")}';"
        sql_lines.append(sql)
    sql_lines.append("COMMIT;")

    sql_file = "/tmp/job_desc_updates.sql"
    with open(sql_file, "w", encoding="utf-8") as f:
        f.write("\n".join(sql_lines))

    print(f"\nSQL已写入 {sql_file}，共 {len(updates)} 条")
    print("执行: supabase db query --linked -f /tmp/job_desc_updates.sql")

if __name__ == "__main__":
    main()
