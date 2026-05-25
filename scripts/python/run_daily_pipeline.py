#!/usr/bin/env python3
"""
政策展台 2.0 — BA Jobbörse 日 pipeline

每日顺序执行：
  1. Sync      (ba_job_sync.py --defer-activate)  — 同步新职位，暂不激活
  2. Fetch     (fetch_missing_details.py)          — 补抓 description_de
  3. Translate (translate_jobs_batch.py)           — 翻译描述
  4. Translate (translate_titles_batch.py)         — 翻译标题
  5. Activate  (SQL UPDATE)                        — 已完成的职位统一上线

只有走完全流程的职位（有 description_de + description_zh + title_zh）才会
is_active=True 对用户可见，避免展示半成品。
"""

import os
import sys
import subprocess
import json
import time
import argparse
from datetime import datetime
from dotenv import load_dotenv

# ── Config ───────────────────────────────────────────────────────────
# 显式路径，避免 dirname 层数搞错
PROJECT_DIR = "/home/joven/policy-booth-2"
SCRIPTS_DIR = "/home/joven/policy-booth-2/scripts/python"
PYTHON = sys.executable

# Load credentials from .env file (cron 无需 export 环境变量)
_dotenv_path = os.path.join(PROJECT_DIR, ".env")
if os.path.exists(_dotenv_path):
    load_dotenv(_dotenv_path, override=True)

# Fallback: also check env vars passed from parent shell (e.g. cron export)
os.environ.setdefault("SUPABASE_URL",
    os.environ.get("NEXT_PUBLIC_SUPABASE_URL", ""))
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY",
    os.environ.get("SUPABASE_SECRET_KEY", ""))


# ── Helpers ──────────────────────────────────────────────────────────

