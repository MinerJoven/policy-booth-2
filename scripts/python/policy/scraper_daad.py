#!/usr/bin/env python3
"""
政策展台 2.0 — DAAD（德国学术交流中心）政策采集器

DAAD (Deutscher Akademischer Austauschdienst) — German Academic Exchange Service.
Scrapes key student info pages from the DAAD website (Nuxt SSR - content is server-side rendered).

Website: https://www.daad.de/de/in-deutschland-studieren/
"""

import os
import sys
import re
import time
import json
from typing import Any

import httpx
from bs4 import BeautifulSoup

PROJECT_DIR = "/home/joven/policy-booth-2"
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts", "python"))

from base_scraper import (
    BaseScraper,
    HEADERS,
    client,
    fetch_page,
    extract_text,
    clean_text,
    make_content_hash,
    url_to_service_key,
    make_slug,
    get_supabase_client,
    write_policy,
    save_etags,
    get_etags,
)


class DAADScraper(BaseScraper):
    """DAAD 德国学术交流中心 — 学生签证、居留、奖学金等信息采集"""

    SOURCE_NAME = "DAAD（德国学术交流中心）"
    SOURCE_PREFIX = "daad"
    PUBLISHER = "Deutscher Akademischer Austauschdienst (DAAD)"
    CATEGORY = "留学与大学"

    # ── Key Student Info Pages (German) ──
    # These are the main DAAD pages relevant to international students in Germany.
    # The DAAD website uses Nuxt SSR so content IS present in the HTML response.
    PAGES = [
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/",
            "title_de": "In Deutschland studieren und forschen",
            "description": "Übersichtsseite zum Studieren und Forschen in Deutschland"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/voraussetzungen/",
            "title_de": "Voraussetzungen & Einschreibung",
            "description": "Voraussetzungen für die Bewerbung und Einschreibung an deutschen Hochschulen"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/hochschulen/",
            "title_de": "Hochschulen & Studienangebote",
            "description": "Informationen zu Hochschulen und Studienangeboten in Deutschland"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/stipendien/",
            "title_de": "Stipendien & Förderung",
            "description": "Stipendienangebote und Fördermöglichkeiten für internationale Studierende"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/",
            "title_de": "Leben in Deutschland",
            "description": "Allgemeine Informationen zum Leben in Deutschland für internationale Studierende"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/visum/",
            "title_de": "Das Visum",
            "description": "Visum, Aufenthaltserlaubnis und Einreisebestimmungen für Studierende"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/krankenversicherung/",
            "title_de": "Gesundheitswesen und Krankenversicherung",
            "description": "Krankenversicherungspflicht und Gesundheitsversorgung für Studierende in Deutschland"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/finanzen/",
            "title_de": "Ausbildungs- und Lebenshaltungskosten",
            "description": "Studienkosten, Lebenshaltungskosten und Finanzierungsmöglichkeiten"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/deutsche-sprache/",
            "title_de": "Die deutsche Sprache",
            "description": "Sprachvoraussetzungen und Deutschkurse für internationale Studierende"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/wohnen/",
            "title_de": "Das eigene Zimmer – Wohnungssuche in Deutschland",
            "description": "Wohnungssuche, Mietvertrag und Wohnformen für Studierende"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/anmeldung/",
            "title_de": "Aufenthaltserlaubnis und Anmeldung des Wohnsitzes",
            "description": "Aufenthaltserlaubnis, Wohnsitzanmeldung und Behördengänge"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/sicherheit/",
            "title_de": "Sicherheit in Deutschland",
            "description": "Sicherheit, Notfälle und wichtige Kontaktstellen"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/arbeit-karriere/",
            "title_de": "Arbeiten und Karriereplanung",
            "description": "Jobben während des Studiums und Karrierechancen nach dem Abschluss"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/promovieren-forschen/",
            "title_de": "Promovieren und Forschen",
            "description": "Promotionsmöglichkeiten und Forschung in Deutschland"
        },
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/hilfe-beratung/",
            "title_de": "Hilfe & Beratung",
            "description": "Beratungsangebote und Kontaktmöglichkeiten für internationale Studierende"
        },
        # Additional sub-pages
        {
            "url": "https://www.daad.de/de/in-deutschland-studieren/leben-in-deutschland/wohnheimfinder/",
            "title_de": "Wohnheimfinder",
            "description": "Wohnheimplätze für Studierende in Deutschland finden"
        },
    ]

    def __init__(self, supabase=None, dry_run: bool = False):
        super().__init__(supabase, dry_run)

    def discover_urls(self) -> list[str]:
        """返回所有待抓取的 DAAD 页面 URL"""
        return [page["url"] for page in self.PAGES]

    def _extract_title(self, soup: BeautifulSoup, page_info: dict) -> str:
        """
        从页面中提取标题。
        优先使用 main 标签内的 H1（排除 Cookie 弹窗）。
        如果找不到，回退到硬编码的 title_de。
        """
        # Try inside <main> or <article>
        for selector in ["main h1.qa-headline-title", "main h1", "article h1"]:
            h1 = soup.select_one(selector)
            if h1:
                text = h1.get_text(strip=True)
                if text and "cookie" not in text.lower() and "einwilligung" not in text.lower():
                    return text

        # Try all H1s, skip cookie dialog
        for h1 in soup.find_all("h1"):
            text = h1.get_text(strip=True)
            if text and "cookie" not in text.lower() and "einwilligung" not in text.lower():
                return text

        # Fallback
        title_base = page_info.get("title_de", "")
        return title_base

    def _extract_content(self, soup: BeautifulSoup) -> str:
        """
        从页面中提取主要内容。
        优先使用 <main> 标签内的文本，移除 Cookie 弹窗等噪声。
        """
        # Get main element
        main = soup.select_one("main")
        if not main:
            main = soup.find("body")

        if not main:
            return ""

        # Remove cookie dialog
        for dialog in main.find_all(["dialog", "aside", "nav"]):
            dialog_text = dialog.get_text(strip=True).lower()
            if "cookie" in dialog_text or "einwilligung" in dialog_text:
                dialog.decompose()

        # Get all text
        text = main.get_text(separator="\n", strip=True)

        # Clean up: normalize whitespace, remove soft hyphens
        text = re.sub(r"\s+", " ", text)
        text = text.replace("\xad", "")  # Remove soft hyphens (&shy;)
        text = text.strip()

        # Remove navigation footer text noise
        noise_phrases = [
            "ANSCHRIFT", "DAAD NEWSLETTER", "NÜTZLICHE LINKS",
            "Servicenavigation", "Links zu den Sozialen Medien",
            "Impressum", "Datenschutzerklärung", "Cookies",
            "Erklärung Barrierefreiheit", "Barriere melden",
            "Gebärdensprache", "Leichte Sprache",
            "Farbumschalter", "Colour switch",
        ]
        for phrase in noise_phrases:
            text = text.replace(phrase, "")

        text = re.sub(r"\s+", " ", text).strip()
        return text

    def parse_page(self, url: str, html: str) -> dict | None:
        """解析 DAAD 页面，返回 policy_pages 格式的数据"""
        if not html:
            return None

        soup = BeautifulSoup(html, "html.parser")

        # Find page info
        page_info = next((p for p in self.PAGES if p["url"] == url), {})

        # Extract title
        title_de = self._extract_title(soup, page_info)
        if not title_de:
            title_de = page_info.get("title_de", url.split("/")[-2] or "DAAD Page")

        # Extract main content
        summary_zh = self._extract_content(soup)
        if not summary_zh or len(summary_zh) < 50:
            # Fallback to hardcoded description
            summary_zh = page_info.get("description", "")

        # Generate service_key and slug
        service_key = url_to_service_key(url, prefix=self.SOURCE_PREFIX)
        slug = make_slug(title_de, url)

        # Build entry
        entry = {
            "service_key": service_key,
            "slug": slug,
            "title_de": title_de,
            "title_zh": title_de,  # Same as DE for now, will be translated later
            "summary_zh": summary_zh,
            "content_hash": make_content_hash(html),
            "source_url": url,
            "source_name": self.SOURCE_NAME,
            "publisher": self.PUBLISHER,
            "region_level": self.REGION_LEVEL,
            "region_name": self.REGION_NAME,
            "category": self.CATEGORY,
            "tags": ["DAAD", "Studium in Deutschland", "internationale Studierende"],
            "translated": False,
            "last_fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }

        return entry


# ── CLI ──

def main():
    import argparse

    parser = argparse.ArgumentParser(description="DAAD 政策采集器")
    parser.add_argument("--dry-run", action="store_true", help="不写入 DB，只打印结果")
    args = parser.parse_args()

    if args.dry_run:
        supabase = None
    else:
        try:
            supabase = get_supabase_client()
        except Exception as e:
            print(f"[ERROR] Supabase 连接失败: {e}")
            print("[INFO] 使用 --dry-run 模式运行测试")
            supabase = None
            args.dry_run = True

    scraper = DAADScraper(supabase=supabase, dry_run=args.dry_run)
    scraper.run()


if __name__ == "__main__":
    main()
