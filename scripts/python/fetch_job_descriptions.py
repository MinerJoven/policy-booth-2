#!/usr/bin/env python3
"""
一体化脚本：获取所有 refnr -> 调 BA Details API -> 生成 SQL -> 执行
全流程通过 supabase db query --linked 读写数据库
"""
import os, sys, json, base64, time, subprocess, tempfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import httpx

BA_DETAIL_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails"
HEADERS = {"X-API-Key": "jobboerse-jobsuche", "User-Agent": "policy-booth-2/1.0"}


def run_supabase_query(sql: str) -> list[dict]:
    """通过 supabase db query --linked 执行 SQL，返回 JSON 结果"""
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", "--output", "json"],
        input=sql.encode(),
        capture_output=True, timeout=30
    )
    out = proc.stdout.decode()
    err = proc.stderr.decode()
    if proc.returncode != 0:
        print(f"SQL error: {err[:200]}")
        return []
    try:
        return json.loads(out)
    except:
        return []


def fetch_detail(refnr: str) -> str | None:
    enc = base64.b64encode(refnr.encode()).decode()
    try:
        resp = httpx.get(f"{BA_DETAIL_BASE}/{enc}", headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return None
        data = resp.json()
        return data.get("stellenangebotsBeschreibung") or None
    except Exception as e:
        print(f"  fetch error: {e}")
        return None


def escape_sql(s: str) -> str:
    s = s.replace("\x00", "")
    return s.replace("'", "''")


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--skip-existing", action="store_true")
    args = parser.parse_args()

    # Step 1: 获取需要处理的 refnrs
    where_clause = "is_active = true"
    if args.skip_existing:
        where_clause += " AND (description_de IS NULL OR description_de = '' OR LENGTH(description_de) < 20)"

    sql = f"SELECT refnr, COALESCE(description_de, '') as existing FROM jobs WHERE {where_clause}"
    if args.limit > 0:
        sql += f" LIMIT {args.limit}"

    print("读取职位列表...")
    jobs = run_supabase_query(sql)
    print(f"共 {len(jobs)} 个职位待处理")

    if not jobs:
        print("没有需要处理的职位")
        return

    # Step 2: 逐个抓取
    updates = []
    for i, job in enumerate(jobs):
        refnr = job["refnr"]
        existing = job.get("existing", "")
        if args.skip_existing and existing and len(existing) > 20:
            print(f"  [{i+1}/{len(jobs)}] 跳过已有: {refnr}")
            continue

        print(f"  [{i+1}/{len(jobs)}] {refnr}", end=" ... ", flush=True)
        desc = fetch_detail(refnr)
        time.sleep(0.25)

        if desc:
            updates.append((refnr, desc))
            print(f"OK ({len(desc)} chars)")
        else:
            print("FAIL")

        # 每20个打一次进度
        if (i + 1) % 50 == 0:
            print(f"  进度: {i+1}/{len(jobs)} | 已成功: {len(updates)}")

    print(f"\n成功获取 {len(updates)} 个描述")

    if args.dry_run:
        print("\n[DRY RUN] 前3条:")
        for refnr, desc in updates[:3]:
            print(f"  {refnr}: {desc[:80]}...")
        return

    if not updates:
        print("没有更新")
        return

    # Step 3: 生成 SQL 文件并执行
    sql_lines = ["BEGIN;"]
    for refnr, desc in updates:
        sql_lines.append(
            f"UPDATE jobs SET description_de = '{escape_sql(desc)}' WHERE refnr = '{refnr.replace(chr(39), chr(39)+chr(39))}';"
        )
    sql_lines.append("COMMIT;")

    with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write("\n".join(sql_lines))
        sql_file = f.name

    print(f"\n执行 {len(updates)} 条更新...")
    result = subprocess.run(
        ["supabase", "db", "query", "--linked"],
        stdin=open(sql_file, "rb"),
        capture_output=True, timeout=60
    )
    os.unlink(sql_file)

    if result.returncode == 0:
        print(f"✓ 全部完成！{len(updates)} 个职位描述已写入数据库")
    else:
        print(f"✗ 执行失败: {result.stderr.decode()[:300]}")


if __name__ == "__main__":
    main()
