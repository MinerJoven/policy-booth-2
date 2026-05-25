"""
scraper_lea_berlin.py — Berlin LEA (Landesamt für Einwanderung) 外管局办事指南爬虫
遵循 BaseScraper 模式，自动发现页面并写入 policy_pages。
市级数据，region_level="市"。
"""
import sys, os, re
from bs4 import BeautifulSoup

PROJECT_DIR = "/home/joven/policy-booth-2"
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts", "python"))

from policy.base_scraper import fetch_page, get_supabase_client, \
    make_slug, batch_write, extract_text, clean_text
from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_DIR, ".env"), override=True)

SOURCE_NAME = "Berlin LEA (Landesamt für Einwanderung)"
SOURCE_PREFIX = "berlin_lea"
PUBLISHER = "Landesamt für Einwanderung Berlin"
CATEGORY = "居留与签证"
REGION_LEVEL = "市"
REGION_NAME = "Berlin"

# ── Navigation discovery ──
BASE = "https://www.berlin.de/einwanderung"

# Pages to skip (admin/contact/press/about/jobs etc.)
SKIP_PATTERNS = [
    "ueber-uns", "kontakt", "presse", "stellenangebot", "praktikum",
    "barrierefreiheit", "impressum", "datenschutz", "erklaerung",
    "downloads", "tipps-fuer-rechtsanwaelte", "leitung-organisation",
    "oeffentliche-zustellungen", "verpflichtungserklaerung",
]

def is_relevant(url: str) -> bool:
    """Filter to only 'policy guide' type pages"""
    return not any(p in url for p in SKIP_PATTERNS)


