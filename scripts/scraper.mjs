/**
 * 德国政府新闻爬虫 - 支持静态页面(curl)和JS渲染页面(playwright)
 * 用法: node scripts/scraper.mjs [--state=mv] [--limit=5]
 */

import { chromium } from 'playwright';
import { setTimeout } from 'timers/promises';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ─── 配置 ───────────────────────────────────────────────
const RATE_LIMIT_DELAY_MS = 5000; // 两次请求间隔 5 秒，避免冲撞服务器
const REQUEST_TIMEOUT_MS = 15000;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ─── 各州配置 ───────────────────────────────────────────
const STATE_CONFIGS = {
  'mecklenburg-vorpommern': {
    name: 'Mecklenburg-Vorpommern',
    listUrl: 'https://www.regierung-mv.de/Aktuell/',
    renderJs: true,  // JS 渲染，必须用 playwright
    // 从列表页提取详情链接的正则
    listSelector: 'h3 a[href*="processor=processor.sa.pressemitteilung"]',
    // 从详情页提取内容 - 等正文出现后再提取
    getDetailData: async (page) => {
      // 等主要内容出现（最多等5秒）
      try {
        await page.waitForSelector('h1', { timeout: 5000 });
      } catch {}
      
      return await page.evaluate(() => {
        // 找 main 或 article 元素
        const main = document.querySelector('main') || document.querySelector('article') || document.body;
        // 找有实际文字内容的段落（排除太短的）
        const paragraphs = main.querySelectorAll('p');
        const texts = [...paragraphs]
          .map(p => p.textContent.trim())
          .filter(t => t.length > 50 && !t.includes('cookie') && !t.includes('Datenschutz'));
        
        const heading = document.querySelector('h1')?.textContent?.trim() || '';
        const subheading = document.querySelector('h2')?.textContent?.trim() || '';
        
        // 日期：尝试从 meta 或面包屑提取
        const dateEl = document.querySelector('time') || document.querySelector('[class*="date"]') || 
                       document.querySelector('meta[name="date"]');
        const date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
        
        return {
          title: heading,
          subtitle: subheading,
          date,
          paragraphs: texts,
          fullText: texts.join('\n\n'),
        };
      });
    },
  },
  'sachsen': {
    name: 'Sachsen',
    listUrl: 'https://www.medienservice.sachsen.de/medien/',
    renderJs: true,
    listSelector: 'a[href*="/medien/news/"]',
    getDetailData: async (page) => {
      try { await page.waitForSelector('h1', { timeout: 5000 }); } catch {}
      return await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const paragraphs = main.querySelectorAll('p');
        const texts = [...paragraphs]
          .map(p => p.textContent.trim())
          .filter(t => t.length > 50 && !t.includes('cookie') && !t.includes('Datenschutz'));
        const heading = document.querySelector('h1')?.textContent?.trim() || '';
        const subheading = document.querySelector('h2, .subtitle, [class*="lead"]')?.textContent?.trim() || '';
        const dateEl = document.querySelector('time') || document.querySelector('[class*="date"]') || document.querySelector('meta[name="date"]');
        const date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
        return {
          title: heading,
          subtitle: subheading,
          date,
          paragraphs: texts,
          fullText: texts.join('\n\n'),
        };
      });
    },
  },
  'hamburg': {
    name: 'Hamburg',
    listUrl: 'https://www.hamburg.de/politik-und-verwaltung/senat/presseservice-des-senats/',
    renderJs: true,
    // Hamburg 文章: /presseservice/pressemeldungen/[标题-数字ID]
    // category页: /presseservice/pressemeldungen（末尾无内容）
    listSelector: 'a[href*="/presseservice/pressemeldungen/"]',
    getDetailData: async (page) => {
      try { await page.waitForSelector('h1', { timeout: 5000 }); } catch {}
      return await page.evaluate(() => {
        const main = document.querySelector('main') || document.body;
        const paragraphs = main.querySelectorAll('p');
        const texts = [...paragraphs]
          .map(p => p.textContent.trim())
          .filter(t => t.length > 50 && !t.includes('cookie') && !t.includes('Datenschutz'));
        const heading = document.querySelector('h1')?.textContent?.trim() || '';
        const subheading = document.querySelector('h2')?.textContent?.trim() || '';
        const dateEl = document.querySelector('time') || document.querySelector('[class*="date"]');
        const date = dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : '';
        return {
          title: heading,
          subtitle: subheading,
          date,
          paragraphs: texts,
          fullText: texts.join('\n\n'),
        };
      });
    },
  },
  'thueringen': {
    name: 'Thüringen',
    listUrl: 'https://www.thueringen.de/presse/index.html',
    renderJs: false,  // 待测试
    curlOpts: ['-L', '--max-time', '15'],
  },
  // 更多州可以继续添加...
};

// ─── 工具函数 ────────────────────────────────────────────
async function delay(ms) {
  await setTimeout(ms);
}

function curl(url, extraOpts = []) {
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const args = ['-s', '--max-time', '15', '-A', USER_AGENT, ...extraOpts, url];
    const proc = spawn('curl', args);
    let stdout = '', stderr = '';
    proc.stdout.on('data', d => stdout += d);
    proc.stderr.on('data', d => stderr += d);
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`curl exited ${code}: ${stderr}`));
      else resolve(stdout);
    });
    proc.on('error', reject);
  });
}

