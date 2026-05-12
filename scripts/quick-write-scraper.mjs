/**
 * 快速写入 scraper 输出到 Supabase（绕过 MiniMax 过滤，直接写 draft）
 * 用法: node scripts/quick-write-scraper.mjs [--state=mv]
 */
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// 读取 .env.local
const env = {};
fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8')
  .split('\n')
  .filter(l => l.includes('='))
  .forEach(l => {
    const [k, ...v] = l.split('=');
    env[k.trim()] = v.join('=').trim();
  });

const supabase = createClient(
  'https://naxlnlokfbfzqnswxmag.supabase.co',
  env.SUPABASE_SECRET_KEY
);

function makeSlug(title, url) {
  const base = (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, '')  // 保留中文
    .replace(/\s+/g, '-')
    .substring(0, 50);
  const urlPart = (url || '').replace(/https?:\/\//, '').replace(/\//g, '-').substring(0, 30);
  const hash = createHash('md5').update(url || title).digest('hex').substring(0, 8);
  return `${base}---${urlPart}---${hash}`;
}

// 州配置
const STATE_CONFIGS = {
  'mecklenburg-vorpommern': {
    regionName: 'Mecklenburg-Vorpommern',
    regionLevel: '州',
    publisher: 'Landesregierung Mecklenburg-Vorpommern',
    category: '州级政策',
    scraperFile: path.join(ROOT, 'scraper_output_mecklenburg-vorpommern.json'),
  },
  'sachsen': {
    regionName: 'Sachsen',
    regionLevel: '州',
    publisher: 'Landesregierung Sachsen',
    category: '州级政策',
    scraperFile: path.join(ROOT, 'scraper_output_sachsen.json'),
  },
};

async function main() {
  const args = Object.fromEntries(
    process.argv.slice(2).map(a => {
      const [k, v] = a.replace(/^--/, '').split('=');
      return [k, v || true];
    })
  );

  const state = args.state || 'mecklenburg-vorpommern';
  const config = STATE_CONFIGS[state];
  if (!config) {
    console.error('未知州:', state);
    console.error('可用:', Object.keys(STATE_CONFIGS).join(', '));
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(config.scraperFile, 'utf8'));
  console.log(`读取 ${items.length} 条新闻 from ${config.scraperFile}`);

  const results = [];
  for (const item of items) {
    const body = {
      slug: makeSlug(item.title, item.url),
      title_de: item.title || '',
      title_zh: item.title || '', // 暂用原文
      summary_zh: (item.paragraphs || []).join('\n\n').substring(0, 500) || '',
      content_de_summary: (item.paragraphs || []).slice(0, 3).join('\n\n'),
      official_url: item.url || '',
      published_at: item.date || new Date().toISOString().split('T')[0],
      effective_at: item.date || null,
      region_level: config.regionLevel,
      region_name: config.regionName,
      category: config.category,
      publisher: config.publisher,
      status: 'draft',
      risk_level: 'medium',
      target_groups: ['待定'],
      key_changes: ['待官方确认'],
      user_notes: `来自 ${config.scraperFile} 抓取，标题需翻译审核`,
      content_zh: (item.paragraphs || []).join('\n\n'),
    };

    const { data, error } = await supabase
      .from('policy_booth_policies')
      .insert(body)
      .select('id')
      .single();

    if (error) {
      console.error(`  ✗ 写入失败: ${item.title?.substring(0, 50)} - ${error.message}`);
    } else {
      console.log(`  ✓ 写入: ${item.title?.substring(0, 60)}`);
      results.push(data.id);
    }

    await new Promise(r => setTimeout(r, 500)); // rate limit
  }

  console.log(`\n完成: ${results.length}/${items.length} 条写入 Supabase`);
}

main().catch(console.error);
