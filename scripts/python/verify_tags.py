#!/usr/bin/env python3
"""验证 jobs 表里是否有正确标签（调试用）"""
import os
from supabase import create_client

url = os.environ["SUPABASE_URL"]
key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
supabase = create_client(url, key)

resp = supabase.table("jobs").select("refnr,tags").eq("is_active", True).limit(5).execute()
for j in resp.data:
    print("refnr=%s tags=%s" % (j["refnr"], j.get("tags", [])))
