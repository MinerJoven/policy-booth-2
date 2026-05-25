#!/usr/bin/env python3
"""
政策展台 2.0 — AI 结构化提炼 Worker

从 policy_pages 读取 translated=false 的原始德语内容，
调用 DeepSeek V4-Flash 提取办事指南结构化字段，
回写: title_zh, summary_zh, requirements_zh, fees_zh, duration_zh, steps_zh, category, tags
"""
import os, sys, json, time, re, httpx
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

# ── DeepSeek Config ──
DEEPSEEK_KEY = ""
DEEPSEEK_BASE = "https://api.deepseek.com"
DEEPSEEK_MODEL = "deepseek-v4-flash"
BATCH_SIZE = 3        # 每批条数（结构提取比翻译消耗更大）
DELAY = 5             # 批次间隔（秒）
MAX_TOKENS = 2000

# ── System Prompt（核心：办事指南结构化输出）──
SYSTEM_PROMPT = """你是一个德国政策办事指南编写助手。你的任务是从德语官方政策原文中提取办事指南信息，输出严格的结构化 JSON。

重要：原文可能是描述性文章而非步骤清单，但你需要**主动推断和提取**结构化信息。

输出格式（严格 JSON 数组，不要有其他内容）：
[{
  "service_key": "唯一标识（保持原文）",
  "title_zh": "中文标题（15字以内，清晰表达主题）",
  "summary_zh": "300字以内中文摘要。必须回答：这是什么政策？谁可能受影响？用户需要关注什么？",
  "requirements_zh": ["所需材料1", "所需材料2"],
  "fees_zh": "费用说明，如'约100-140欧元'，从原文提取。如果原文提到费用数字或金额段落，一定要放入此字段",
  "duration_zh": "办理时限，如'通常4-8周'，从原文提取。如果原文提到办理时间、审批周期、等待时间，一定要放入此字段",
  "steps_zh": ["步骤1", "步骤2"],
  "category": "政策类别，从以下选一个：居留与签证|留学与大学|工作与蓝卡|入籍与长期居留|税务与社保|医保与保险|家庭与福利|交通与驾照|宠物与犬税|生活行政|其他",
  "tags": ["相关标签1", "标签2"],
  "target_groups": ["适用人群，从以下选：留学生|求职者|工作签人群|蓝卡人群|自雇人士|华人家庭|新移民|车主|宠物主人|可能相关"]
}

主动推断规则：
1. requirements_zh: 从原文中提取任何提到"需要"、"必须"、"required"、"need"、"must have"、"prerequisite"等内容，打包为数组。即使原文没有明确列表，也要从段落中提取条件。
2. fees_zh: 原文中任何提到费用、金额、Gebühren、Kosten、Fee、Euro符号的段落，提取为简洁的费用说明。找不到就写空字符串。
3. duration_zh: 原文中任何提到时间、周期、天数、weeks、months、Bearbeitungszeit等的内容，提取为时限说明。找不到就写空字符串。
4. steps_zh: 从原文提取任何流程、步骤、顺序描述。即使原文没有编号列表，也要从"first...then...finally"这类叙述中提取步骤。
5. 用自己的话概括，不要复制原文段落"""

USER_PROMPT_TEMPLATE = """请将以下德国官方政策内容提炼为中文办事指南：

源站: {source_name}
URL: {source_url}
标题: {title_de}

正文内容:
{content}

请输出严格 JSON 数组，包含上述所有字段。"""


# ── DB Helpers ──

def run_sql(sql: str) -> list[dict]:
    import subprocess
    proc = subprocess.run(
        ["supabase", "db", "query", "--linked", "--output", "json"],
        input=sql.encode(), capture_output=True, timeout=60
    )
    if proc.returncode != 0:
        print(f"  SQL error: {proc.stderr.decode()[:200]}")
        return []
    try:
        return json.loads(proc.stdout.decode())
    except:
        return []


def load_deepseek_key() -> str:
    env_paths = [
        os.path.expanduser("~/.hermes/.env"),
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", ".env"),
    ]
    for path in env_paths:
        if not os.path.exists(path):
            continue
        for line in open(path):
            if "DEEPSEEK_API_KEY" in line and "=" in line:
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
                if key and key != "***":
                    return key
    return ""


# ── Translate Batch ──

