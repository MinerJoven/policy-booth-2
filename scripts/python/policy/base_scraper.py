#!/usr/bin/env python3
"""
政策展台 2.0 — 政策采集基类
所有来源 scraper 继承此类
"""
import os
import sys
import json
import hashlib
import time
import re
from typing import Any

import httpx
from bs4 import BeautifulSoup

# ── Project Path ──
PROJECT_DIR = "/home/joven/policy-booth-2"
sys.path.insert(0, os.path.join(PROJECT_DIR, "scripts", "python"))

# ── Supabase Helpers (复用已有逻辑) ──

def get_supabase_client():
    """创建 supabase 客户端"""
    from supabase import create_client, Client
    from dotenv import load_dotenv
    load_dotenv(os.path.join(PROJECT_DIR, ".env"), override=True)

    url = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return create_client(url, key)


# ── HTTP Client ──

HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
}

client = httpx.Client(headers=HEADERS, follow_redirects=True, timeout=30.0)


# ── ETag Cache (从 DB 读取/写入) ──

ETAG_TABLE = "policy_scraper_etags"  # 存储 ETag 的小表

def get_etags(supabase) -> dict[str, str]:
    """从 DB 读取所有已存储的 ETag"""
    try:
        resp = supabase.table(ETAG_TABLE).select("*").execute()
        return {r["url"]: r["etag"] for r in (resp.data or [])}
    except Exception:
        return {}

def save_etags(supabase, etags: dict[str, str]):
    """批量 upsert ETag"""
    if not etags:
        return
    records = [{"url": url, "etag": etag} for url, etag in etags.items()]
    try:
        # 创建表（如不存在）
        supabase.table(ETAG_TABLE).upsert(records, on_conflict="url").execute()
    except Exception as e:
        print(f"  [WARN] ETag save failed: {e}")


# ── Fetch with ETag ──

def fetch_page(url: str, stored_etag: str | None = None) -> tuple[str | None, str | None, bool]:
    """
    抓取页面。返回 (html_text, new_etag, has_changed)
    如果 304 → (None, stored_etag, False)
    """
    headers = dict(HEADERS)
    if stored_etag:
        headers["If-None-Match"] = stored_etag

    try:
        resp = client.get(url, headers=headers)
        new_etag = resp.headers.get("ETag")

        if resp.status_code == 304:
            return None, stored_etag, False
        if resp.status_code != 200:
            print(f"  [WARN] HTTP {resp.status_code} for {url}")
            return None, stored_etag, False

        return resp.text, new_etag, True
    except Exception as e:
        print(f"  [ERROR] Failed to fetch {url}: {e}")
        return None, stored_etag, False


# ── HTML Extraction ──

def extract_text(html: str, selector: str) -> str:
    """从 HTML 中提取指定选择器的纯文本"""
    soup = BeautifulSoup(html, "html.parser")
    el = soup.select_one(selector)
    if not el:
        return ""
    text = el.get_text(separator="\n", strip=True)
    return clean_text(text)

def extract_all_text(html: str, selector: str) -> list[str]:
    """提取多个匹配元素的文本"""
    soup = BeautifulSoup(html, "html.parser")
    els = soup.select(selector)
    return [clean_text(el.get_text(separator="\n", strip=True)) for el in els]

def clean_text(text: str) -> str:
    """清理多余空白"""
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_links(html: str, selector: str, base_url: str = "") -> list[dict]:
    """提取链接列表: [{url, title, text}]"""
    soup = BeautifulSoup(html, "html.parser")
    results = []
    for a in soup.select(selector):
        href = a.get("href", "")
        if not href or href.startswith("#"):
            continue
        full_url = httpx.URL(href) if base_url else href
        results.append({
            "url": str(httpx.URL(base_url).join(href)) if base_url else href,
            "title": a.get("title", "") or a.get_text(strip=True),
            "text": a.get_text(strip=True),
        })
    return results

def make_content_hash(html: str) -> str:
    """生成内容指纹，用于变更检测"""
    # 去掉空白、脚本、样式后取 MD5
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "noscript"]):
        tag.decompose()
    clean = soup.get_text(strip=True)
    return hashlib.md5(clean.encode()).hexdigest()


# ── URL → service_key ──

def url_to_service_key(url: str, prefix: str = "") -> str:
    """从 URL 生成唯一 service_key"""
    raw = prefix + "_" + url.replace("https://", "").replace("http://", "")
    raw = re.sub(r'[^a-zA-Z0-9_]', '_', raw)
    raw = re.sub(r'_+', '_', raw)
    raw = raw.strip("_").lower()
    if len(raw) > 100:
        h = hashlib.md5(url.encode()).hexdigest()[:8]
        raw = raw[:80] + "_" + h
    return raw


