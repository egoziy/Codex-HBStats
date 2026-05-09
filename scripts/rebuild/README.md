# Rebuild pipeline — wipe & rebuild from raw archives

Designed to run **after** the raw archives are populated:

- `footystats_raw_*` (12 leagues × all seasons + match details)
- `apifootball_raw_*` (5 leagues × 2016+ + lineups/events/stats)
- `scraped_*` from IFA, Walla, Sport5, RSSSF

## Source priority (Hebrew-first canonical model)

| Field | 2016-2026 primary | Older fallback |
|---|---|---|
| Hebrew name (team / player) | IFA → Walla | transliterate from English |
| English name | API-Football → FootyStats | IFA |
| Logo / stadium | API-Football → FootyStats | — |
| Lineups | API-Football | IFA → FootyStats |
| Events: cards / subs | API-Football + IFA (UNION) | IFA → FootyStats |
| Events: goals + assists | FootyStats | API-Football |
| xG / advanced stats | FootyStats only | — |
| Live / predictions / odds | API-Football only | — |
| Score / fixture status | API-Football → FootyStats | IFA |
| Half-time score | IFA → Walla | FootyStats |
| Referee (Hebrew) | IFA | — |
| Playoff group + point deductions | IFA | — |
| Pre-2000 historical | RSSSF (transliterated, mapped to canonical teams) | — |

## Pipeline order (each step depends on previous)

```
00-wipe.js              # Truncate main tables; keep raw + users
10-seasons.js           # Normalize season names "YYYY/YY"
11-competitions.js      # 9 canonical competitions
20-teams.js             # FootyStats raw → canonical → enrich (IFA Hebrew, API-Football id, Walla)
21-team-aliases.js      # Build alias table for RSSSF historical → canonical mapping
30-players.js           # FootyStats raw → match IFA (Hebrew name + photo + birth) → Sport5
40-games.js             # API-Football raw + FootyStats raw + IFA scraped — UNION, dedupe
41-game-events.js       # FootyStats goals + IFA cards/subs (deduped by minute+player+type)
42-game-lineups.js      # API-Football → IFA fallback (jersey + position)
43-game-stats.js        # FootyStats stats (xG, possession, shots) per game
50-standings.js         # API-Football table + IFA playoff group + point adjustments
60-historical.js        # RSSSF: transliterate, map to canonical teams, insert into games/standings
70-validate.js          # Hebrew name coverage, no dupes, current standings sanity
```

## Running

```bash
node scripts/rebuild/00-wipe.js --confirm
node scripts/rebuild/10-seasons.js --apply
node scripts/rebuild/11-competitions.js --apply
# ...etc, each script can be re-run idempotently
```

Or all at once:
```bash
node scripts/rebuild/run-all.js --apply
```

Each script supports `--dry-run` (default) and `--apply`.
