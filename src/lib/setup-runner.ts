/**
 * Full Data Setup Runner
 * Runs all scraping, merging, and normalization steps with progress tracking.
 * Designed to run in the background from an API call.
 */

import { execSync } from 'child_process';
import path from 'path';

export type SetupMode = 'full' | 'quick' | 'merge-only';

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

type SetupStep = {
  key: string;
  label: string;
  status: StepStatus;
  error?: string;
  durationMs?: number;
};

type SetupState = {
  running: boolean;
  mode: SetupMode | null;
  startedAt: string | null;
  finishedAt: string | null;
  currentStep: string | null;
  steps: SetupStep[];
  error: string | null;
};

// Global state (persists across requests in the same server process)
let state: SetupState = {
  running: false,
  mode: null,
  startedAt: null,
  finishedAt: null,
  currentStep: null,
  steps: [],
  error: null,
};

export function getSetupStatus(): SetupState {
  return { ...state, steps: [...state.steps] };
}

function runScript(command: string, timeoutMs = 600000): void {
  execSync(command, {
    cwd: path.resolve(process.cwd()),
    stdio: 'pipe',
    timeout: timeoutMs,
  });
}

function defineSteps(mode: SetupMode): SetupStep[] {
  const steps: SetupStep[] = [];

  if (mode !== 'merge-only') {
    steps.push(
      { key: 'scrape-walla', label: 'סריקת Walla: טבלאות + leaderboards', status: 'pending' },
      { key: 'scrape-walla-players', label: 'סריקת Walla: סטטיסטיקות שחקנים מלאות', status: 'pending' },
    );

    if (mode === 'full') {
      steps.push(
        { key: 'scrape-walla-games', label: 'סריקת Walla: תוצאות משחקים (Puppeteer)', status: 'pending' },
        { key: 'scrape-walla-advanced', label: 'סריקת Walla: סטטיסטיקות מתקדמות (Puppeteer)', status: 'pending' },
        { key: 'scrape-ifa-haal', label: 'סריקת IFA: ליגת העל (Puppeteer)', status: 'pending' },
        { key: 'scrape-ifa-leumit', label: 'סריקת IFA: ליגה לאומית (Puppeteer)', status: 'pending' },
        { key: 'scrape-sport5', label: 'סריקת Sport5: קבוצות + שחקנים', status: 'pending' },
      );
    }
  }

  steps.push(
    { key: 'merge-standings', label: 'מיזוג טבלאות → Season + Team + Standing', status: 'pending' },
  );

  if (mode !== 'quick') {
    steps.push(
      { key: 'merge-games', label: 'מיזוג משחקים → Game', status: 'pending' },
      { key: 'merge-leaderboards', label: 'מיזוג leaderboards → CompetitionLeaderboardEntry', status: 'pending' },
    );
  }

  steps.push(
    { key: 'build-rosters', label: 'בניית סגלים → Player + PlayerStatistics', status: 'pending' },
    { key: 'transliterate', label: 'תעתיק שמות שחקנים לעברית', status: 'pending' },
  );

  if (mode === 'full') {
    steps.push(
      { key: 'backfill-canonical', label: 'איחוד שחקנים כפולים', status: 'pending' },
    );
  }

  return steps;
}

const STEP_COMMANDS: Record<string, string> = {
  'scrape-walla': 'node scripts/scrape-walla.js',
  'scrape-walla-players': 'node scripts/scrape-walla-player-stats.js',
  'scrape-walla-games': 'node scripts/scrape-walla-games.js',
  'scrape-walla-advanced': 'node scripts/scrape-walla-advanced-puppeteer.js',
  'scrape-ifa-haal': 'node scripts/scrape-ifa.js --league 40 --from 2 --to 27',
  'scrape-ifa-leumit': 'node scripts/scrape-ifa.js --league 45 --from 2 --to 27',
  'scrape-sport5': 'node scripts/scrape-all-sport5.js',
  'merge-standings': 'node scripts/merge-walla-standings.js',
  'merge-games': 'node scripts/merge-walla-games.js',
  'merge-leaderboards': 'node scripts/merge-walla-leaderboards.js',
  'build-rosters': 'node scripts/build-rosters-from-leaderboards.js',
  'transliterate': 'node scripts/transliterate-players.js --all --apply',
  'backfill-canonical': 'node scripts/backfill_canonical_players.js',
};

export async function runFullSetup(mode: SetupMode): Promise<void> {
  state = {
    running: true,
    mode,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    currentStep: null,
    steps: defineSteps(mode),
    error: null,
  };

  for (const step of state.steps) {
    const command = STEP_COMMANDS[step.key];
    if (!command) {
      step.status = 'skipped';
      continue;
    }

    state.currentStep = step.key;
    step.status = 'running';
    const stepStart = Date.now();

    try {
      runScript(command);
      step.status = 'done';
      step.durationMs = Date.now() - stepStart;
    } catch (e: any) {
      step.status = 'error';
      step.error = e.message?.slice(0, 200) || 'Unknown error';
      step.durationMs = Date.now() - stepStart;
      // Continue to next step even on error
    }
  }

  state.running = false;
  state.currentStep = null;
  state.finishedAt = new Date().toISOString();
}