async function fetchWithCurl(url, options = {}) {
  const { retry = 2, delayMs = 5000 } = options;
  for (let i = 0; i <= retry; i++) {
    try {
      await delay(i * delayMs); // 指数退避
      return await curl(url);
    } catch (e) {
      if (i === retry) throw e;
      console.warn(`curl 失败 (尝试 ${i+1}/${retry+1}): ${e.message}`);
    }
  }
}

// ─── Playwright 爬取 ────────────────────────────────────
async function fetchWithPlaywright(listUrl, listSelector, getDetailData, limit = 10) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: USER_AGENT,
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  
    // 拦截图片/CSS/媒体请求
  await page.route('**/*.{png,jpg,jpeg,gif,svg,ico,mp4,webm,mp3,css}', route => route.abort());
  
  const results = [];
  
  try {
    console.log(`[Playwright] 访问列表页: ${listUrl}`);
    await page.goto(listUrl, { waitUntil: 'networkidle', timeout: REQUEST_TIMEOUT_MS });
    
    // 关闭 cookie banner（如果出现）
    try {
      const cookieBtn = page.locator('button:has-text("abwählen"), button:has-text("akzeptieren"), [class*="cookie"]').first();
      if (await cookieBtn.isVisible({ timeout: 2000 })) {
        await cookieBtn.click();
        await page.waitForTimeout(500);
      }
    } catch {}
    
    await page.waitForTimeout(1000); // 额外等 JS
    
    // 提取详情链接（去重）
    const detailUrls = await page.evaluate((sel) => {
      const seen = new Set();
      return [...document.querySelectorAll(sel)]
        .map(a => ({ title: a.textContent.trim(), url: a.href }))
        .filter(item => {
          if (!item.url || seen.has(item.url)) return false;
          seen.add(item.url);
          return true;
        });
    }, listSelector);
    
    console.log(`找到 ${detailUrls.length} 个链接，限制 ${limit} 个`);
    const toScrape = detailUrls.slice(0, limit);
    
    for (const item of toScrape) {
      try {
        await delay(RATE_LIMIT_DELAY_MS);
        
        console.log(`  抓取: ${item.title.substring(0, 50)}...`);
        await page.goto(item.url, { waitUntil: 'networkidle', timeout: REQUEST_TIMEOUT_MS });
        await page.waitForTimeout(1500);
        
        const data = await getDetailData(page);
        results.push({
          ...item,
          ...data,
          scrapedAt: new Date().toISOString(),
        });
        
        console.log(`    ✓ 标题: ${data.title.substring(0, 60)}`);
      } catch (e) {
        console.warn(`  ✗ 失败: ${item.url} - ${e.message}`);
      }
    }
  } finally {
    await browser.close();
  }
  
  return results;
}

// ─── 静态页面爬取（curl）────────────────────────────────
async function fetchWithCurlPage(url, options = {}) {
  const html = await fetchWithCurl(url, { retry: 2, delayMs: 5000 });
  return parseStaticHtml(html);
}

function parseStaticHtml(html) {
  const cheerio = loadCheerio();
  const $ = cheerio.load(html);
  const title = $('h1, h2.title, [class*="title"]').first().text().trim();
  const paragraphs = $('p').map((_, el) => $(el).text().trim()).get().filter(t => t.length > 30);
  const dateMatch = html.match(/(\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4})/);
  return {
    title,
    paragraphs,
    fullText: paragraphs.join('\n\n'),
    date: dateMatch ? dateMatch[0] : '',
  };
}

// ─── 主函数 ─────────────────────────────────────────────
async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v];
    })
  );
  
  const targetState = args.state || 'mecklenburg-vorpommern';
  const limit = parseInt(args.limit || '5', 10);
  
  const config = STATE_CONFIGS[targetState];
  if (!config) {
    console.error(`未知州: ${targetState}`);
    console.error('可用州:', Object.keys(STATE_CONFIGS).join(', '));
    process.exit(1);
  }
  
  console.log(`\n═══════════════════════════════════════`);
  console.log(`开始爬取: ${config.name}`);
  console.log(`列表页: ${config.listUrl}`);
  console.log(`JS渲染: ${config.renderJs ? '是 (Playwright)' : '否 (curl)'}`);
  console.log(`═══════════════════════════════════════\n`);
  
  let results;
  
  if (config.renderJs) {
    results = await fetchWithPlaywright(
      config.listUrl,
      config.listSelector,
      config.getDetailData,
      limit
    );
  } else {
    // curl 方式 - 待实现
    console.log('curl 方式暂未实现，先用 Playwright 代替');
    results = await fetchWithPlaywright(config.listUrl, 'a[href]', () => ({}), limit);
  }
  
  // 输出结果
  console.log(`\n\n共抓取 ${results.length} 条新闻\n`);
  for (const r of results) {
    console.log(`━━━ ${r.title} ━━━`);
    console.log(`日期: ${r.date}`);
    console.log(`链接: ${r.url}`);
    console.log(`摘要: ${(r.fullText || '').substring(0, 200)}...`);
    console.log();
  }
  
  // 保存到文件
  const outPath = path.join(PROJECT_ROOT, `scraper_output_${targetState}.json`);
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`结果已保存: ${outPath}`);
}

// 动态加载 cheerio（避免在顶层 require）
function loadCheerio() {
  try {
    return require('cheerio');
  } catch {
    // cheerio 未安装，返回简单解析器
    return {
      load: (html) => ({
        find: () => ({ first: () => ({ text: () => '' }), map: () => ({ get: () => [] }) }),
        text: () => '',
      }),
    };
  }
}

main().catch(console.error);
