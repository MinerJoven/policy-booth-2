#!/usr/bin/env python3
"""
BAMF（联邦移民局）爬虫
爬取 BAMF (Bundesamt für Migration und Flüchtlinge) 网站上的移民与入籍政策页面
"""
import sys
import os
import re
from typing import Any

from bs4 import BeautifulSoup

# ── Project Path ──
PROJECT_DIR = "/home/joven/policy-booth-2"
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts", "python"))

from policy.base_scraper import BaseScraper, fetch_page, get_etags, extract_text, clean_text, url_to_service_key, make_slug


# ── BAMF Scraper ──

class BAMFScraper(BaseScraper):
    """BAMF 网站政策爬虫"""

    SOURCE_NAME = "BAMF（联邦移民局）"
    SOURCE_PREFIX = "bamf"
    PUBLISHER = "Bundesamt für Migration und Flüchtlinge (BAMF)"
    CATEGORY = "移民与居留"  # 移民与居留类别

    BASE_URL = "https://www.bamf.de"

    # ── 所有待爬取的内容页面 URL 列表 ──
    CONTENT_URLS = [
        # ── Work (Arbeit) 子页面 ──
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/Fachkraft/fachkraft-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/Hochschulabsolvent/hochschulabsolvent-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/FachkraefteOhneAusbildung/fachkraefte-ohne-ausbildung-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/Wissenschaftler/wissenschaftler-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/ICT/ict-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/SelbstaendigeTaetigkeit/selbstaendigetaetigkeit-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Arbeit/Sonstige/sonstige-node.html",

        # ── Education (Bildung) 子页面 ──
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Bildung/SchueleraustauschSchulbesuch/schueleraustauschschulbesuch-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Bildung/Berufsausbildung/berufsausbildung-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Bildung/Studium/studium-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Bildung/Sprachkurs/sprachkurs-node.html",

        # ── Family (Familie) 子页面 ──
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Familie/NachzugZuDeutschen/nachzug-zu-deutschen-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Familie/NachzugZuEUBuergern/nachzug-zu-eu-buergern-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Familie/NachzugZuDrittstaatlern/nachzug-zu-drittstaatlern-node.html",

        # ── Mobility in the EU (MobilitaetEU) 子页面 ──
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/MobilitaetEU/MobilitaetBlaueKarteEU/mobilitaet-blauekarteeu-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/MobilitaetEU/MobilitaetICT/mobilitaet-ict-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/MobilitaetEU/MobilitaetStudent/mobilitaet-student-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/MobilitaetEU/MobilitaetWissenschaftler/mobilitaet-wissenschaftler-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/MobilitaetEU/MobilitaetLangfristigerAufenthalt/mobilitaet-langfristigeraufenthalt-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/MobilitaetEU/MoNa/mona-node.html",

        # ── Information collection / Migrathek 子页面 ──
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Migrathek/Einreisebestimmungen/einreisebestimmungen-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Migrathek/Vorintegration/vorintegration-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Migrathek/ErsteSchritte/ersteschritte-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Migrathek/BlaueKarteEU/blauekarteeu-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Migrathek/Niederlassen/niederlassen-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Migrathek/eAufenthaltstitel/eaufenthaltstitel-node.html",
        "https://www.bamf.de/EN/Themen/MigrationAufenthalt/ZuwandererDrittstaaten/Migrathek/Fachkraefteverfahren/fachkraefteverfahren-node.html",

        # ── Naturalisation (Einbuergerung) ──
        "https://www.bamf.de/EN/Themen/Integration/ZugewanderteTeilnehmende/Einbuergerung/einbuergerung-node.html",
    ]

    def discover_urls(self) -> list[str]:
        """返回所有待爬取的 BAMF 页面 URL"""
        return self.CONTENT_URLS

    # ── 需要过滤掉的短文本（导航/来源/语言切换等）──
    BOILERPLATE_PATTERNS = [
        r"^Source:", r"^©", r"^Date:", r"^Format:", r"^Area:",
        r"This content is also available in",
        r"^Make it in Germany",
        r"Link to the information hotline",
        r"^Go to:",
        r"^You are here:",
    ]

    @staticmethod
    def _is_boilerplate(text: str) -> bool:
        """检查文本是否为导航/来源等非正文内容"""
        for pat in BAMFScraper.BOILERPLATE_PATTERNS:
            if re.match(pat, text):
                return True
        return False

    @staticmethod
    def _is_in_boilerplate_container(el) -> bool:
        """检查元素是否位于需要过滤的容器中"""
        for parent in el.parents:
            if parent.name in ("div",) and parent.get("class"):
                classes = " ".join(parent.get("class", []))
                if any(c in classes for c in [
                    "c-language-switch", "l-intro-media",
                    "c-meta", "aural",
                ]):
                    return True
            # 跳过隐藏元素
            if parent.name == "span" and "aural" in parent.get("class", []):
                return True
        return False

    def parse_page(self, url: str, html: str) -> dict[str, Any] | None:
        """
        解析单个 BAMF 页面。
        从 #content 区域提取标题和正文，填充占位字段。
        """
        soup = BeautifulSoup(html, "html.parser")
        content = soup.select_one("#content")
        if not content:
            print(f"  [WARN] 未找到 #content: {url}")
            return None

        # ── 提取标题 title_de ──
        h1 = content.select_one("h1")
        title_de = ""
        if h1:
            main_span = h1.find("span", recursive=False)
            if main_span:
                title_de = clean_text(main_span.get_text())
            else:
                title_de = clean_text(h1.get_text())

        if not title_de:
            title_tag = soup.select_one("title")
            if title_tag:
                raw = title_tag.get_text(strip=True)
                title_de = re.sub(r'^BAMF\s*-\s*Bundesamt[^\-]*-\s*', '', raw).strip()
            else:
                title_de = "Untitled BAMF Page"

        # ── 提取正文 summary_zh ──
        # 获取内容列（跳过图片、语言切换等页面装饰）
        column = content.select_one(".column")
        if not column:
            column = content

        summary_parts = []
        for el in column.find_all(["h2", "h3", "h4", "h5", "h6", "p", "li"]):
            # 跳过在语言切换/图片容器内的元素
            if self._is_in_boilerplate_container(el):
                continue
            text = clean_text(el.get_text())
            if not text or len(text) < 5:
                continue
            if self._is_boilerplate(text):
                continue
            summary_parts.append(text)

        if len(summary_parts) < 3:
            # 回退：从 #content 取全文本再清理
            raw = clean_text(content.get_text())
            lines = [l.strip() for l in raw.split("\n") if len(l.strip()) > 10]
            summary_zh = "\n\n".join(lines)
        else:
            summary_zh = "\n\n".join(summary_parts)

        # ── 构建返回字典 ──
        service_key = url_to_service_key(url, prefix=self.SOURCE_PREFIX)
        slug = make_slug(title_de, url)

        entry = {
            "service_key": service_key,
            "slug": slug,
            "title_de": title_de,
            "title_zh": title_de,  # 翻译在后处理阶段完成
            "summary_zh": summary_zh,
            "requirements_zh": [],     # 空占位，AI 提炼后填充
            "fees_zh": "",             # 空占位
            "duration_zh": "",         # 空占位
            "steps_zh": [],            # 空占位
            "source_url": url,
        }

        return entry


# ── Main ──

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="BAMF 移民政策爬虫")
    parser.add_argument("--dry-run", action="store_true", help="仅打印发现结果，不写入 DB")
    args = parser.parse_args()

    scraper = BAMFScraper(dry_run=args.dry_run)
    scraper.run()
