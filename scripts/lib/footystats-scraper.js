/**
 * footystats-scraper.js — shared scraping helpers for FootyStats match pages.
 * Returns a payload shaped like FootyStatsRawMatch.payload.data so the merge
 * pipeline (43-footystats-enrichment.js) can read either source.
 */

'use strict';
const { connect } = require('puppeteer-real-browser');

const STAT_LABELS = {
  // label-on-page → key in scraped payload (chosen to mirror API field names)
  'xG':                 'team_x_xg',
  'Possession':         'team_x_possession',
  'Shots':              'team_x_shots',
  'Shots on Target':    'team_x_shotsOnTarget',
  'Shots Off Target':   'team_x_shotsOffTarget',
  'Shots Blocked':      'team_x_shotsBlocked',
  'Corners':            'team_x_corners',
  'Offsides':           'team_x_offsides',
  'Fouls':              'team_x_fouls',
  'Yellow Cards':       'team_x_yellow_cards',
  'Red Cards':          'team_x_red_cards',
  'Throw Ins':          'team_x_throwins',
  'Goal Attempts':      'team_x_attacks',
  'Dangerous Attacks':  'team_x_dangerous_attacks',
};

async function launchBrowser({ headful = false } = {}) {
  return connect({
    headless: !headful,
    turnstile: true,
    args: ['--lang=en-US,en'],
    customConfig: {},
    connectOption: {},
    disableXvfb: false,
  });
}

async function waitForRealPage(page, maxWaitMs = 60000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const t = await page.title().catch(() => '');
    if (!/just a moment|attention required|cloudflare/i.test(t)) return true;
    await new Promise((r) => setTimeout(r, 2500));
  }
  return false;
}

async function extractStats(page) {
  return page.evaluate((labels) => {
    function parseNum(s) {
      if (s == null) return null;
      const n = parseFloat(String(s).replace('%', '').replace(',', '.'));
      return Number.isFinite(n) ? n : null;
    }
    const allEls = Array.from(document.querySelectorAll('div, tr, li, p, span, td'));
    const isNumericLeaf = (el) => {
      if (!el) return null;
      const t = (el.innerText || el.textContent || '').trim();
      if (!/^\d+(\.\d+)?%?$/.test(t)) return null;
      return parseNum(t);
    };

    // For a label element, try to find exactly two numeric values in its row.
    // The page may use one of three layouts:
    //   (1) [home_num] [label] [away_num]   — siblings on each side
    //   (2) [label] [home_num] [away_num]   — both nums after the label
    //   (3) row container with children = [label, home_num, away_num] in any order
    function pluckNumbers(labelEl) {
      // Pattern 1: previous + next siblings
      const prev = isNumericLeaf(labelEl.previousElementSibling);
      const next = isNumericLeaf(labelEl.nextElementSibling);
      if (prev != null && next != null) return [prev, next];

      // Pattern 2: next two siblings are both numeric
      const next2 = isNumericLeaf(labelEl.nextElementSibling && labelEl.nextElementSibling.nextElementSibling);
      if (next != null && next2 != null) return [next, next2];

      // Pattern 3: walk up to a small container (≤6 numeric children), take first two
      let row = labelEl.parentElement;
      for (let depth = 0; depth < 4 && row; depth++) {
        const kids = Array.from(row.children || []);
        const nums = kids.map(isNumericLeaf).filter((v) => v != null);
        if (nums.length === 2) return nums;
        // Allow 3 numbers if one is the round/percentage trailer; take first two
        if (nums.length === 3 && kids.length <= 8) return [nums[0], nums[1]];
        row = row.parentElement;
      }
      return null;
    }

    const out = {};
    for (const [label, keyTpl] of Object.entries(labels)) {
      const homeKey = keyTpl.replace('team_x_', 'team_a_');
      const awayKey = keyTpl.replace('team_x_', 'team_b_');
      if (out[homeKey] != null) continue;
      const candidates = allEls.filter((el) => {
        const t = (el.innerText || el.textContent || '').trim();
        return t === label;
      });
      for (const labelEl of candidates) {
        const pair = pluckNumbers(labelEl);
        if (pair) { out[homeKey] = pair[0]; out[awayKey] = pair[1]; break; }
      }
    }
    return out;
  }, STAT_LABELS);
}

async function clickTabIfPresent(page, labelText) {
  // Click a tab with this text; return true if found
  return page.evaluate((label) => {
    const els = Array.from(document.querySelectorAll('a, button, span, div, li'));
    const tab = els.find((el) => (el.innerText || '').trim() === label && el.offsetWidth > 0 && el.offsetHeight > 0);
    if (!tab) return false;
    tab.click();
    return true;
  }, labelText);
}

async function waitForStatsPanel(page, maxWaitMs = 15000) {
  // Stats are JS-rendered after the initial paint. Wait for a label like "xG" or
  // "Possession" to appear in the DOM as a leaf element.
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const ready = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div, tr, li, p, span, td'));
      return els.some((el) => {
        const t = (el.innerText || el.textContent || '').trim();
        if (t !== 'xG' && t !== 'Possession') return false;
        // Confirm a numeric sibling — proves the row is hydrated
        const sib = el.previousElementSibling || el.nextElementSibling;
        return sib && /^\d/.test((sib.innerText || sib.textContent || '').trim());
      });
    }).catch(() => false);
    if (ready) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function scrapeMatchUrl(page, url, opts = {}) {
  const debug = !!opts.debug;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const ok = await waitForRealPage(page);
  if (!ok) throw new Error('Cloudflare did not clear');

  // Match the POC exactly: just sleep 4s and extract, no scroll.
  await new Promise((r) => setTimeout(r, 4000));

  if (debug) {
    const probe = await page.evaluate(() => {
      const els = Array.from(document.querySelectorAll('div, span, td, li'));
      const xgLabels = els.filter((el) => (el.textContent || '').trim() === 'xG');
      return {
        bodyLen: (document.body.innerText || '').length,
        xgLabelCount: xgLabels.length,
        firstXgRow: xgLabels[0] ? (xgLabels[0].parentElement && xgLabels[0].parentElement.innerText.slice(0, 200)) : null,
      };
    });
    console.error(`    [debug] bodyLen=${probe.bodyLen} xgLabels=${probe.xgLabelCount} firstXgRow=${JSON.stringify(probe.firstXgRow)}`);
  }

  let stats = await extractStats(page);

  // Cards tab — captures yellow/red cards
  if (await clickTabIfPresent(page, 'Cards')) {
    await new Promise((r) => setTimeout(r, 1500));
    const more = await extractStats(page);
    stats = { ...stats, ...more };
  }

  // Half tab — half-time stats (HT goals, half cards, half corners)
  if (await clickTabIfPresent(page, 'Half')) {
    await new Promise((r) => setTimeout(r, 1500));
    const more = await extractStats(page);
    stats = { ...stats, ...more };
  }

  // Page meta
  const meta = await page.evaluate(() => {
    const titleMatch = (document.title || '').match(/^(.*?)\s+vs\s+(.*?)\s+Stats/i);
    return {
      pageTitle: document.title,
      home_name: titleMatch ? titleMatch[1].trim() : null,
      away_name: titleMatch ? titleMatch[2].trim() : null,
      url: location.href,
    };
  });

  return { ...stats, ...meta };
}

module.exports = { launchBrowser, scrapeMatchUrl, STAT_LABELS };
