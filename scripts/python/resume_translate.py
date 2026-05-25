#!/usr/bin/env python3
import os, sys, re, json, time, httpx

with open("/home/joven/policy-booth-2/.env") as f:
    content = f.read()
key = re.search(r"SUPABASE_SERVICE_ROLE_KEY=\"(\S+)\"", content).group(1)

BASE = "https://naxlnlokfbfzqnswxmag.supabase.co"
HEADERS = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Accept": "application/json"}
DS_KEY = ""
DS_BASE = "https://api.deepseek.com"
DS_MODEL = "deepseek-v4-flash"
for line in open(os.path.expanduser("~/.hermes/.env")):
    if "DEEPSEEK_API_KEY" in line and "=" in line:
        k = line.split("=", 1)[1].strip()
        if k and k != "***": DS_KEY = k

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def g(t, p=None):
    u = f"{BASE}/rest/v1/{t}"
    if p: u += "?" + "&".join(f"{k}={v}" for k,v in p.items())
    r = httpx.get(u, headers=HEADERS, timeout=60)
    return r.json() if r.status_code == 200 else []

def u(t, d, ref):
    r = httpx.patch(f"{BASE}/rest/v1/{t}?refnr=eq.{ref}", headers=HEADERS, json=d, timeout=30)
    return r.status_code in (200, 204)

log("=== Resume Pipeline ===")
log(f"DB: {(g('jobs', {'select': 'count'}) or [None])[0]}")

log("Phase 3: Translate descriptions")
dj = g("jobs", {"select": "refnr,description_de", "description_de": "not.is.null", "or": "(description_zh.is.null,description_zh.eq.)", "order": "refnr.asc", "limit": "200"})
dj = [{"refnr": j["refnr"], "text": j.get("description_de","")} for j in dj if j.get("description_de") and len(j.get("description_de","")) > 20]
log(f"Need desc: {len(dj)}")
if dj:
    tg = ["IT/技术","餐饮/酒店","零售/销售","制造/物流","金融/会计","教育/培训","医疗/护理","行政/文员","市场/传媒","工程/技术","家政/服务","客服/前台","需要中文","无语言要求","英语即可","留学生适合","华人优先","无经验可","远程可选","迷你岗","实习岗","可办工作签证"]
    sp = f"You are a German job translation assistant. Translate each job description to Chinese (within 200 chars). Choose 1-4 tags from: {', '.join(tg)}. IMPORTANT: only add '\u9700\u8981\u4e2d\u6587' if the job explicitly requires Chinese language skills. Output JSON array: [{{\"refnr\":\"...\",\"description_zh\":\"...\",\"tags\":[...]}}] ONLY JSON."
    bs, dl = 3, 10
    s, f_ = 0, 0
    for i in range(0, len(dj), bs):
        batch = dj[i:i+bs]
        log(f"Desc batch {i//bs+1}/{(len(dj)+bs-1)//bs} ({len(batch)})")
        parts = []
        for idx, j in enumerate(batch):
            parts.append(f"===JOB {idx+1}===\nrefnr: {j['refnr']}\n{j.get('text','')[:3000]}")
        try:
            resp = httpx.post(f"{DS_BASE}/v1/chat/completions", headers={"Authorization": f"Bearer {DS_KEY}", "Content-Type": "application/json"}, json={"model": DS_MODEL, "messages": [{"role": "system", "content": sp}, {"role": "user", "content": "\n\n".join(parts)}], "temperature": 0.1, "max_tokens": 8192}, timeout=120)
            if resp.status_code != 200: log(f"  API: {resp.status_code}"); f_ += len(batch); time.sleep(dl); continue
            c = resp.json()["choices"][0]["message"]["content"].strip()
            if c.startswith("```json"): c = c[7:]
            if c.endswith("```"): c = c[:-3]
            c = c.strip()
            for t in json.loads(c):
                refnr = t["refnr"]; val = t.get("description_zh",""); d = {"description_zh": val, "tags": t.get("tags",[])}
                if val:
                    if u("jobs", d, refnr): s += 1
                    else: f_ += 1
                else: f_ += 1
        except Exception as e: log(f"  Err: {e}"); f_ += len(batch)
        if i + bs < len(dj): time.sleep(dl)
    log(f"Desc done: ok={s} fail={f_}")