def log(msg: str):
    ts = datetime.utcnow().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def run_script(name: str, args: list[str] | None = None,
               timeout: int = 1800) -> bool:
    """运行子脚本，返回 True=成功 False=失败"""
    script_path = os.path.join(SCRIPTS_DIR, name)
    cmd = [PYTHON, script_path]
    if args:
        cmd.extend(args)

    log(f"▶ {name} {' '.join(args or [])}")
    try:
        proc = subprocess.run(
            cmd, cwd=PROJECT_DIR, capture_output=True, text=True,
            timeout=timeout,
            env={**os.environ,
                 "SUPABASE_URL": os.environ.get("SUPABASE_URL", ""),
                 "SUPABASE_SERVICE_ROLE_KEY": os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")},
        )
        # Print output
        for line in (proc.stdout or "").split("\n"):
            line = line.strip()
            if line:
                print(f"  {line}")
        if proc.stderr and proc.stderr.strip():
            for line in proc.stderr.strip().split("\n"):
                line = line.strip()
                if line:
                    print(f"  [stderr] {line}")

        if proc.returncode != 0:
            log(f"✗ {name} 失败 (exit {proc.returncode})")
            return False
        log(f"✓ {name} 完成")
        return True
    except subprocess.TimeoutExpired:
        log(f"✗ {name} 超时 ({timeout}s)")
        return False
    except FileNotFoundError:
        log(f"✗ {name} 找不到脚本: {script_path}")
        return False
    except Exception as e:
        log(f"✗ {name} 异常: {e}")
        return False


def run_sql(sql: str, timeout: int = 60) -> bool:
    """执行一条 SQL"""
    log(f"▶ SQL: {sql[:120]}...")
    try:
        proc = subprocess.run(
            ["supabase", "db", "query", "--linked"],
            input=sql.encode(), capture_output=True, timeout=timeout,
        )
        if proc.returncode == 0:
            if proc.stdout and proc.stdout.strip():
                print(f"  {proc.stdout.decode().strip()[:200]}")
            log("✓ SQL 完成")
            return True
        else:
            print(f"  [stderr] {proc.stderr.decode()[:200]}")
            log(f"✗ SQL 失败 (exit {proc.returncode})")
            return False
    except Exception as e:
        log(f"✗ SQL 异常: {e}")
        return False


def safety_check_and_activate() -> bool:
    """
    两步走：
    1. 安全下架：把意外激活的半成品打回去（任何 is_active=true 但缺 description_de/description_zh/title_zh 的）
    2. 正常激活：只激活数据完整的记录
    这样即使前面的 Phase 全部失败，也不会出现半成品上线。
    """
    # Step 1: 下架半成品
    result = run_sql(
        "UPDATE jobs SET is_active = FALSE "
        "WHERE is_active = TRUE "
        "AND (description_de IS NULL OR LENGTH(description_de) <= 20 "
        "OR description_zh IS NULL OR LENGTH(description_zh) = 0 "
        "OR title_zh IS NULL OR LENGTH(title_zh) = 0);"
    )
    if not result:
        log("⚠ 安全下架步骤失败，继续尝试激活...")

    # Step 2: 激活完整数据
    return run_sql(
        "UPDATE jobs SET is_active = TRUE "
        "WHERE is_active = FALSE "
        "AND description_de IS NOT NULL AND LENGTH(description_de) > 20 "
        "AND description_zh IS NOT NULL AND LENGTH(description_zh) > 0 "
        "AND title_zh IS NOT NULL AND LENGTH(title_zh) > 0;"
    )


def report_status() -> dict:
    """查询当前数据处理状态"""
    sql = (
        "SELECT "
        "COUNT(*) FILTER (WHERE is_active = true) as active, "
        "COUNT(*) FILTER (WHERE is_active = false) as inactive, "
        "COUNT(*) FILTER (WHERE is_active = true AND title_zh IS NULL) as active_missing_title_zh, "
        "COUNT(*) FILTER (WHERE is_active = true AND description_de IS NULL) as active_missing_desc_de, "
        "COUNT(*) FILTER (WHERE is_active = false AND description_de IS NOT NULL AND LENGTH(description_de) > 20 AND description_zh IS NOT NULL AND title_zh IS NOT NULL) as ready_to_activate, "
        "COUNT(*) FILTER (WHERE is_active = false) as waiting_for_fetch, "
        "COUNT(*) FILTER (WHERE is_active = false AND description_de IS NOT NULL AND LENGTH(description_de) > 20 AND description_zh IS NULL) as waiting_for_translate, "
        "COUNT(*) FILTER (WHERE is_active = false AND description_de IS NOT NULL AND LENGTH(description_de) > 20 AND description_zh IS NOT NULL AND title_zh IS NULL) as waiting_for_title "
        "FROM jobs;"
    )
    try:
        proc = subprocess.run(
            ["supabase", "db", "query", "--linked", "--output", "json"],
            input=sql.encode(), capture_output=True, timeout=30,
        )
        if proc.returncode == 0:
            return json.loads(proc.stdout.decode())[0] if proc.stdout.strip() else {}
    except Exception:
        pass
    return {}


# ── Main ─────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="BA Jobbörse 日 pipeline")
    parser.add_argument("--fetch-limit", type=int, default=500,
                        help="补抓 description_de 上限 (default: 500)")
    parser.add_argument("--translate-batch", type=int, default=5,
                        help="翻译批量大小 (default: 5)")
    parser.add_argument("--translate-delay", type=float, default=13,
                        help="翻译批次间隔秒数 (default: 13)")
    parser.add_argument("--skip-sync", action="store_true",
                        help="跳过同步阶段（仅补抓+翻译+激活）")
    parser.add_argument("--skip-fetch", action="store_true",
                        help="跳过补抓阶段")
    parser.add_argument("--skip-translate", action="store_true",
                        help="跳过翻译阶段")
    parser.add_argument("--skip-activate", action="store_true",
                        help="跳过激活阶段")
    args = parser.parse_args()

    start_time = time.time()
    log("=" * 50)
    log("BA Jobbörse 日 pipeline 启动")
    log("=" * 50)

    # Phase 0: 启动状态报告
    status = report_status()
    if status:
        log(f"启动状态: 活跃={status.get('active', '?')} "
            f"未激活={status.get('inactive', '?')} "
            f"待上线={status.get('ready_to_activate', '?')}")

    # Phase 1: Sync
    if not args.skip_sync:
        log("\n── Phase 1/5: 同步职位列表 ──")
        ok = run_script("ba_job_sync.py", ["--defer-activate"], timeout=600)
        if not ok:
            log("⚠ 同步阶段失败，继续后续流程")
    else:
        log("⏭ 跳过同步阶段")

    # Phase 2: Fetch missing description_de
    if not args.skip_fetch:
        log(f"\n── Phase 2/5: 补抓 description_de (limit={args.fetch_limit}) ──")
        ok = run_script("fetch_missing_details.py",
                        ["--limit", str(args.fetch_limit)], timeout=1200)
        if not ok:
            log("⚠ 补抓阶段有失败记录，继续后续流程")
    else:
        log("⏭ 跳过补抓阶段")

    # Phase 3: Translate descriptions
    if not args.skip_translate:
        log(f"\n── Phase 3/5: 翻译 description_de → description_zh ──")
        ok = run_script("translate_jobs_batch.py",
                        ["--batch-size", str(args.translate_batch),
                         "--delay", str(args.translate_delay)],
                        timeout=3600)
        if not ok:
            log("⚠ 描述翻译阶段有失败记录")

        # Phase 4: Translate titles
        log(f"\n── Phase 4/5: 翻译 title_de → title_zh ──")
        ok = run_script("translate_titles_batch.py",
                        ["--batch-size", str(args.translate_batch),
                         "--delay", str(args.translate_delay)],
                        timeout=1800)
        if not ok:
            log("⚠ 标题翻译阶段有失败记录")
    else:
        log("⏭ 跳过翻译阶段 (Phases 3-4)")

    # Phase 5: Safety check + activate
    if not args.skip_activate:
        log("\n── Phase 5/5: 安全检查 + 激活 ──")
        # Safety check runs first: un-activate any half-finished jobs that snuck through
        # Then activate only fully complete records
        if safety_check_and_activate():
            # 报告激活数量
            status = report_status()
            if status:
                log(f"完成状态: 活跃={status.get('active', '?')} "
                    f"未激活={status.get('inactive', '?')} "
                    f"待上线={status.get('ready_to_activate', '?')}")
    else:
        log("⏭ 跳过激活阶段")

    elapsed = time.time() - start_time
    log("=" * 50)
    log(f"Pipeline 完成 ({elapsed/60:.1f} 分钟)")
    log("=" * 50)


if __name__ == "__main__":
    main()
