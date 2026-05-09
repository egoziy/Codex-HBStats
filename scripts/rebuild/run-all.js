#!/usr/bin/env node
/**
 * run-all.js — Execute the full rebuild pipeline in order.
 *
 * Usage:
 *   node scripts/rebuild/run-all.js              # dry-run (each step)
 *   node scripts/rebuild/run-all.js --apply
 *   node scripts/rebuild/run-all.js --apply --skip-wipe
 */

'use strict';
const { spawn } = require('child_process');
const path = require('path');

const APPLY = process.argv.includes('--apply');
const SKIP_WIPE = process.argv.includes('--skip-wipe');

const STEPS = [
  ...(SKIP_WIPE ? [] : [{ file: '00-wipe.js', flag: '--confirm' }]),
  { file: '10-seasons.js' },
  { file: '11-competitions.js' },
  { file: '20-teams.js' },
  { file: '30-players.js' },
  { file: '40-games.js' },
  { file: '41-game-events.js' },
  { file: '42-game-lineups.js' },
  { file: '50-standings.js' },
];

function runStep(file, extraFlag) {
  return new Promise((resolve, reject) => {
    const args = [path.join(__dirname, file)];
    if (APPLY) args.push(extraFlag || '--apply');
    console.log(`\n══════ ${file} ══════`);
    const p = spawn('node', args, { stdio: 'inherit' });
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited with code ${code}`)));
  });
}

async function main() {
  for (const step of STEPS) {
    await runStep(step.file, step.flag);
  }
  console.log('\n✓ Pipeline complete.');
}

main().catch((e) => { console.error('PIPELINE FAILED:', e.message); process.exit(1); });