log("Phase 4: Translate titles")
tj = g("jobs", {"select": "refnr,title_de", "title_zh": "is.null", "order": "refnr.asc", "limit": "200"})
tj = [{"refnr": j["refnr"], "text": j.get("title_de","")} for j in tj]
log(f"Need title: {len(tj)}")
if tj:
    sp = "Translate German job titles to concise Chinese. Keep brackets like (m/w/d) -> (\u7537/\u5973/\u4e0d\u9650). Output JSON array: [{\"refnr\":\"...\",\"title_zh\":\"...\"}] ONLY JSON."
    bs, dl = 5, 8
    s, f_ = 0, 0
    for i in range(0, len(tj), bs):
        batch = tj[i:i+bs]
        log(f"Title batch {i//bs+1}/{(len(tj)+bs-1)//bs} ({len(batch)})")
        parts = []
        for idx, j in enumerate(batch):
            parts.append(f"===JOB {idx+1}===\nrefnr: {j['refnr']}\n{j.get('text','')}")
        try:
            resp = httpx.post(f"{DS_BASE}/v1/chat/completions", headers={"Authorization": f"Bearer {DS_KEY}", "Content-Type": "application/json"}, json={"model": DS_MODEL, "messages": [{"role": "system", "content": sp}, {"role": "user", "content": "\n\n".join(parts)}], "temperature": 0.1, "max_tokens": 4096}, timeout=90)
            if resp.status_code != 200: log(f"  API: {resp.status_code}"); f_ += len(batch); time.sleep(dl); continue
            c = resp.json()["choices"][0]["message"]["content"].strip()
            if c.startswith("```json"): c = c[7:]
            if c.endswith("```"): c = c[:-3]
            c = c.strip()
            for t in json.loads(c):
                refnr = t["refnr"]; val = t.get("title_zh","")
                if val:
                    if u("jobs", {"title_zh": val}, refnr): s += 1
                    else: f_ += 1
                else: f_ += 1
        except Exception as e: log(f"  Err: {e}"); f_ += len(batch)
        if i + bs < len(tj): time.sleep(dl)
    log(f"Title done: ok={s} fail={f_}")

log("Phase 5: Safety + Activate")
r = httpx.patch(f"{BASE}/rest/v1/jobs?is_active=eq.true&or=(description_de.is.null,description_zh.is.null,title_zh.is.null)", headers=HEADERS, json={"is_active": False}, timeout=30)
log(f"Deactivate inc: {r.status_code}")
r = httpx.patch(f"{BASE}/rest/v1/jobs?is_active=eq.false&description_de=not.is.null&description_zh=not.is.null&title_zh=not.is.null", headers=HEADERS, json={"is_active": True}, timeout=30)
log(f"Activate ready: {r.status_code}")

def cnt(p):
    r = g("jobs", {"select": "count", **p})
    return r[0]["count"] if r else "?"
log(f"Active: {cnt({'is_active': 'eq.true'})}")
log(f"Inactive: {cnt({'is_active': 'eq.false'})}")
log(f"Ready: {cnt({'is_active': 'eq.false', 'description_de': 'not.is.null', 'description_zh': 'not.is.null', 'title_zh': 'not.is.null'})}")
log(f"Wait fetch: {cnt({'is_active': 'eq.false', 'description_de': 'is.null'})}")
log(f"Wait trans: {cnt({'is_active': 'eq.false', 'description_de': 'not.is.null', 'description_zh': 'is.null'})}")
