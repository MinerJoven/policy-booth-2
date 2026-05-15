#!/usr/bin/env python3
"""
政策展台 2.0 — 联邦劳动局 (BA) Jobbörse API 同步脚本
对应 SPEC.md 4.2 节

BA_API_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs"
BA_API_KEY = 从环境变量 BA_API_KEY 读取，回退值为 jobboerse-jobsuche
文档: github.com/bundesAPI/jobsuche-api
"""

import os
import sys
import json
import hashlib
import argparse
from datetime import datetime, date, timedelta
from typing import Any

# Add parent dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from supabase import create_client, Client

# --- Config ---
BA_API_BASE = "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs"
BA_API_KEY = os.environ.get("BA_API_KEY", "jobboerse-jobsuche")
HEADERS = {"X-API-Key": BA_API_KEY, "User-Agent": "policy-booth-2/1.0"}

# 华人特供关键词
JOB_KEYWORDS = [
    "Werkstudent",
    "Praktikum",
    "Ausbildung",
    "Chinesisch",
    "Mandarin",
    "Chinese",
    "Informatik",
    "Software",
    "Data",
    "English",
    "International",
]

# 工作类型映射 (arbeitszeit → 中文)
WORK_TYPE_MAP = {
    "vz": "全职",
    "tz": "兼职",
    "ho": "远程",
    "mj": "迷你岗",
    "aa": "实习",
}


def get_supabase() -> Client:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


def fetch_jobs(keyword: str, page: int = 1, size: int = 25) -> dict[str, Any]:
    """从 BA Jobbörse API 拉取职位"""
    params = {
        "was": keyword,
        "umkreis": "50",
        "veroeffentlichtseit": "7",  # 近7天
        "angebotsart": "1",          # 工作
        "pav": "false",              # 不含私人中介
        "page": page,
        "size": size,
    }
    with httpx.Client(timeout=30.0) as client:
        resp = client.get(BA_API_BASE, params=params, headers=HEADERS)
        resp.raise_for_status()
        return resp.json()


def classify_work_type(arbeitszeit_codes: list[str]) -> list[str]:
    """将 BA 的 arbeitszeit 代码转为中文标签"""
    result = []
    for code in arbeitszeit_codes:
        label = WORK_TYPE_MAP.get(code.lower())
        if label:
            result.append(label)
    return result if result else []


def keyword_to_tags(keyword: str) -> list[str]:
    """根据搜索关键词推断华人特供标签"""
    tags = []
    kw = keyword.lower()
    if kw in ("w", "werkstudent"):
        tags.append("留学生适合")
    if kw in ("p", "praktikum", "praktika"):
        tags.append("实习岗")
    if kw in ("a", "ausbildung"):
        tags.append("实习岗")
        tags.append("无经验可")
    if kw in ("chinesisch", "mandarin", "chinese"):
        tags.append("需要中文")
    if kw in ("english",):
        tags.append("英语即可")
    if kw in ("informatik", "software", "data"):
        tags.append("IT/技术")
    if kw in ("international",):
        tags.append("留学生适合")
    return list(dict.fromkeys(tags))  # dedupe while preserving order


def detect_job_tags(job: dict[str, Any]) -> list[str]:
    """检测职位描述中的关键词标签（需要详情数据）"""
    tags = []
    text = json.dumps(job).lower()

    if any(kw in text for kw in ["chinesisch", "mandarin", "chinese"]):
        tags.append("需要中文")
    if any(kw in text for kw in ["heimarbeit", "homeoffice", "remote", "fernarbeit"]):
        tags.append("远程可选")
    if any(kw in text for kw in ["english ok", "no german", "german not required", "keine deutschkenntnisse"]):
        tags.append("无语言要求")
    if any(kw in text for kw in ["werkstudent"]):
        tags.append("留学生适合")
    if any(kw in text for kw in ["praktikum", "ausbildung"]):
        tags.append("实习岗")

    return tags


