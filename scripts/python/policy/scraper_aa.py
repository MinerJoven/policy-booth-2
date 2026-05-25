#!/usr/bin/env python3
"""
政策展台 2.0 — Auswärtiges Amt（德国外交部）签证政策采集器

采集 AA 官网的签证政策信息：
- Visas for Germany（通用签证信息）
- The Schengen Agreement（申根协定）
- Overview of visa requirements（签证要求概览）
- International marriages（国际婚姻）
- Certification/Authentication（文件公证/认证）
- Recognition/Legalisation（国际认可）
- Asylum Law（庇护法）
- Information about Germany（德国概况）
- FAQ pages（各种签证 FAQ）

AA 使用 TYPO3 CMS，静态 HTML 内容，结构稳定。
"""
import os
import sys
import re
import time
from typing import Any

from bs4 import BeautifulSoup

PROJECT_DIR = "/home/joven/policy-booth-2"
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts", "python"))

from policy.base_scraper import BaseScraper, fetch_page, get_etags, extract_text, clean_text, url_to_service_key, make_slug


class AAScraper(BaseScraper):
    """Auswärtiges Amt 签证政策爬虫"""

    SOURCE_NAME = "Auswärtiges Amt（德国外交部）"
    SOURCE_PREFIX = "aa"
    PUBLISHER = "Auswärtiges Amt (Federal Foreign Office)"
    CATEGORY = "居留与签证"

    # ── 所有待爬取的内容页面 URL 列表 ──
    CONTENT_URLS = [
        # ── Visa 签证信息 ──
        "https://www.auswaertiges-amt.de/en/visa-service/215870-215870",
        "https://www.auswaertiges-amt.de/en/visa-service/231202-231202",
        "https://www.auswaertiges-amt.de/en/visa-service/231148-231148",
        # ── Consular 领事信息 ──
        "https://www.auswaertiges-amt.de/en/visa-service/konsularisches/eheschliessung-node",
        "https://www.auswaertiges-amt.de/en/visa-service/konsularisches/beurkundungen-node",
        "https://www.auswaertiges-amt.de/en/visa-service/konsularisches/urkundenverkehrallgemeines-node",
        "https://www.auswaertiges-amt.de/en/visa-service/konsularisches/staatsangehoerigkeitsrecht-node",
        # ── Asyl / 庇护 ──
        "https://www.auswaertiges-amt.de/en/visa-service/229968-229968",
        # ── Living in Germany ──
        "https://www.auswaertiges-amt.de/en/visa-service/02-lernen-und-arbeiten/01-deutschland",
        # ── FAQ 页面 ──
        "https://www.auswaertiges-amt.de/en/visa-service/buergerservice/faq/606848-606848",
        "https://www.auswaertiges-amt.de/en/visa-service/buergerservice/faq/08-studentenvisum-606690",
        "https://www.auswaertiges-amt.de/en/visa-service/buergerservice/faq/06-workingholiday-606672",
        "https://www.auswaertiges-amt.de/en/visa-service/buergerservice/faq/01-stipendien-606688",
    ]

    def discover_urls(self) -> list[str]:
        """返回所有待爬取的 AA 页面 URL"""
        return self.CONTENT_URLS

    # ── 需要过滤掉的短文本（导航/来源/语言切换等）──
    BOILERPLATE_PATTERNS = [
        r"^©", r"^Copyright", r"^Share this page",
        r"^Federal Foreign Office$",
        r"^Content$",
        r"^We hope you understand",
        r"^Breadcrumbs",
        r"^More languages",
        r"^Copyright",
        r"^Report an accessibility problem",
    ]

    @staticmethod
    def _is_boilerplate(text: str) -> bool:
        for pat in AAScraper.BOILERPLATE_PATTERNS:
            if re.match(pat, text):
                return True
        # Filter very short boilerplate
        if len(text) < 10 and text.lower() in ['visa & service', 'visa information',
                                                 'living in germany', 'help desk',
                                                 'consular information', 'faq',
                                                 'visa navigator']:
            return True
        return False

    def parse_page(self, url: str, html: str) -> dict[str, Any] | None:
        """
        解析单个 AA 页面。
        AA 使用 TYPO3 CMS，内容在 <main> 中，
        标题在 <sectionheader> 的 <h1> 中。
        """
        soup = BeautifulSoup(html, "html.parser")
        main = soup.find("main")
        if not main:
            print(f"  [WARN] 未找到 <main>: {url}")
            return None

        # ── 提取标题 title_de ──
        # AA 有两个 h1：第一个是 skip-nav "Welcome"，第二个在 sectionheader 里
        title_de = ""
        # 优先从 sectionheader 找
        sh = soup.find("sectionheader")
        if sh:
            h1 = sh.find("h1")
            if h1:
                title_de = clean_text(h1.get_text())

        if not title_de:
            # 回退：取最后一个 h1
            h1s = soup.find_all("h1")
            if len(h1s) > 1:
                title_de = clean_text(h1s[-1].get_text())
            elif h1s:
                title_de = clean_text(h1s[0].get_text())

        if not title_de:
            title_tag = soup.select_one("title")
            if title_tag:
                raw = title_tag.get_text(strip=True)
                title_de = re.sub(r'\s*-\s*Federal Foreign Office$', '', raw).strip()
            else:
                title_de = "Untitled AA Page"

        # ── 提取正文 summary_zh ──
        # AA 不适用 #content div，直接取 main 中所有 h2/p/li
        # 跳过 nav/footer/share 等装饰性元素
        summary_parts = []
        for el in main.find_all(["h2", "h3", "h4", "p", "li"]):
            # 跳过在导航/页脚/分享区域内的元素
            if el.find_parent("nav") or el.find_parent("footer") or el.find_parent("aside"):
                continue
            # 跳过 aria-hidden 或 display:none 相关的
            text = clean_text(el.get_text())
            if not text or len(text) < 5:
                continue
            if self._is_boilerplate(text):
                continue
            summary_parts.append(text)

        if len(summary_parts) < 5:
            # 回退：取 main 全部文本再清理
            raw = clean_text(main.get_text())
            lines = [l.strip() for l in raw.split("\n") if len(l.strip()) > 10]
            summary_zh = "\n\n".join(lines)
        else:
            summary_zh = "\n\n".join(summary_parts)

        if len(summary_zh) < 100:
            print(f"  [WARN] 内容过短 ({len(summary_zh)} chars), 跳过: {url}")
            return None

        # ── 构建返回字典 ──
        service_key = url_to_service_key(url, prefix=self.SOURCE_PREFIX)
        slug = make_slug(title_de, url)

        entry = {
            "service_key": service_key,
            "slug": slug,
            "title_de": title_de,
            "title_zh": title_de,  # 占位，AI 提炼后填充
            "summary_zh": summary_zh,
            "requirements_zh": [],
            "fees_zh": "",
            "duration_zh": "",
            "steps_zh": [],
            "source_url": url,
        }

        return entry


# ── Main ──

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AA 签证政策爬虫")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入 DB")
    args = parser.parse_args()

    scraper = AAScraper(dry_run=args.dry_run)
    scraper.run()
