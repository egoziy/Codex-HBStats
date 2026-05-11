#!/usr/bin/env node
/**
 * scrape-footystats-match.js — POC: scrape a single FootyStats match page.
 *
 * The FootyStats API account is being terminated, so we replace it with HTML scraping.
 * Uses puppeteer-real-browser (custom Chromium build that defeats Cloudflare's CDP fingerprinting).
 *
 * Usage:
 *   node scripts/scrape-footystats-match.js                    # default test match
 *   node scripts/scrape-footystats-match.js --url /israel/...  # specific match path
 *   node scripts/scrape-footystats-match.js --headful          # show browser window
 */

'use strict';
const { connect } = require('puppeteer-real-browser');

const args = process.argv.slice(2);
const HEADFUL = args.includes('--headful');
const urlIdx = args.indexOf('--url');
const TEST_PATH = urlIdx >= 0 ? args[urlIdx + 1] : '/israel/hapoel-beer-sheva-fc-vs-hapoel-tel-aviv-fc-h2h-stats#8515940';
const FULL_URL = TEST_PATH.startsWith('http') ? TEST_PATH : `https://footystats.org${TEST_PATH}`;

async function main() {
  console.log(`→ Fetching ${FULL_URL}${HEADFUL ? '  (HEADFUL)' : ''}`);

  const { browser, page } = await connect({
    headless: !HEADFUL,
    turnstile: true, // auto-handle Cloudflare Turnstile checkbox
    args: ['--lang=en-US,en'],
    customConfig: {},
    connectOption: {},
    disableXvfb: false,
  });

  try {
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(FULL_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Wait for either real content or give up after 60s (turnstile=true should auto-solve)
    const start = Date.now();
    while (Date.now() - start < 60000) {
      const t = await page.title().catch(() => '');
      if (!/just a moment|attention required|cloudflare/i.test(t)) break;
      const left = Math.round(60 - (Date.now() - start) / 1000);
      process.stdout.write(`\r  …Cloudflare check (${left}s left)    `);
      await new Promise((r) => setTimeout(r, 2500));
    }
    process.stdout.write('\n');

    const title = await page.title();
    console.log(`  page title: ${title}`);

    const html = await page.content();
    if (/just a moment|attention required/i.test(html)) {
      console.error('  ✗ Cloudflare still blocking');
      await browser.close();
      process.exit(2);
    }

    // Settle JS-rendered content
    await new Promise((r) => setTimeout(r, 4000));

    const extracted = await page.evaluate(() => {
      // Walk every element in the DOM. For each one whose text exactly matches a
      // known stat label (or contains it as a strong/span), grab the closest row
      // ancestor and pull two numeric tokens (one before, one after).
      const STAT_LABELS = {
        'xG':                'xg',
        'Expected Goals':    'xg',
        'Possession':        'possession',
        'Shots':             'shots',
        'Shots on Target':   'shotsOnTarget',
        'Shots Off Target':  'shotsOffTarget',
        'Shots Blocked':     'shotsBlocked',
        'Corners':           'corners',
        'Offsides':          'offsides',
        'Fouls':             'fouls',
        'Yellow Cards':      'yellowCards',
        'Red Cards':         'redCards',
        'Throw Ins':         'throwIns',
        'Goal Attempts':     'attacks',
        'Dangerous Attacks': 'dangerousAttacks',
      };
      const out = {};

      function parseNum(s) {
        if (s == null) return null;
        const n = parseFloat(String(s).replace('%', '').replace(',', '.'));
        return Number.isFinite(n) ? n : null;
      }

      // Helper: from a row's text, find label and pluck the home/away numbers
      function tokensFromRow(rowText, label) {
        const cleaned = rowText.replace(/\s+/g, ' ').trim();
        const labelIdx = cleaned.toLowerCase().indexOf(label.toLowerCase());
        if (labelIdx < 0) return null;
        // Numbers immediately before and after the label
        const before = cleaned.slice(0, labelIdx).trim().match(/(\d+(?:\.\d+)?%?)\s*$/);
        const after = cleaned.slice(labelIdx + label.length).trim().match(/^(\d+(?:\.\d+)?%?)/);
        if (!before || !after) return null;
        return [parseNum(before[1]), parseNum(after[1])];
      }

      // Strategy: find leaf elements (no children with text) whose text is exactly the label.
      // Then check the immediate previous and next sibling for numeric values — that matches
      // FootyStats' stat-row layout: <home><label><away>.
      const allEls = Array.from(document.querySelectorAll('div, tr, li, p, span, td'));
      const numericText = (el) => {
        if (!el) return null;
        const t = (el.innerText || el.textContent || '').trim();
        if (!/^\d+(\.\d+)?%?$/.test(t)) return null;
        return parseNum(t);
      };
      for (const [label, key] of Object.entries(STAT_LABELS)) {
        if (out[key] != null) continue;
        const candidates = allEls.filter((el) => {
          const t = (el.innerText || el.textContent || '').trim();
          return t === label;
        });
        for (const labelEl of candidates) {
          const prev = numericText(labelEl.previousElementSibling);
          const next = numericText(labelEl.nextElementSibling);
          if (prev != null && next != null) { out[key] = { home: prev, away: next }; break; }
        }
      }

      // Fallback: regex over body text
      const text = document.body.innerText || '';
      function regexScan(pattern, key) {
        if (out[key]) return;
        const m = text.match(pattern);
        if (m) out[key] = { home: parseNum(m[1]), away: parseNum(m[2]) };
      }
      regexScan(/xG\s+([0-9.]+)\s+([0-9.]+)/, 'xg');
      regexScan(/Possession\s+(\d+%?)\s+(\d+%?)/, 'possession');
      regexScan(/Shots\s+(\d+)\s+(\d+)/, 'shots');
      regexScan(/Corners\s+(\d+)\s+(\d+)/, 'corners');
      regexScan(/Fouls\s+(\d+)\s+(\d+)/, 'fouls');
      regexScan(/Offsides\s+(\d+)\s+(\d+)/, 'offsides');
      regexScan(/Yellow Cards\s+(\d+)\s+(\d+)/, 'yellowCards');
      regexScan(/Red Cards\s+(\d+)\s+(\d+)/, 'redCards');

      return out;
    });

    console.log('\n=== Extraction result ===');
    console.log(JSON.stringify(extracted, null, 2));

    if (HEADFUL) {
      console.log('\n(Headful — leaving browser open 20s for inspection)');
      await new Promise((r) => setTimeout(r, 20000));
    }
  } catch (e) {
    console.error(`  ✗ ${e.message}`);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
