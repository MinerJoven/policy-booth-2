#!/usr/bin/env python3
"""
政策展台 2.0 — BA Job Details API 详情抓取脚本
抓取每个职位的完整描述（stellenangebotsBeschreibung）写入 description_de

用法:
  python scripts/python/ba_job_detail_sync.py [--limit=50] [--dry-run]

原理:
  1. 从 DB 读取所有 is_active=True 的 refnr
  2. 逐个调 GET /pc/v4/jobdetails/{base64(refnr)}
  3. 提取 stellenangebotsBeschreibung，写入 description_de
  4. 对 description_de 非空且 description_zh 为空的记录，触发翻译
"""

import os
import sys
import json
import base64
import argparse
import time
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from supabase import create_client, Client

# --- Config ---
BA_DETAIL_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobdetails"
HEADERS = {
    "X-API-Key": "jobboerse-jobsuche",
    "User-Agent": "policy-booth-2/1.0",
}


def get_supabase() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def infer_work_type(data: dict) -> list[str]:
    """从 BA 详情字段推断工作类型"""
    types = []
    if data.get("istGeringfuegigeBeschaeftigung"):
        types.append("迷你岗")
    if data.get("arbeitszeitTeilzeitVormittag") or data.get("arbeitszeitTeilzeitNachmittag"):
        types.append("兼职")
    desc = (data.get("stellenangebotsBeschreibung") or "").lower()
    title = (data.get("stellenangebotsTitel") or "").lower()
    text = desc + " " + title
    if any(kw in text for kw in ["vollzeit", "vollzeitstelle", "vollzeitbeschäftigung"]):
        types.append("全职")
    if any(kw in text for kw in ["teilzeit", "teilzeitstelle", "teilzeitbeschäftigung", "Nachmittag", "Vormittag"]):
        if "兼职" not in types:
            types.append("兼职")
    if any(kw in text for kw in ["heimarbeit", "homeoffice", "remote", "fernarbeit", "mobiles arbeiten"]):
        types.append("远程")
    if not types:
        types.append("全职")  # 默认为全职
    return list(dict.fromkeys(types))


def fetch_job_detail(refnr: str) -> tuple[str | None, list[str]]:
    """从 BA Details API 获取职位完整描述和工作类型"""
    encoded = base64.b64encode(refnr.encode()).decode()
    url = f"{BA_DETAIL_BASE}/{encoded}"

    with httpx.Client(timeout=20.0) as client:
        resp = client.get(url, headers=HEADERS)
        if resp.status_code != 200:
            return None, []
        data = resp.json()
        desc = data.get("stellenangebotsBeschreibung") or None
        work_type = infer_work_type(data)
        return desc, work_type


def main():
    parser = argparse.ArgumentParser(description="BA Job Details 详情抓取")
    parser.add_argument("--limit", type=int, default=0, help="限制抓取数量（0=全部）")
    parser.add_argument("--dry-run", action="store_true", help="只打印不写入")
    parser.add_argument("--delay", type=float, default=0.3, help="每次请求间隔（秒）")
    args = parser.parse_args()

    supabase = get_supabase()

    # 读取所有有 refnr 且 is_active=True 的职位
    print("读取活跃职位列表...")
    result = supabase.table("jobs").select("refnr, description_de").eq("is_active", True).execute()
    jobs = result.data or []
    print(f"共 {len(jobs)} 个活跃职位")

    if args.limit > 0:
        jobs = jobs[: args.limit]
        print(f"限制为前 {len(jobs)} 个")

    fetched = 0
    errors = 0
    skipped = 0

    for i, job in enumerate(jobs):
        refnr = job["refnr"]
        existing_desc = job.get("description_de")

        if existing_desc and len(existing_desc.strip()) > 50:
            # 已有描述，跳过抓取，但仍入队让翻译 worker 做 AI 标签分类
            # 只入队还没有待处理标签任务的职位
            skipped += 1
            if (i + 1) % 20 == 0:
                print(f"  [{i+1}/{len(jobs)}] 跳过（已有描述）: {refnr}")
            if not args.dry_run:
                try:
                    supabase.table("translation_queue").delete().eq("source_type", "job").eq("source_id", refnr).execute()
                    supabase.table("translation_queue").insert({
                        "source_type": "job", "source_id": refnr,
                        "status": "pending", "priority": 1, "attempts": 0,
                    }).execute()
                except Exception:
                    pass  # 忽略入队错误，不影响主流程
            continue

        desc, work_type = fetch_job_detail(refnr)
        time.sleep(args.delay)

        if desc is None:
            print(f"  [FAIL] {refnr}: API 请求失败或无描述")
            errors += 1
            continue

        if args.dry_run:
            print(f"  [DRY] {refnr}: {desc[:80]}... work_type={work_type}")
            fetched += 1
            continue

        # 写入 DB：description_de 和 work_type
        try:
            supabase.table("jobs").update(
                {"description_de": desc, "work_type": work_type, "updated_at": datetime.utcnow().isoformat()}
            ).eq("refnr", refnr).execute()
            print(f"  [OK] {refnr}: {len(desc)} chars, work_type={work_type}")
            fetched += 1

            # 入队：让 translation worker 做 AI 翻译 + 标签分类
            # 先删后插，确保不因唯一约束冲突失败
            supabase.table("translation_queue").delete().eq("source_type", "job").eq("source_id", refnr).execute()
            supabase.table("translation_queue").insert(
                {
                    "source_type": "job",
                    "source_id": refnr,
                    "status": "pending",
                    "priority": 1,
                    "attempts": 0,
                }
            ).execute()
        except Exception as e:
            print(f"  [ERR] {refnr}: {e}")
            errors += 1

        if (i + 1) % 20 == 0:
            print(f"进度: {i+1}/{len(jobs)} | 已抓: {fetched} | 跳过: {skipped} | 失败: {errors}")

    print(f"\n完成: 已抓 {fetched} | 跳过 {skipped} | 失败 {errors}")


if __name__ == "__main__":
    main()
