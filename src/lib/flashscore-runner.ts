/**
 * Flashscore Runner — wraps the 4 scrape scripts + the merge for the
 * /admin/flashscore UI. Spawns each script sequentially and exposes a
 * polling-friendly status object with per-step state and the live log.
 */

import { spawn } from 'child_process';
import path from 'path';

export type FlashscoreOptions = {
  leagueSlug: string;   // e.g. "ligat-ha-al"
  season: string;       // e.g. "2025-2026"
  skipFixtures?: boolean;
  skipTeams?: boolean;
  skipMatches?: boolean;
  skipPlayers?: boolean;
  skipMerge?: boolean;
  headful?: boolean;
};

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

type FlashscoreStep = {
  key: string;
  label: string;
  status: StepStatus;
  error?: string;
  startedAt?: string;
  finishedAt?: string;
};

type FlashscoreState = {
  running: boolean;
  options: FlashscoreOptions | null;
  startedAt: string | null;
  finishedAt: string | null;
  steps: FlashscoreStep[];
  output: string;
  error: string | null;
};

const STEPS: ReadonlyArray<{ key: keyof FlashscoreOptions | 'merge' | 'fixtures' | 'teams' | 'matches' | 'players'; label: string }> = [
  { key: 'fixtures', label: 'משחקים — רשימת מחזורים' },
  { key: 'teams',    label: 'קבוצות — סגלים והעברות' },
  { key: 'matches',  label: 'משחקים — xG, אירועים, הרכבים' },
  { key: 'players',  label: 'שחקנים — פרופיל, שווי שוק, חוזה, קריירה' },
  { key: 'merge',    label: 'מיזוג ל-DB הראשי' },
];

let state: FlashscoreState = {
  running: false,
  options: null,
  startedAt: null,
  finishedAt: null,
  steps: [],
  output: '',
  error: null,
};

export function getFlashscoreStatus(): FlashscoreState {
  return { ...state, steps: state.steps.map((s) => ({ ...s })) };
}

function appendOutput(text: string) {
  state.output += text;
  // Cap log buffer to last 200KB so memory doesn't grow unbounded on long runs.
  if (state.output.length > 200_000) state.output = state.output.slice(-200_000);
}

async function runScript(scriptPath: string, args: string[]): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath, ...args], {
      cwd: path.resolve(process.cwd()),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (b: Buffer) => appendOutput(b.toString('utf-8')));
    child.stderr.on('data', (b: Buffer) => appendOutput(b.toString('utf-8')));
    child.on('close', (code) => resolve(code ?? 0));
  });
}

function setStepStatus(key: string, status: StepStatus, error?: string) {
  const step = state.steps.find((s) => s.key === key);
  if (!step) return;
  step.status = status;
  if (error) step.error = error;
  if (status === 'running') step.startedAt = new Date().toISOString();
  if (status === 'done' || status === 'error' || status === 'skipped') {
    step.finishedAt = new Date().toISOString();
  }
}

export async function runFlashscoreImport(opts: FlashscoreOptions): Promise<void> {
  state = {
    running: true,
    options: opts,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: STEPS.map((s) => ({ key: s.key as string, label: s.label, status: 'pending' })),
    output: '',
    error: null,
  };
  if (opts.skipFixtures) setStepStatus('fixtures', 'skipped');
  if (opts.skipTeams)    setStepStatus('teams', 'skipped');
  if (opts.skipMatches)  setStepStatus('matches', 'skipped');
  if (opts.skipPlayers)  setStepStatus('players', 'skipped');
  if (opts.skipMerge)    setStepStatus('merge', 'skipped');

  appendOutput(`\n=== Flashscore import: ${opts.leagueSlug} / ${opts.season} ===\n`);

  const baseArgs = ['--league-slug', opts.leagueSlug, '--season', opts.season];
  if (opts.headful) baseArgs.push('--headful');

  try {
    if (!opts.skipFixtures) {
      setStepStatus('fixtures', 'running');
      const code = await runScript('scripts/scrape-flashscore-fixtures.js', baseArgs);
      setStepStatus('fixtures', code === 0 ? 'done' : 'error', code === 0 ? undefined : `exit ${code}`);
    }
    if (!opts.skipTeams) {
      setStepStatus('teams', 'running');
      const code = await runScript('scripts/scrape-flashscore-team.js', ['--season', opts.season, '--all-in-league', ...(opts.headful ? ['--headful'] : [])]);
      setStepStatus('teams', code === 0 ? 'done' : 'error', code === 0 ? undefined : `exit ${code}`);
    }
    if (!opts.skipMatches) {
      setStepStatus('matches', 'running');
      const code = await runScript('scripts/scrape-flashscore-match.js', ['--all-missing', '--limit', '500', ...(opts.headful ? ['--headful'] : [])]);
      setStepStatus('matches', code === 0 ? 'done' : 'error', code === 0 ? undefined : `exit ${code}`);
    }
    if (!opts.skipPlayers) {
      setStepStatus('players', 'running');
      const code = await runScript('scripts/scrape-flashscore-player.js', ['--all-in-league', ...(opts.headful ? ['--headful'] : [])]);
      setStepStatus('players', code === 0 ? 'done' : 'error', code === 0 ? undefined : `exit ${code}`);
    }
    if (!opts.skipMerge) {
      setStepStatus('merge', 'running');
      const code = await runScript('scripts/rebuild/44-flashscore-enrichment.js', ['--apply']);
      setStepStatus('merge', code === 0 ? 'done' : 'error', code === 0 ? undefined : `exit ${code}`);
    }
  } catch (e) {
    state.error = e instanceof Error ? e.message : String(e);
  } finally {
    state.running = false;
    state.finishedAt = new Date().toISOString();
  }
}

// Merge-only runner — useful when scraping is already done and the user just
// wants to re-run the merge after fixing aliases or after API-Football refresh.
export async function runFlashscoreMergeOnly(): Promise<void> {
  state = {
    running: true,
    options: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    steps: [{ key: 'merge', label: 'מיזוג ל-DB הראשי', status: 'pending' }],
    output: '',
    error: null,
  };
  setStepStatus('merge', 'running');
  const code = await runScript('scripts/rebuild/44-flashscore-enrichment.js', ['--apply']);
  setStepStatus('merge', code === 0 ? 'done' : 'error', code === 0 ? undefined : `exit ${code}`);
  state.running = false;
  state.finishedAt = new Date().toISOString();
}