def normalize_job(raw: dict[str, Any]) -> dict[str, Any]:
    """将 BA API 原始数据标准化为 jobs 表字段"""
    # API 返回的 refnr 在顶层，arbeitsmarktdaten 在某些响应中为空
    refnr = str(raw.get("refnr", "")) or str(raw.get("arbeitsmarktdaten", {}).get("refnr", ""))
    title_de = raw.get("titel", "") or raw.get("berufsbezeichnung", "") or ""

    # 工作城市
    city = ""
    if "arbeitsort" in raw:
        ort = raw["arbeitsort"]
        city = ort.get("ort", ort.get("stadt", "")) or ""

    # 州代码 — BA API 在 arbeitsort.region（不在顶层 raw.region）
    state_code = (
        raw.get("arbeitsort", {}).get("region", "")
        or raw.get("region", "")
        or ""
    )

    # 发布时间
    published_at = None
    if "aktuelleVeroeffentlichungsdatum" in raw:
        published_at = raw["aktuelleVeroeffentlichungsdatum"][:10] if len(raw["aktuelleVeroeffentlichungsdatum"]) >= 10 else None

    # 工作类型 - 有些响应直接包含
    arbeitszeit = raw.get("arbeitszeit", []) or raw.get("arbeitsmarktdaten", {}).get("arbeitszeit", [])
    work_type = classify_work_type(arbeitszeit if isinstance(arbeitszeit, list) else [])

    return {
        "refnr": refnr,
        "title_de": title_de,
        "employer": raw.get("arbeitgeber", "") or "",
        "city": city,
        "state_code": state_code,
        "work_type": work_type,
        "is_limited": False,
        "entry_date": None,
        "tags": detect_job_tags(raw),
        "source_url": f"https://www.arbeitsagentur.de/jobsuche/jobangebot/{refnr}",
        "published_at": published_at,
        "is_active": True,
        "translated": False,
        "synced_at": datetime.utcnow().isoformat(),
    }


def sync_jobs(supabase: Client, dry_run: bool = False) -> dict[str, int]:
    """
    主同步流程：
    1. 并发拉取多个关键词下的近7天岗位
    2. 按 refnr 去重，同一职位合并关键词标签
    3. upsert 写入 jobs 表
    4. 检测下架
    """
    all_jobs: dict[str, dict] = {}       # refnr -> normalized job
    all_keywords: dict[str, set[str]] = {}  # refnr -> set of keywords that found it

    for keyword in JOB_KEYWORDS:
        try:
            result = fetch_jobs(keyword)
            stellenangebote = result.get("stellenangebote", [])
            for item in stellenangebote:
                refnr = str(item.get("refnr", "")) or str(item.get("arbeitsmarktdaten", {}).get("refnr", ""))
                if not refnr:
                    continue
                if refnr not in all_jobs:
                    all_jobs[refnr] = normalize_job(item)
                    all_keywords[refnr] = set()
                all_keywords[refnr].add(keyword)
        except Exception as e:
            print(f"[WARN] Failed to fetch keyword '{keyword}': {e}", file=sys.stderr)

    # 合并关键词标签
    for refnr, kws in all_keywords.items():
        keyword_tags: list[str] = []
        for kw in kws:
            keyword_tags.extend(keyword_to_tags(kw))
        existing = all_jobs[refnr]["tags"]
        merged = list(dict.fromkeys(existing + keyword_tags))  # dedupe, existing first
        all_jobs[refnr]["tags"] = merged

    print(f"Fetched {len(all_jobs)} unique jobs from BA API")

    if dry_run:
        print("[DRY RUN] Would upsert the following refnrs:")
        for refnr in list(all_jobs.keys())[:5]:
            print(f"  - {refnr}: {all_jobs[refnr]['title_de']}")
        return {"fetched": len(all_jobs), "upserted": 0, "deactivated": 0}

    # Upsert
    table = supabase.table("jobs")
    upserted = 0
    deactivated = 0

    for refnr, job in all_jobs.items():
        try:
            table.upsert(job, on_conflict="refnr").execute()
            upserted += 1
        except Exception as e:
            print(f"[ERROR] Failed to upsert refnr {refnr}: {e}", file=sys.stderr)

    # 检测下架: DB 中 is_active=true 但本次未返回的 refnr
    fetched_refnrs = set(all_jobs.keys())
    try:
        response = supabase.table("jobs").select("refnr").eq("is_active", True).execute()
        db_active_refnrs = {row["refnr"] for row in response.data}
    except Exception as e:
        print(f"[ERROR] Failed to fetch active refnrs: {e}", file=sys.stderr)
        db_active_refnrs = set()

    to_deactivate = db_active_refnrs - fetched_refnrs
    if to_deactivate:
        for refnr in to_deactivate:
            try:
                supabase.table("jobs").update(
                    {"is_active": False, "updated_at": datetime.utcnow().isoformat()}
                ).eq("refnr", refnr).execute()
                deactivated += 1
            except Exception as e:
                print(f"[ERROR] Failed to deactivate refnr {refnr}: {e}", file=sys.stderr)

    print(f"Upserted: {upserted}, Deactivated: {deactivated}")
    return {"fetched": len(all_jobs), "upserted": upserted, "deactivated": deactivated}


def main():
    parser = argparse.ArgumentParser(description="BA Jobbörse 日同步")
    parser.add_argument("--dry-run", action="store_true", help="仅打印不写入")
    args = parser.parse_args()

    if not args.dry_run:
        supabase = get_supabase()
        result = sync_jobs(supabase, dry_run=args.dry_run)
        print(json.dumps(result))
    else:
        sync_jobs(None, dry_run=True)


if __name__ == "__main__":
    main()