# ── Slug ──

def make_slug(title_de: str, url: str) -> str:
    """生成 URL 友好的 slug"""
    h = hashlib.md5(url.encode()).hexdigest()[:6]
    slug = re.sub(r'[^a-z0-9]+', '-', title_de.lower().strip())
    slug = slug.strip("-")
    if len(slug) > 60:
        slug = slug[:60]
    return f"{slug}-{h}"


# ── DB Writers ──

def write_policy(supabase, entry: dict[str, Any]) -> bool:
    """写入一条政策到 policy_pages 表"""
    from supabase import Client
    try:
        resp = supabase.table("policy_pages").upsert(
            entry, on_conflict="service_key"
        ).execute()
        return True
    except Exception as e:
        print(f"  [ERROR] Write failed: {e}")
        return False

def batch_write(supabase, entries: list[dict], batch_size: int = 20):
    """批量写入 policy_pages"""
    total = 0
    for i in range(0, len(entries), batch_size):
        batch = entries[i:i+batch_size]
        try:
            supabase.table("policy_pages").upsert(
                batch, on_conflict="service_key"
            ).execute()
            total += len(batch)
        except Exception as e:
            print(f"  [ERROR] Batch {i//batch_size + 1} failed: {e}")
    return total


# ── Scraper Base ──

class BaseScraper:
    """所有来源爬虫的基类"""

    SOURCE_NAME: str = ""       # e.g. "BAMF（联邦移民局）"
    SOURCE_PREFIX: str = ""     # e.g. "bamf"
    PUBLISHER: str = ""         # e.g. "Bundesamt für Migration und Flüchtlinge (BAMF)"
    REGION_LEVEL: str = "联邦"
    REGION_NAME: str = "Deutschland"
    CATEGORY: str = "其他"

    def __init__(self, supabase=None, dry_run: bool = False):
        self.supabase = supabase or get_supabase_client()
        self.dry_run = dry_run
        self.etags: dict[str, str] = {}
        self.stats = {"fetched": 0, "changed": 0, "written": 0, "skipped": 0}

    def discover_urls(self) -> list[str]:
        """返回待抓取的 URL 列表—子类实现"""
        raise NotImplementedError

    def parse_page(self, url: str, html: str) -> dict | None:
        """解析单页，返回 policy_pages 格式的 dict—子类实现"""
        raise NotImplementedError

    def run(self):
        """主入口：发现 URL → 按 ETag 抓取 → 解析 → 写入 DB"""
        self.etags = get_etags(self.supabase)

        urls = self.discover_urls()
        print(f"[{self.SOURCE_NAME}] 发现 {len(urls)} 个页面")

        entries = []
        for url in urls:
            stored_etag = self.etags.get(url)
            html, new_etag, changed = fetch_page(url, stored_etag)

            self.stats["fetched"] += 1

            if not changed:
                self.stats["skipped"] += 1
                if self.dry_run:
                    print(f"  ⏭ {url[:60]} (未变化)")
                continue

            if not html:
                continue

            self.stats["changed"] += 1

            entry = self.parse_page(url, html)
            if not entry:
                continue

            # 填充通用字段
            entry.setdefault("source_url", url)
            entry.setdefault("source_name", self.SOURCE_NAME)
            entry.setdefault("publisher", self.PUBLISHER)
            entry.setdefault("region_level", self.REGION_LEVEL)
            entry.setdefault("region_name", self.REGION_NAME)
            entry.setdefault("category", self.CATEGORY)
            entry.setdefault("translated", False)
            entry.setdefault("last_fetched_at", time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))

            if self.dry_run:
                print(f"  📄 {entry.get('title_zh', url)[:60]}")
            else:
                if write_policy(self.supabase, entry):
                    self.stats["written"] += 1
                    # 更新 ETag
                    self.etags[url] = new_etag
                    print(f"  ✓ {entry.get('title_zh', url)[:60]}")

        # 保存 ETag
        if not self.dry_run:
            save_etags(self.supabase, self.etags)

        print(f"\n[{self.SOURCE_NAME}] 完成: "
              f"获取={self.stats['fetched']}, "
              f"变化={self.stats['changed']}, "
              f"写入={self.stats['written']}, "
              f"跳过(未变)={self.stats['skipped']}")
        return self.stats
