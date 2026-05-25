"""
scrafer_ab_hamburg.py — Hamburg Amt für Migration 外管局办事指南爬虫
"""
import sys, os, re
from bs4 import BeautifulSoup

PROJECT_DIR = "/home/joven/policy-booth-2"
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts", "python"))

from policy.base_scraper import fetch_page, get_supabase_client, \
    make_slug, batch_write
from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_DIR, ".env"), override=True)

BASE = "https://www.hamburg.de"

URLS = [
    f"{BASE}/auslaenderbehoerde/",
    f"{BASE}/politik-und-verwaltung/behoerden/behoerde-fuer-inneres-und-sport/aemter/amt-fuer-migration/allgemeine-verwaltung",
    f"{BASE}/politik-und-verwaltung/behoerden/behoerde-fuer-inneres-und-sport/aemter/amt-fuer-migration/zentrale-auslaenderangelegenheiten",
    f"{BASE}/politik-und-verwaltung/behoerden/behoerde-fuer-inneres-und-sport/aemter/amt-fuer-migration/einbuergerungsangelegenheiten",
    f"{BASE}/politik-und-verwaltung/behoerden/behoerde-fuer-inneres-und-sport/aemter/amt-fuer-migration/erstaufnahme-leistungen-nach-dem-asylblg-und-freiwillige-ausreise",
    f"{BASE}/politik-und-verwaltung/behoerden/behoerde-fuer-inneres-und-sport/aemter/amt-fuer-migration/rechtsangelegenheiten-und-buergerschaftliche-eingaben",
]

TITLES = {
    "auslaenderbehoerde": "Hamburg Amt für Migration",
    "allgemeine-verwaltung": "Allgemeine Verwaltung",
    "zentrale-auslaenderangelegenheiten": "Zentrale Ausländerangelegenheiten",
    "einbuergerungsangelegenheiten": "Einbürgerungsangelegenheiten",
    "erstaufnahme": "Erstaufnahme und Asylbewerberleistungen",
    "rechtsangelegenheiten": "Rechtsangelegenheiten",
}

ZH_TITLES = {
    "allgemeine-verwaltung": "综合管理",
    "zentrale-auslaenderangelegenheiten": "外国人事务中心",
    "einbuergerungsangelegenheiten": "入籍事务",
    "erstaufnahme": "首次接收与难民福利",
    "rechtsangelegenheiten": "法律事务",
}

TOPICS = {
    "allgemeine-verwaltung": "生活行政",
    "zentrale-auslaenderangelegenheiten": "居留与签证",
    "einbuergerungsangelegenheiten": "入籍与长期居留",
    "erstaufnahme": "家庭与福利",
    "rechtsangelegenheiten": "居留与签证",
}

def _key(url: str) -> str:
    for k in TITLES:
        if k in url:
            return k
    return "auslaenderbehoerde"

def run():
    supabase = get_supabase_client()
    entries = []
    for url in URLS:
        key = _key(url)
        label = TITLES.get(key, key)
        print(f"  [{key}] {label}")
        html, etag, changed = fetch_page(url)
        if not html:
            print(f"    ✗ 采集失败")
            continue

        soup = BeautifulSoup(html, "html.parser")
        h1 = soup.select_one("h1")
        title_de = h1.get_text(strip=True) if h1 else label

        for tag in soup.select("script, style, nav, footer, header, aside, noscript, iframe, [class*=sidebar]"):
            tag.decompose()
        main = soup.select_one("main") or soup
        body = main.get_text(separator="\n", strip=True)
        lines = [l.strip() for l in body.split("\n") if l.strip() and len(l.strip()) > 15]
        content = "\n".join(lines[:200])

        zh_title = ZH_TITLES.get(key, "汉堡外管局")
        topic = TOPICS.get(key, "居留与签证")
        slug = make_slug(f"hamburg-amt-fur-migration-{key}", url)
        service_key = f"hamburg_amt_fur_migration_{key}"

        entries.append({
            "service_key": service_key,
            "slug": slug,
            "title_de": f"Hamburg Amt für Migration — {title_de}",
            "title_zh": f"汉堡外管局 — {zh_title}",
            "summary_zh": f"汉堡移民局（Amt für Migration）{zh_title}相关指南。{topic}事务由本部门负责办理。",
            "category": topic,
            "tags": ["汉堡外管局", "Amt für Migration", "居留许可", "Hamburg", zh_title],
            "publisher": "Amt für Migration Hamburg",
            "source_name": "Hamburg Amt für Migration",
            "source_url": url,
            "region_level": "市",
            "region_name": "Hamburg",
            "translated": False,
        })
        print(f"    ✓ {len(html)}B — 汉堡外管局 — {zh_title}")

    if entries:
        total = batch_write(supabase, entries)
        print(f"\n  Written {total}/{len(entries)} entries")
    else:
        print("\n  No entries written")


if __name__ == "__main__":
    run()