def translate_batch(jobs: list[dict]) -> tuple[list[dict], list[dict]]:
    """调用 DeepSeek 提取结构化数据。返回 (成功列表, 失败列表)"""
    parts = []
    for job in jobs:
        content = (job.get("summary_zh") or job.get("title_de") or "")[:4000]
        parts.append(
            f"===JOB {jobs.index(job)+1}===\n"
            f"service_key: {job['service_key']}\n"
            f"source_name: {job.get('source_name','')}\n"
            f"source_url: {job.get('source_url','')}\n"
            f"title_de: {job.get('title_de','')}\n"
            f"content:\n{content}"
        )

    user_content = "\n\n".join(parts)
    payload = {
        "model": DEEPSEEK_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "max_tokens": MAX_TOKENS,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    try:
        resp = httpx.post(
            f"{DEEPSEEK_BASE}/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {DEEPSEEK_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=90,
        )
        if resp.status_code != 200:
            print(f"  HTTP {resp.status_code}: {resp.text[:200]}")
            return [], jobs

        data = resp.json()
        text = data["choices"][0]["message"]["content"]
        text = text.strip()

        # 处理可能的 markdown code fence
        if text.startswith("```"):
            lines = text.split("\n")
            start = 1 if lines[0].strip().startswith("```") else 0
            end = len(lines) - 1 if lines[-1].strip() == "```" else len(lines)
            text = "\n".join(lines[start:end])

        # 清理控制字符
        text = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', text)

        result = json.loads(text)
        if isinstance(result, dict) and "results" in result:
            result = result["results"]
        if not isinstance(result, list):
            result = [result]

        # 匹配结果到 jobs
        result_map = {}
        for r in result:
            sk = r.get("service_key", "")
            if sk:
                result_map[sk] = r

        success, failed = [], []
        for job in jobs:
            sk = job["service_key"]
            if sk in result_map:
                success.append({**job, **result_map[sk]})
            else:
                failed.append(job)

        return success, failed

    except Exception as e:
        print(f"  API 错误: {e}")
        return [], jobs


# ── DB Write ──

def write_results(results: list[dict]) -> int:
    """写入结构化字段到 policy_pages"""
    BATCH = 15
    total = 0
    for batch_start in range(0, len(results), BATCH):
        batch = results[batch_start:batch_start+BATCH]
        sql_lines = ["BEGIN;"]
        for item in batch:
            sk = item["service_key"].replace("'", "''")
            title_zh = (item.get("title_zh", "") or "").replace("'", "''")
            summary_zh = (item.get("summary_zh", "") or "").replace("'", "''")
            fees_zh = (item.get("fees_zh", "") or "").replace("'", "''")
            duration_zh = (item.get("duration_zh", "") or "").replace("'", "''")

            # JSONB 字段
            requirements = json.dumps(item.get("requirements_zh", []), ensure_ascii=False).replace("'", "''")
            steps = json.dumps(item.get("steps_zh", []), ensure_ascii=False).replace("'", "''")

            # text[] 字段
            tags = item.get("tags", [])
            pg_tags = "{" + ",".join(f'"{t}"' for t in tags) + "}"

            target_groups = item.get("target_groups", [])
            pg_tg = "{" + ",".join(f'"{t}"' for t in target_groups) + "}"

            category = (item.get("category", "") or "").replace("'", "''")

            sql_lines.append(
                f"UPDATE policy_pages SET "
                f"title_zh = '{title_zh}', "
                f"summary_zh = '{summary_zh}', "
                f"requirements_zh = '{requirements}'::jsonb, "
                f"fees_zh = '{fees_zh}', "
                f"duration_zh = '{duration_zh}', "
                f"steps_zh = '{steps}'::jsonb, "
                f"category = '{category}', "
                f"tags = '{pg_tags}'::text[], "
                f"translated = true, "
                f"translated_at = NOW() "
                f"WHERE service_key = '{sk}';"
            )
        sql_lines.append("COMMIT;")

        sql = "\n".join(sql_lines)
        import subprocess, tempfile
        with tempfile.NamedTemporaryFile(mode="w", suffix=".sql", delete=False, encoding="utf-8") as f:
            f.write(sql)
            sql_file = f.name
        proc = subprocess.run(
            ["supabase", "db", "query", "--linked"],
            stdin=open(sql_file, "rb"),
            capture_output=True, timeout=60
        )
        os.unlink(sql_file)
        if proc.returncode == 0:
            total += len(batch)
            print(f"  ✓ 写入 {len(batch)} 条")
        else:
            print(f"  ✗ SQL 失败: {proc.stderr.decode()[:200]}")
    return total


# ── Main ──

def main():
    global DEEPSEEK_KEY
    DEEPSEEK_KEY = load_deepseek_key()
    if not DEEPSEEK_KEY:
        print("[ERROR] 未找到 DEEPSEEK_API_KEY")
        sys.exit(1)

    import argparse
    parser = argparse.ArgumentParser(description="政策办事指南 AI 结构化提炼")
    parser.add_argument("--dry-run", action="store_true", help="只打印不写入")
    parser.add_argument("--limit", type=int, default=50, help="处理上限")
    parser.add_argument("--batch-size", type=int, default=BATCH_SIZE)
    parser.add_argument("--delay", type=float, default=DELAY)
    args = parser.parse_args()

    print("读取待提炼的政策条目...")
    sql = (
        "SELECT service_key, title_de, source_name, source_url, "
        "COALESCE(summary_zh, title_de) as content "
        "FROM policy_pages WHERE translated = false "
        "ORDER BY last_fetched_at DESC"
    )
    if args.limit > 0:
        sql += f" LIMIT {args.limit}"
    jobs = run_sql(sql)
    print(f"共 {len(jobs)} 条待处理")

    if not jobs:
        print("没有待处理条目")
        return

    if args.dry_run:
        print(f"\n前 3 条预览:")
        for j in jobs[:3]:
            print(f"  {j['service_key'][:40]}: {j.get('title_de','')[:50]}")
            print(f"    内容长度: {len(j.get('content',''))} chars")
        return

    all_success = []
    all_failed = []

    for i in range(0, len(jobs), args.batch_size):
        batch = jobs[i:i+args.batch_size]
        batch_num = i // args.batch_size + 1
        total_batches = (len(jobs) + args.batch_size - 1) // args.batch_size

        sks = [j["service_key"][:30] for j in batch]
        print(f"\n[{batch_num}/{total_batches}] 批次: {', '.join(sks)}")

        success, failed = translate_batch(batch)
        print(f"  成功: {len(success)}, 失败: {len(failed)}")

        if success:
            written = write_results(success)
            print(f"  写入: {written} 条")
            all_success.extend(success)

        if failed:
            time.sleep(args.delay)
            print(f"  重试...")
            success2, failed2 = translate_batch(failed)
            if success2:
                written2 = write_results(success2)
                print(f"  重试成功: {written2} 条")
                all_success.extend(success2)
            else:
                all_failed.extend(failed2)

        time.sleep(args.delay)

    print(f"\n{'='*50}")
    print(f"完成: 成功={len(all_success)}, 失败={len(all_failed)}")


if __name__ == "__main__":
    main()
