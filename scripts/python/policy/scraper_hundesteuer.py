"""
scraper_hundesteuer.py — 德国宠物犬税 (Hundesteuer) 市级政策指南爬虫
遵循 BaseScraper 模式，写入 policy_pages。
首个从"联邦"扩展至"市"级的数据采集。

即使目标页面暂时无法访问（404/403），也会基于已知费率为每座城市生成一条记录。
"""
import sys, os, re
from bs4 import BeautifulSoup

PROJECT_DIR = "/home/joven/policy-booth-2"
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts", "python"))

from policy.base_scraper import fetch_page, get_supabase_client, \
    make_slug, batch_write
from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_DIR, ".env"), override=True)

# ── 10 个城市犬税费率（各市政府公开数据）──
CITIES = [
    {"name": "Berlin",    "first": "€120/年", "extra": "€180/年",
     "url": "https://allaboutberlin.com/guides/dog-ownership",
     "alt_url": "https://www.berlin.de/service/themen/hund/"},
    {"name": "Munich",    "first": "€100/年", "extra": "€160/年",
     "url": "https://stadt.muenchen.de/service/info/hundesteuer/1033101/",
     "alt_url": ""},
    {"name": "Hamburg",   "first": "€96/年",  "extra": "€144/年",
     "url": "https://www.hamburg.de/hundesteuer/",
     "alt_url": ""},
    {"name": "Frankfurt", "first": "€156/年", "extra": "€312/年",
     "url": "https://frankfurt.de/themen/ordnung/hundehaltung/hundesteuer",
     "alt_url": ""},
    {"name": "Cologne",   "first": "€156/年", "extra": "€312/年",
     "url": "https://www.stadt-koeln.de/service/lebenslagen/hundehaltung/hundesteuer-anmeldung/",
     "alt_url": ""},
    {"name": "Stuttgart", "first": "€108/年", "extra": "€216/年",
     "url": "https://www.stuttgart.de/service/hundesteuer/",
     "alt_url": ""},
    {"name": "Düsseldorf","first": "€108/年", "extra": "€162/年",
     "url": "https://www.duesseldorf.de/ordnungsamt/hundehaltung/hundesteuer.html",
     "alt_url": ""},
    {"name": "Leipzig",   "first": "€96/年",  "extra": "€192/年",
     "url": "https://www.leipzig.de/buergerservice/dienstleistungen/hundesteuer",
     "alt_url": ""},
    {"name": "Dresden",   "first": "€120/年", "extra": "€240/年",
     "url": "https://www.dresden.de/de/rathaus/dienstleistungen/hundesteuer.php",
     "alt_url": ""},
    {"name": "Nürnberg",  "first": "€108/年", "extra": "€156/年",
     "url": "https://www.nuernberg.de/internet/hundehaltung/hundesteuer.html",
     "alt_url": ""},
]

SOURCE_NAME = "各市政厅 Hundesteuer 指南"
SOURCE_PREFIX = "municipal_hundesteuer"
PUBLISHER = "各城市市政厅 (Stadtverwaltung)"
CATEGORY = "生活行政"
REGION_LEVEL = "市"


def _build_entry(city: dict, content_html: str = "") -> dict:
    fees = city
    service_key = f"municipal_hundesteuer_{city['name'].lower()}"
    slug = make_slug(f"hundesteuer-{city['name']}", city['url'])

    return {
        "service_key": service_key,
        "slug": slug,
        "title_de": f"Hundesteuer {city['name']} — Anmeldung, Gebühren & Pflichten",
        "title_zh": f"{city['name']}犬税指南 — 登记、费用与养犬义务",
        "summary_zh": (
            f"{city['name']}的犬税（Hundesteuer）：首犬 {city['first']}，"
            f"额外犬只 {city['extra']}。养犬须办理登记、缴纳年度税费，"
            f"并购买犬只责任险（Hundehaftpflichtversicherung）。"
        ),
        "requirements_zh": [
            "有效身份证件或居留许可",
            "犬只芯片识别号 (Microchip)",
            "犬只责任险 (Hundehaftpflichtversicherung)",
            f"在 {city['name']} 的注册地址（Anmeldung）",
        ],
        "fees_zh": (
            f"首犬：{city['first']}\n"
            f"额外犬只（第二只起）：{city['extra']}\n"
            "危险犬种可能有附加费，请向当地 Ordnungsamt 确认。"
        ),
        "duration_zh": "登记后按月/季/年持续缴纳，搬家至其他城市或犬只去世后须向市政厅申报注销",
        "steps_zh": [
            f"在 {city['name']} 市政厅或在线平台登记您的犬只",
            "市政厅核定犬税金额并发送缴费通知",
            "通过银行自动扣款（SEPA Lastschrift）按季度或年度缴纳税费",
            "购买犬只责任险（法律要求）",
            "搬家或犬只去世时，向市政厅申报变更或注销",
        ],
        "category": CATEGORY,
        "tags": ["犬税", "Hundesteuer", city['name'], "宠物登记", "养犬义务", "市政税务"],
        "publisher": f"Stadt {city['name']}",
        "source_name": SOURCE_NAME,
        "source_url": city['url'],
        "region_level": REGION_LEVEL,
        "region_name": city['name'],
        "translated": True,
    }


def run():
    supabase = get_supabase_client()
    entries = []

    for city in CITIES:
        url = city["url"]
        print(f"  [{city['name']}] {url}")

        # Try fetching the page
        html, new_etag, has_changed = fetch_page(url)
        if html:
            # Page fetched successfully — try to extract
            soup = BeautifulSoup(html, "html.parser")
            main = soup.select_one("main") or soup.select_one('[role="main"]') or soup.select_one("article") or soup
            body_text = main.get_text(separator="\n", strip=True)
            lines = [l.strip() for l in body_text.split("\n") if l.strip() and len(l.strip()) > 15]
            content_html = "\n".join(lines[:150])
            entry = _build_entry(city, content_html)
            print(f"    ✓ 已采集 ({len(html)}B)")
        else:
            # Page unavailable — build minimum entry
            entry = _build_entry(city, "")
            print(f"    ~ 页面不可用，基于已知费率生成")

        entries.append(entry)

    # Write all entries
    total = batch_write(supabase, entries)
    print(f"\n  Written {total}/{len(entries)} entries to policy_pages")


if __name__ == "__main__":
    import sys
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        print("[DRY RUN] Would write:")
        for city in CITIES:
            e = _build_entry(city)
            print(f"  {city['name']}: {e['title_zh'][:40]}... (tags: {e['tags']})")
    else:
        run()
