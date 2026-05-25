"""
scraper_mig_wayback.py — Make-it-in-Germany 爬虫（通过 Wayback Machine）
遵循现有 scraper 模式：写 policy_pages（translated=false），供 translate_policy.py 提炼
"""
import sys, os, json, time, hashlib, re
from typing import Any
from bs4 import BeautifulSoup

PROJECT_DIR = "/home/joven/policy-booth-2"
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts", "python"))

from policy.base_scraper import BaseScraper, get_supabase_client, fetch_page, get_etags, save_etags, \
    extract_text, clean_text, url_to_service_key, make_slug, write_policy, batch_write

from dotenv import load_dotenv
load_dotenv(os.path.join(PROJECT_DIR, ".env"), override=True)

# ── Load extracted data ──
DATA_PATH = os.path.join(PROJECT_DIR, "scripts", "python", "policy", "mig_extracted_data.json")
with open(DATA_PATH, encoding="utf-8") as f:
    extracted = json.load(f)

PAGES = extracted["pages"]

# Add German version URLs (parallel DE paths)
DE_PATH_MAP = {
    "en/visa-residence/types/eu-blue-card": "de/visum-aufenthalt/aufenthaltstitel/blaue-karte-eu",
    "en/visa-residence/types/work-qualified-professionals": "de/visum-aufenthalt/aufenthaltstitel/fachkraefte",
    "en/visa-residence/types/visa-professionally-experienced-workers": "de/visum-aufenthalt/aufenthaltstitel/berufserfahrene",
    "en/visa-residence/types/it-professionals": "de/visum-aufenthalt/aufenthaltstitel/it-fachkraefte",
    "en/visa-residence/types/recognition": "de/visum-aufenthalt/aufenthaltstitel/anerkennung",
    "en/visa-residence/types/studying": "de/visum-aufenthalt/aufenthaltstitel/studium",
    "en/visa-residence/types/training": "de/visum-aufenthalt/aufenthaltstitel/ausbildung",
    "en/visa-residence/opportunity-card": "de/visum-aufenthalt/chancenkarte",
    "en/visa-residence/family-reunification": "de/visum-aufenthalt/familiennachzug",
    "en/visa-residence/family-reunification/spouses-joining-citizens-non-eu": "de/visum-aufenthalt/familiennachzug/ehegatten-deutsche",
    "en/visa-residence/family-reunification/children-join": "de/visum-aufenthalt/familiennachzug/kinder",
    "en/visa-residence/living-permanently": "de/visum-aufenthalt/dauerhaft-leben",
    "en/visa-residence/living-permanently/settlement-permit": "de/visum-aufenthalt/dauerhaft-leben/niederlassungserlaubnis",
    "en/visa-residence/living-permanently/naturalisation": "de/visum-aufenthalt/dauerhaft-leben/einbuergerung",
    "en/visa-residence/procedure/entry-process": "de/visum-aufenthalt/verfahren/einreise",
    "en/visa-residence/skilled-immigration-act": "de/visum-aufenthalt/fachkraefteeinwanderungsgesetz",
    "en/working-in-germany/recognition/who-needs": "de/arbeiten-in-deutschland/anerkennung/wer-braucht",
    "en/working-in-germany/recognition/procedure": "de/arbeiten-in-deutschland/anerkennung/verfahren",
    "en/working-in-germany/recognition/foreign-academic-qualifications": "de/arbeiten-in-deutschland/anerkennung/auslaendische-abschluesse",
    "en/working-in-germany/recognition": "de/arbeiten-in-deutschland/anerkennung",
    "en/working-in-germany/job/application": "de/arbeiten-in-deutschland/job/bewerbung",
    "en/working-in-germany/job/looking-for-job": "de/arbeiten-in-deutschland/job/arbeitssuche",
    "en/working-in-germany/professions-in-demand/nursing": "de/arbeiten-in-deutschland/berufe-pflege",
    "en/working-in-germany/professions-in-demand/engineers": "de/arbeiten-in-deutschland/berufe-ingenieure",
    "en/working-in-germany/professions-in-demand/career-it-specialists": "de/arbeiten-in-deutschland/it-spezialisten",
    "en/working-in-germany/setting-up-business": "de/arbeiten-in-deutschland/selbstaendigkeit",
    "en/working-in-germany/setting-up-business/visa": "de/arbeiten-in-deutschland/selbstaendigkeit/visum",
    "en/working-in-germany/working-environment/salary-taxes-social-security": "de/arbeiten-in-deutschland/arbeitsumfeld/gehalt-steuern-sozialversicherung",
    "en/working-in-germany/working-environment/work-contract": "de/arbeiten-in-deutschland/arbeitsumfeld/arbeitsvertrag",
    "en/study-vocational-training/studies-in-germany": "de/studium-ausbildung/studium",
    "en/study-vocational-training/studies-in-germany/prospects-after": "de/studium-ausbildung/studium-perspektiven",
    "en/study-vocational-training/training-in-germany": "de/studium-ausbildung/ausbildung",
    "en/living-in-germany/learn-german": "de/leben-in-deutschland/deutsch-lernen",
    "en/living-in-germany/learn-german/integration-courses": "de/leben-in-deutschland/deutsch-lernen/integrationskurse",
    "en/living-in-germany/housing-mobility/housing-registration": "de/leben-in-deutschland/wohnen/wohnungsanmeldung",
    "en/living-in-germany/housing-mobility/driving-licence-car": "de/leben-in-deutschland/wohnen/fuehrerschein",
    "en/living-in-germany/money-insurance/bank-account": "de/leben-in-deutschland/geld-versicherung/konto",
    "en/living-in-germany/money-insurance/health-insurance": "de/leben-in-deutschland/geld-versicherung/krankenversicherung",
    "en/visa-residence/types/visa-recognition-partnership": "de/visum-aufenthalt/aufenthaltstitel/anerkennungspartnerschaft",
    "en/visa-residence/types/visa-professionally-experienced-workers": "de/visum-aufenthalt/aufenthaltstitel/berufserfahrene",
    "en/visa-residence/family-reunification/spouses-joining-eu-citizens": "de/visum-aufenthalt/familiennachzug/ehegatten-eu",
}