class BerlinLeaScraper:
    SOURCE_NAME = SOURCE_NAME
    SOURCE_PREFIX = SOURCE_PREFIX

    def discover_urls(self) -> list[str]:
        """Crawl the LEA site to find all content pages"""
        # Known content URLs from the site navigation
        known = [
            f"{BASE}/einreise/",
            f"{BASE}/einreise/visumverfahren/",
            f"{BASE}/einreise/visumverfahren/kurzer-aufenthalt-bis-zu-90-tage/",
            f"{BASE}/einreise/visumverfahren/laengerer-aufenthalt/",
            f"{BASE}/einreise/visum-verlaengern/",
            f"{BASE}/einreise/gefluechtete/",
            f"{BASE}/aufenthalt/",
            f"{BASE}/aufenthalt/befristet/",
            f"{BASE}/aufenthalt/erwerbstaetigkeit/",
            f"{BASE}/aufenthalt/studium/",
            f"{BASE}/aufenthalt/unbefristet/",
            f"{BASE}/aufenthalt/erloeschen-von-aufenthaltstiteln/",
            f"{BASE}/aufenthalt/elektronischer-aufenthaltstitel/",
            f"{BASE}/aufenthalt/freizuegigkeit-eu-ewr-schweiz/",
            f"{BASE}/aufenthalt/informationen-fuer-gefluechtete/",
            f"{BASE}/einbuergerung/",
            f"{BASE}/service/",
            f"{BASE}/service/beratung/",
            f"{BASE}/service/business-immigration-service/",
            f"{BASE}/service/business-immigration-service/online-formulare-des-bis/",
            f"{BASE}/service/business-immigration-service/beschleunigtes-fachkraefte-verfahren/",
            f"{BASE}/termine/",
            f"{BASE}/termine/termin-vereinbaren/",
        ]
        return [u for u in known if is_relevant(u)]

    def parse_page(self, url: str, html: str) -> dict | None:
        soup = BeautifulSoup(html, "html.parser")

        # Title
        h1 = soup.select_one("h1")
        title_de = h1.get_text(strip=True) if h1 else "Berlin LEA"

        # Breadcrumb → determine category
        breadcrumb = soup.select_one('[aria-label*="befinden"]')
        topic = self._infer_topic(title_de, url)

        # Body
        for tag in soup.select("script, style, nav, footer, header, aside, noscript, iframe, [class*=sidebar], [class*=aside]"):
            tag.decompose()
        main = soup.select_one("main") or soup.select_one('[role="main"]') or soup.select_one("article") or soup
        body_text = main.get_text(separator="\n", strip=True)
        lines = [l.strip() for l in body_text.split("\n") if l.strip() and len(l.strip()) > 15]
        content = "\n".join(lines[:200])

        # Extract contact/address info
        address_lines = []
        for line in lines:
            if any(w in line.lower() for w in ["friedrich-krause", "ufer", "berlin", "telefon", "fax", "email", "sprechzeit", "öffnungszeit", "servicezeit"]):
                address_lines.append(line)
        contact_info = "\n".join(address_lines[:10])

        service_key = f"berlin_lea_{re.sub(r'[^a-z0-9]', '_', title_de.lower())[:40]}"
        slug = make_slug(f"berlin-lea-{title_de}", url)

        entry = {
            "service_key": service_key,
            "slug": slug,
            "title_de": f"Berlin LEA — {title_de}",
            "title_zh": f"柏林外管局 — {self._translate_topic(title_de)}",
            "summary_zh": self._build_summary(title_de, topic, content),
            "requirements_zh": [],
            "fees_zh": self._extract_fees(content),
            "duration_zh": self._extract_duration(content),
            "steps_zh": [],
            "category": CATEGORY,
            "tags": ["柏林外管局", "Berlin LEA", "居留许可", REGION_NAME, topic],
            "publisher": PUBLISHER,
            "source_name": SOURCE_NAME,
            "source_url": url,
            "region_level": REGION_LEVEL,
            "region_name": REGION_NAME,
            "translated": False,  # needs AI extraction
        }
        return entry

    def _infer_topic(self, title: str, url: str) -> str:
        t = title.lower() + " " + url.lower()
        if "visum" in t or "einreise" in t:
            return "签证与入境"
        if "erwerb" in t or "arbeit" in t or "fachkraft" in t:
            return "工作与蓝卡"
        if "studium" in t or "student" in t:
            return "留学与大学"
        if "unbefristet" in t or "niederlassung" in t:
            return "入籍与长期居留"
        if "einbürgerung" in t or "einbuergerung" in t:
            return "入籍与长期居留"
        if "befristet" in t or "familie" in t or "familien" in t:
            return "居留与签证"
        if "elektronisch" in t or "eAT" in t:
            return "居留与签证"
        if "erlosch" in t:
            return "居留与签证"
        if "freizugig" in t or "eu" in t:
            return "居留与签证"
        if "gefluchtet" in t:
            return "家庭与福利"
        if "termin" in t:
            return "生活行政"
        if "beratung" in t or "service" in t:
            return "生活行政"
        if "business" in t:
            return "工作与蓝卡"
        return "居留与签证"

    def _translate_topic(self, title_de: str) -> str:
        t = title_de.lower()
        m = {
            "einreise": "入境",
            "visumverfahren": "签证程序",
            "kurzer aufenthalt": "短期停留 (90天内)",
            "längerer aufenthalt": "长期居留",
            "visum verlängern": "签证延期",
            "aufenthalt": "居留",
            "befristet": "有限期居留",
            "erwerbstätigkeit": "工作居留",
            "studium": "留学居留",
            "unbefristet": "永久居留",
            "erloschen": "居留许可失效",
            "elektronischer": "电子居留证 (eAT)",
            "freizugigkeit": "欧盟自由迁徙权",
            "gefluchtete": "难民信息",
            "einbürgerung": "入籍",
            "service": "服务",
            "beratung": "咨询",
            "business immigration": "商业移民服务",
            "online-formulare": "在线表格",
            "beschleunigtes": "快速专业人才程序",
            "termine": "预约",
            "termin vereinbaren": "预约办理",
        }
        for key, val in m.items():
            if key in t:
                return val
        return title_de[:60]

    def _build_summary(self, title_de: str, topic: str, content: str) -> str:
        return (
            f"柏林外管局（LEA）{self._translate_topic(title_de)}相关指南。"
            f"柏林外管局负责居留许可、签证延期、入籍等事务的办理。"
            f"本页面介绍了 {title_de} 的基本信息和办理方式。"
        )

    def _extract_fees(self, content: str) -> str:
        patterns = [
            r'(\d+[\.,]?\d*)\s*(€|Euro|EUR)',
            r'gebühren?pflichtig',
            r'gebühren?',
            r'kostenlos',
        ]
        for line in content.split("\n"):
            if any(re.search(p, line, re.I) for p in patterns):
                return line[:150]
        return ""

    def _extract_duration(self, content: str) -> str:
        patterns = [
            r'(\d+)\s*(woche|monat|tag|jahr|wochen|monaten|tagen|jahren)',
            r'bearbeitungszeit',
            r'dauer',
        ]
        for line in content.split("\n"):
            if any(re.search(p, line, re.I) for p in patterns):
                return line[:150]
        return ""

    def run(self):
        supabase = get_supabase_client()
        urls = self.discover_urls()
        entries = []
        for url in urls:
            print(f"  [{url.split('/')[-2] or url.split('/')[-1]}] {url}")
            html, new_etag, has_changed = fetch_page(url)
            if not html:
                print(f"    ✗ 采集失败")
                continue
            entry = self.parse_page(url, html)
            if entry:
                entries.append(entry)
                print(f"    ✓ {len(html)}B — {entry['title_zh'][:40]}...")
        if entries:
            total = batch_write(supabase, entries)
            print(f"\n  Written {total}/{len(entries)} entries")
        else:
            print("\n  No entries to write")


if __name__ == "__main__":
    scraper = BerlinLeaScraper()
    scraper.run()
