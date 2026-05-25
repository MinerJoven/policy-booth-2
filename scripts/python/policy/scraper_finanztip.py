#!/usr/bin/env python3
"""
政策展台 2.0 — Finanztip（德国消费者理财指南）政策采集器

采集 Finanztip 的实用指南类页面：
- 税务：Einkommensteuer, Steuererklärung
- 保险：Krankenversicherung, Haftpflicht, Rechtsschutz
- 福利：Kindergeld, Elterngeld, Wohngeld
- 银行：Girokonto, Kreditkarte

Finanztip 是德国最权威的独立消费者理财网站，
静态 HTML，BeautifulSoup 直连可用。
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


class FinanztipScraper(BaseScraper):
    """Finanztip 消费者指南爬虫"""

    SOURCE_NAME = "Finanztip（消费者理财指南）"
    SOURCE_PREFIX = "finanztip"
    PUBLISHER = "Finanztip Verbraucherinformation gemeinnützige GmbH"
    REGION_LEVEL = "联邦"
    REGION_NAME = "Deutschland"

    # ── 分类映射（德国页面 → 展台分类）──
    CATEGORY_MAP = {
        "einkommensteuer": "税务与社保",
        "steuererklaerung": "税务与社保",
        "steuerklasse": "税务与社保",
        "krankenversicherung": "医保与保险",
        "haftpflichtversicherung": "生活行政",
        "rechtsschutzversicherung": "生活行政",
        "wohngeld": "住房与租房",
        "kindergeld": "育儿与教育",
        "elterngeld": "育儿与教育",
        "girokonto": "生活行政",
        "kreditkarte": "生活行政",
    }

    # ── 标签映射 ──
    TAG_MAP = {
        "einkommensteuer": ["税务", "报税", "个人所得税"],
        "steuererklaerung": ["税务", "报税", "退税"],
        "krankenversicherung": ["医疗保险", "公立保险", "私立保险"],
        "haftpflichtversicherung": ["责任险", "保险", "家庭保险"],
        "rechtsschutzversicherung": ["法律险", "保险", "法律保护"],
        "wohngeld": ["住房补贴", "住房", "政府补助"],
        "kindergeld": ["儿童金", "育儿", "家庭福利"],
        "elterngeld": ["父母金", "育儿", "产假", "家庭福利"],
        "girokonto": ["银行账户", "转账账户", "理财"],
        "kreditkarte": ["信用卡", "支付", "理财"],
    }

    # ── 目标群体映射 ──
    GROUP_MAP = {
        "einkommensteuer": ["新移民", "工作签人群", "求职者", "自雇人士"],
        "steuererklaerung": ["新移民", "工作签人群", "求职者", "自雇人士"],
        "krankenversicherung": ["新移民", "工作签人群", "留学生"],
        "haftpflichtversicherung": ["新移民", "华人家庭"],
        "rechtsschutzversicherung": ["新移民", "工作签人群", "华人家庭"],
        "wohngeld": ["新移民", "留学生", "求职者"],
        "kindergeld": ["华人家庭"],
        "elterngeld": ["华人家庭"],
        "girokonto": ["新移民", "留学生", "工作签人群"],
        "kreditkarte": ["新移民", "留学生", "工作签人群"],
    }

    # ── 所有待爬取的页面 ──
    PAGES = [
        {
            "url": "https://www.finanztip.de/einkommensteuer/",
            "name": "einkommensteuer",
            "title_de": "Einkommensteuer - das musst Du wissen",
        },
        {
            "url": "https://www.finanztip.de/steuererklaerung/",
            "name": "steuererklaerung",
            "title_de": "Steuererklärung",
        },
        {
            "url": "https://www.finanztip.de/krankenversicherung/",
            "name": "krankenversicherung",
            "title_de": "Krankenversicherung - GKV vs. PKV",
        },
        {
            "url": "https://www.finanztip.de/haftpflichtversicherung/",
            "name": "haftpflichtversicherung",
            "title_de": "Haftpflichtversicherung",
        },
        {
            "url": "https://www.finanztip.de/rechtsschutzversicherung/",
            "name": "rechtsschutzversicherung",
            "title_de": "Rechtsschutzversicherung",
        },
        {
            "url": "https://www.finanztip.de/wohngeld/",
            "name": "wohngeld",
            "title_de": "Wohngeld",
        },
        {
            "url": "https://www.finanztip.de/kindergeld/",
            "name": "kindergeld",
            "title_de": "Kindergeld",
        },
        {
            "url": "https://www.finanztip.de/elterngeld/",
            "name": "elterngeld",
            "title_de": "Elterngeld",
        },
        {
            "url": "https://www.finanztip.de/girokonto/",
            "name": "girokonto",
            "title_de": "Girokonto",
        },
        {
            "url": "https://www.finanztip.de/kreditkarte/",
            "name": "kreditkarte",
            "title_de": "Kreditkarte",
        },
    ]

    def discover_urls(self) -> list[str]:
        """返回所有待爬取 URL"""
        return [p["url"] for p in self.PAGES]

    def parse_page(self, url: str, html: str) -> dict[str, Any] | None:
        """
        解析 Finanztip 页面。
        内容在 <main> 中，结构：h1 标题 + h2/h3 分区 + p/li 正文。
        """
        soup = BeautifulSoup(html, "html.parser")
        main = soup.find("main")
        if not main:
            print(f"  [WARN] 未找到 <main>: {url}")
            return None

        # ── 找 page info ──
        page_info = next((p for p in self.PAGES if p["url"] == url), {})
        page_name = page_info.get("name", "")

        # ── 提取标题 ──
        title_de = ""
        h1 = main.find("h1")
        if h1:
            title_de = clean_text(h1.get_text())

        if not title_de:
            title_de = page_info.get("title_de", "Untitled Finanztip Page")

        # ── 提取正文 ──
        # 跳过导航/侧边栏/分享/底部推荐等
        summary_parts = []
        for el in main.find_all(["h2", "h3", "h4", "p", "li"]):
            # 跳过在 nav/footer 内的元素
            if el.find_parent("nav") or el.find_parent("footer") or el.find_parent("aside"):
                continue
            text = clean_text(el.get_text())
            if not text or len(text) < 5:
                continue
            # 跳过简短的导航文字
            if len(text) < 15 and text.lower() in ['zurück', 'weiter', 'mehr dazu', 'alle anzeigen', 'teilen']:
                continue
            # 跳过 cookie/分享相关
            if any(x in text.lower() for x in ['cookie', 'zustimmung', 'einwilligung', 'teilen', 'facebook', 'twitter']):
                continue
            summary_parts.append(text)

        if len(summary_parts) < 5:
            raw = clean_text(main.get_text())
            lines = [l.strip() for l in raw.split("\n") if len(l.strip()) > 10]
            summary_zh = "\n\n".join(lines)
        else:
            summary_zh = "\n\n".join(summary_parts)

        if len(summary_zh) < 300:
            print(f"  [WARN] 内容过短 ({len(summary_zh)} chars), 跳过: {url}")
            return None

        # ── 构建返回 ──
        service_key = url_to_service_key(url, prefix=self.SOURCE_PREFIX)
        slug = page_name or make_slug(title_de, url)

        category = self.CATEGORY_MAP.get(page_name, "其他")
        tags = self.TAG_MAP.get(page_name, [page_name])
        target_groups = self.GROUP_MAP.get(page_name, ["新移民"])

        entry = {
            "service_key": service_key,
            "slug": slug,
            "title_de": title_de,
            "title_zh": title_de,  # 占位，AI 提炼
            "summary_zh": summary_zh,
            "requirements_zh": [],
            "fees_zh": "",
            "duration_zh": "",
            "steps_zh": [],
            "source_url": url,
            "category": category,
            "tags": tags,
        }

        return entry


# ── Main ──

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Finanztip 消费者指南爬虫")
    parser.add_argument("--dry-run", action="store_true", help="仅打印，不写入 DB")
    args = parser.parse_args()

    scraper = FinanztipScraper(dry_run=args.dry_run)
    scraper.run()
