/**
 * Matchday Runner — wraps scripts/matchday-update.js for the /admin UI.
 * Spawns the script and streams stdout so the UI can poll a live snapshot
 * of progress. Parses well-known marker lines ("→ Refreshing <Source>...")
 * to advance per-source step status.
 */

import { spawn } from 'child_process';
import path from 'path';

export type MatchdayOptions = {
  date: string;       // YYYY-MM-DD
  league: string;     // ipl | leumit | stateCup | totoCupAl | superCup | all
  skipApiFootball?: boolean;
  skipFootyStats?: boolean;
  skipIfa?: boolean;
  skipWalla?: boolean;
  skipMerge?: boolean;
  headful?: boolean;
};

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

type MatchdayStep = {
  key: string;
  label: string;
  status: StepStatus;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
};

type MatchdayState = {
  running: boolean;
  options: MatchdayOptions | null;
  startedAt: string | null;
  finishedAt: string | null;
  steps: MatchdayStep[];
  output: string;
  error: string | null;
};

const STEP_DEFINITIONS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'apifootball', label: 'API-Football — אירועים, הרכבים, סטטיסטיקה' },
  { key: 'footystats',  label: 'FootyStats — xG וסטטיסטיקות מתקדמות' },
  { key: 'ifa',         label: 'IFA (football.org.il) — אירועים, הרכבים, שופטים' },
  { key: 'walla',       label: 'Walla — תוצאות ומחציות' },
  { key: 'merge',       label: 'מיזוג סופי' },
];

// stdout marker → step key. Matchday-update.js prints these as section headers.
const STEP_MARKERS: ReadonlyArray<{ key: string; pattern: RegExp }> = [
  { key: 'apifootball', pattern: /→ Refreshing API-Football data/ },
  { key: 'footystats',  pattern: /→ Scraping FootyStats for/ },
  { key: 'ifa',         pattern: /→ Refreshing IFA details/ },
  { key: 'walla',       pattern: /→ Refreshing Walla games/ },
  { key: 'merge',       pattern: /→ Running enrichment merge/ },
];

const SKIP_MARKERS: ReadonlyArray<{ key: string; pattern: RegExp }> = [
  { key: 'apifootball', pattern: /\(skipping API-Football refresh\)/ },
  { key: 'footystats',  pattern: /\(skipping FootyStats scrape\)/ },
  { key: 'ifa',         pattern: /\(skipping IFA refresh\)/ },
  { key: 'walla',       pattern: /\(skipping Walla refresh\)/ },
  { key: 'merge',       pattern: /\(skipping enrichment merge\)/ },
];

let state: MatchdayState = {
  running: false,
  options: null,
  startedAt: null,
  finishedAt: null,
  steps: [],
  output: '',
  error: null,
};

export function getMatchdayStatus(): MatchdayState {
  return { ...state, steps: state.steps.map((s) => ({ ...s })) };
}

function buildArgs(opts: MatchdayOptions): string[] {
  const a = ['--date', opts.date, '--league', opts.league];
  if (opts.skipApiFootball) a.push('--no-apifootball');
  if (opts.skipFootyStats)  a.push('--no-footystats');
  if (opts.skipIfa)         a.push('--no-ifa');
  if (opts.skipWalla)       a.push('--no-walla');
  if (opts.skipMerge)       a.push('--no-merge');
  if (opts.headful)         a.push('--headful');
  return a;
}

function findStepByKey(key: string): MatchdayStep | undefined {
  return state.steps.find((s) => s.key === key);
}

function markStepRunning(key: string) {
  // mark previously-running step done (since output advances sequentially)
  for (const s of state.steps) {
    if (s.status === 'running') {
      s.status = 'done';
      s.finishedAt = new Date().toISOString();
    }
  }
  const step = findStepByKey(key);
  if (step && step.status === 'pending') {
    step.status = 'running';
    step.startedAt = new Date().toISOString();
  }
}

function markStepSkipped(key: string) {
  const step = findStepByKey(key);
  if (step && step.status === 'pending') {
    step.status = 'skipped';
  }
}

function processStdoutChunk(chunk: string) {
  state.output += chunk;
  for (const line of chunk.split('\n')) {
    for (const m of STEP_MARKERS) {
      if (m.pattern.test(line)) markStepRunning(m.key);
    }
    for (const m of SKIP_MARKERS) {
      if (m.pattern.test(line)) markStepSkipped(m.key);
    }
  }
}

export async function runMatchdayUpdate(opts: MatchdayOptions): Promise<void> {
  state = {
    running: true,
    options: opts,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: STEP_DEFINITIONS.map((s) => ({ ...s, status: 'pending' })),
    output: '',
    error: null,
  };

  // Pre-mark steps the user explicitly asked to skip
  if (opts.skipApiFootball) markStepSkipped('apifootball');
  if (opts.skipFootyStats)  markStepSkipped('footystats');
  if (opts.skipIfa)         markStepSkipped('ifa');
  if (opts.skipWalla)       markStepSkipped('walla');
  if (opts.skipMerge)       markStepSkipped('merge');

  const args = buildArgs(opts);
  const child = spawn('node', ['scripts/matchday-update.js', ...args], {
    cwd: path.resolve(process.cwd()),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (b: Buffer) => processStdoutChunk(b.toString('utf-8')));
  child.stderr.on('data', (b: Buffer) => processStdoutChunk(b.toString('utf-8')));

  await new Promise<void>((resolve) => {
    child.on('close', (code) => {
      // Close any remaining running step
      for (const s of state.steps) {
        if (s.status === 'running') {
          s.status = code === 0 ? 'done' : 'error';
          s.finishedAt = new Date().toISOString();
        }
      }
      if (code !== 0) {
        state.error = `matchday-update exited with code ${code}`;
        // Mark any still-pending steps as error if the run aborted partway
        for (const s of state.steps) {
          if (s.status === 'pending') {
            s.status = 'error';
            s.error = 'aborted';
          }
        }
      }
      state.running = false;
      state.finishedAt = new Date().toISOString();
      resolve();
    });
  });
}
