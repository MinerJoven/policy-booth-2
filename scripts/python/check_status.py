#!/usr/bin/env python3
"""Check pipeline status via SQL query"""
import json, subprocess, sys

sql = """
SELECT
  COUNT(*) FILTER (WHERE is_active = true) as active,
  COUNT(*) FILTER (WHERE is_active = false) as inactive,
  COUNT(*) FILTER (WHERE is_active = false AND description_de IS NOT NULL AND LENGTH(description_de) > 20 AND description_zh IS NOT NULL AND title_zh IS NOT NULL) as ready_to_activate,
  COUNT(*) FILTER (WHERE is_active = false AND description_de IS NULL) as waiting_for_fetch,
  COUNT(*) FILTER (WHERE is_active = false AND description_de IS NOT NULL AND LENGTH(description_de) > 20 AND description_zh IS NULL) as waiting_for_translate
FROM jobs;
"""

proc = subprocess.run(
    ["supabase", "db", "query", "--linked", "--output", "json"],
    input=sql.encode(),
    capture_output=True,
    timeout=120
)
if proc.returncode != 0:
    print(f"ERROR: {proc.stderr.decode()}")
    sys.exit(1)
try:
    data = json.loads(proc.stdout.decode())
    if isinstance(data, list) and len(data) > 0:
        print(json.dumps(data[0], indent=2))
    else:
        print(proc.stdout.decode())
except:
    print(proc.stdout.decode())
