#!/usr/bin/env python3
"""
政策展台 2.0 — 政策采集+提炼全流程

用法:
  # 采集所有来源（暂不翻译）
  python3 scripts/python/policy/run_policy_pipeline.py --collect-only

  # 翻译已采集的条目
  python3 scripts/python/policy/run_policy_pipeline.py --translate-only

  # 全流程
  python3 scripts/python/policy/run_policy_pipeline.py

  # 仅预览
  python3 scripts/python/policy/run_policy_pipeline.py --dry-run
"""
import os, sys, time, subprocess, json

SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))
PYTHON = sys.executable

def log(msg):
    ts = time.strftime("%H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)

def run_script(name: str, args: list[str] | None = None) -> bool:
    path = os.path.join(SCRIPTS_DIR, name)
    cmd = [PYTHON, path]
    if args:
        cmd.extend(args)
    log(f"▶ {name} {' '.join(args or [])}")
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
        for line in (proc.stdout or "").split("\n"):
            if line.strip():
                print(f"  {line}")
        if proc.stderr and proc.stderr.strip():
            for line in proc.stderr.strip().split("\n"):
                if line.strip():
                    print(f"  [err] {line}")
        if proc.returncode != 0:
            log(f"✗ {name} 失败 (exit {proc.returncode})")
            return False
        log(f"✓ {name} 完成")
        return True
    except subprocess.TimeoutExpired:
        log(f"✗ {name} 超时")
        return False
    except Exception as e:
        log(f"✗ {name} 异常: {e}")
        return False

def main():
    import argparse
    parser = argparse.ArgumentParser(description="政策采集+翻译全流程")
    parser.add_argument("--dry-run", action="store_true", help="仅预览不写入")
    parser.add_argument("--collect-only", action="store_true", help="仅采集不翻译")
    parser.add_argument("--translate-only", action="store_true", help="仅翻译不采集")
    parser.add_argument("--translate-limit", type=int, default=50, help="翻译上限")
    args = parser.parse_args()

    log("="*50)
    log("政策采集+翻译 Pipeline 启动")
    log("="*50)

    dry_flag = ["--dry-run"] if args.dry_run else []

    # Phase 1: 采集
    if not args.translate_only:
        log("\n── Phase 1/2: 采集政策来源 ──")
        # BAMF
        run_script("scraper_bamf.py", dry_flag)
        # DAAD
        run_script("scraper_daad.py", dry_flag)
        # Make-it-in-Germany（通过 Wayback Machine）
        run_script("scraper_mig_wayback.py", dry_flag)
        # Auswärtiges Amt（德国外交部签证信息）
        run_script("scraper_aa.py", dry_flag)
        # Finanztip（消费者理财指南：税务/医保/福利/银行）
        run_script("scraper_finanztip.py", dry_flag)
        # Hundesteuer（市级犬税指南 - 首次市级数据）
        run_script("scraper_hundesteuer.py", dry_flag)
        # Berlin LEA（柏林外管局 - 市级数据）
        run_script("scraper_lea_berlin.py", dry_flag)
        # Hamburg Amt für Migration（汉堡外管局 - 市级数据）
        run_script("scraper_ab_hamburg.py", dry_flag)
    else:
        log("⏭ 跳过采集")

    # Phase 2: AI 结构化提炼
    if not args.collect_only:
        log("\n── Phase 2/2: AI 结构化提炼 ──")
        translate_args = dry_flag + ["--limit", str(args.translate_limit)]
        run_script("translate_policy.py", translate_args)
    else:
        log("⏭ 跳过翻译")

    log(f"\n{'='*50}")
    log("Pipeline 完成")
    log(f"{'='*50}")

if __name__ == "__main__":
    main()