class MakeItInGermanyWaybackScraper(BaseScraper):
    SOURCE_NAME = "Make-it-in-Germany（联邦劳动部）"
    SOURCE_PREFIX = "mig"
    PUBLISHER = "Bundesministerium für Arbeit und Soziales / Federal Ministry of Labour and Social Affairs"
    CATEGORY = "工作与蓝卡"
    REGION_LEVEL = "联邦"
    REGION_NAME = "Deutschland"

    def __init__(self, supabase=None, dry_run=False, data_path=None):
        super().__init__(supabase, dry_run)
        self.pages = PAGES
        print(f"[{self.SOURCE_NAME}] 加载 {len(self.pages)} 个页面数据 (来源: Wayback Machine)")

    def discover_urls(self):
        return [p.get('wayback_url', f"https://www.make-it-in-germany.com/{p['path']}") for p in self.pages]

    def parse_page(self, url: str, html: str = None) -> dict[str, Any] | None:
        """Parse doesn't need HTML - we already have pre-extracted content"""
        return None

    def run(self):
        """直接写入预提取的数据"""
        existing = set()
        try:
            resp = self.supabase.table("policy_pages").select("service_key").execute()
            existing = {r["service_key"] for r in (resp.data or [])}
        except:
            pass

        print(f"[{self.SOURCE_NAME}] 已有: {len(existing)} 条")
        
        entries = []
        for p in self.pages:
            eng_path = p['path']
            path_clean = eng_path.replace('en/', '', 1) if eng_path.startswith('en/') else eng_path
            source_url = f"https://www.make-it-in-germany.com/{path_clean}"
            service_key = url_to_service_key(source_url, "mig")
            
            if service_key in existing:
                print(f"  ⏭ 已存在: {p['title'][:30]}")
                self.stats['skipped'] += 1
                continue
            
            # Extract title from content (first meaningful line or from title field)
            content = p['content']
            title_de = p['title']  # Use our Chinese title as placeholder
            
            # Try to find English title from the first heading in content
            lines = content.split('\n')
            first_line = lines[0] if lines else title_de
            # Filter out navigation-like first lines
            if len(first_line) > 30 and 'breadcrumb' not in first_line.lower():
                title_de = first_line[:100]
            
            entry = {
                "service_key": service_key,
                "slug": make_slug(title_de, source_url),
                "title_de": title_de,
                "title_zh": p['title'],  # Chinese title
                "summary_zh": content[:5000],  # Store extracted content for AI processing
                "source_url": source_url,
                "source_name": self.SOURCE_NAME,
                "publisher": self.PUBLISHER,
                "region_level": self.REGION_LEVEL,
                "region_name": self.REGION_NAME,
                "category": self.CATEGORY,
                "translated": False,
                "last_fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }
            entries.append(entry)
            self.stats['fetched'] += 1
            self.stats['written'] += 1
            print(f"  ✓ {p['title'][:35]} ({len(content)} chars)")

        if not entries:
            print(f"[{self.SOURCE_NAME}] 没有新条目需要写入")
            return self.stats

        if self.dry_run:
            print(f"\n[DRY RUN] 将写入 {len(entries)} 条")
            return self.stats

        written = batch_write(self.supabase, entries)
        print(f"\n[{self.SOURCE_NAME}] 完成: 准备写入 {len(entries)} 条, 实际写入 {written} 条")
        return self.stats


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Make-it-in-Germany Wayback 爬虫")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    supabase = get_supabase_client()
    scraper = MakeItInGermanyWaybackScraper(supabase=supabase, dry_run=args.dry_run)
    scraper.run()
