/**
 * flashscore-scraper.js — shared helpers for scraping Flashscore.
 * Uses puppeteer-core against system Chrome (CHROME_PATH).
 *
 * URL patterns (verified 2026-05):
 *   League:        /football/israel/ligat-ha-al/{results,fixtures,standings}/
 *   Match:         /match/football/{home-slug-key}/{away-slug-key}/?mid={key}
 *   Match stats:   …/summary/stats/?mid={key}
 *   Match lineups: …/summary/lineups/?mid={key}
 *   Team:          /team/{slug}/{key}/
 *   Team squad:    /team/{slug}/{key}/squad/
 *   Team xfers:    /team/{slug}/{key}/transfers/
 *   Player:        /player/{slug}/{key}/
 *
 * Polite pacing built in. No Cloudflare challenge observed.
 */

'use strict';

const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME_PATH =
  process.env.CHROME_PATH ||
  (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : path.join('C:', 'Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'));

const FLASHSCORE_ORIGIN = 'https://www.flashscore.com';
const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function launchBrowser({ headful = false } = {}) {
  return puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: headful ? false : 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--lang=en-US,en',
    ],
    defaultViewport: { width: 1366, height: 900 },
  });
}

async function newPage(browser, { blockAssets = true } = {}) {
  const page = await browser.newPage();
  await page.setUserAgent(DEFAULT_UA);
  await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-US,en;q=0.9' });
  if (blockAssets) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const t = req.resourceType();
      if (t === 'image' || t === 'media' || t === 'font') return req.abort();
      return req.continue();
    });
  }
  return page;
}

async function gotoAndSettle(page, url, { settleMs = 3000, timeout = 45000 } = {}) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout });
  await sleep(settleMs);
}

/** Parse a Flashscore team URL like /team/h-beer-sheva/EXAD1YZP/ → { slug, key, teamKey }. */
function parseTeamUrl(url) {
  const m = String(url).match(/\/team\/([a-z0-9-]+)\/([A-Za-z0-9]{6,})\/?/i);
  if (!m) return null;
  return { slug: m[1], key: m[2], teamKey: `${m[1]}-${m[2]}` };
}

/** Parse a match URL: returns { matchKey, homeSlugKey, awaySlugKey }. */
function parseMatchUrl(url) {
  const u = String(url);
  const mid = u.match(/[?&]mid=([A-Za-z0-9]{8})/);
  const path = u.match(/\/match\/football\/([a-z0-9-]+)\/([a-z0-9-]+)/i);
  return {
    matchKey: mid ? mid[1] : null,
    homeSlugKey: path ? path[1] : null,
    awaySlugKey: path ? path[2] : null,
  };
}

/** Parse a player URL like /player/blorian-or/K8ECARcG/ → { slug, key, playerKey }. */
function parsePlayerUrl(url) {
  const m = String(url).match(/\/player\/([a-z0-9-]+)\/([A-Za-z0-9]{6,})\/?/i);
  if (!m) return null;
  return { slug: m[1], key: m[2], playerKey: m[2] };
}

/** Convert a Flashscore-rendered "DD.MM. HH:MM" or "DD.MM.YYYY HH:MM" to UTC Date.
 *  Year defaults to current season's start when missing.
 */
function parseKickoff(text, fallbackYear) {
  if (!text) return null;
  const m1 = String(text).match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})/);
  if (m1) {
    const [, dd, mm, yyyy, hh, min] = m1;
    return new Date(`${yyyy}-${mm}-${dd}T${hh.padStart(2, '0')}:${min}:00Z`);
  }
  const m2 = String(text).match(/(\d{2})\.(\d{2})\.\s+(\d{1,2}):(\d{2})/);
  if (m2 && fallbackYear) {
    const [, dd, mm, hh, min] = m2;
    return new Date(`${fallbackYear}-${mm}-${dd}T${hh.padStart(2, '0')}:${min}:00Z`);
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Click the consent banner if it appears. */
async function dismissConsent(page) {
  try {
    await page.evaluate(() => {
      const btn = Array.from(document.querySelectorAll('button')).find((b) =>
        /agree|accept|consent/i.test((b.innerText || '').trim()),
      );
      if (btn) btn.click();
    });
  } catch {}
}

module.exports = {
  FLASHSCORE_ORIGIN,
  launchBrowser,
  newPage,
  gotoAndSettle,
  dismissConsent,
  parseTeamUrl,
  parseMatchUrl,
  parsePlayerUrl,
  parseKickoff,
  sleep,
};
