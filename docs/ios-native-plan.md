# Native iPhone App Plan

## Goal

Build a native iPhone app in `SwiftUI` for the HBS system, backed by the existing server through dedicated mobile APIs.

The app should feel fast, focused, and mobile-first, not like a wrapped website.

## Product Direction

### Platform

- iPhone only
- Native iOS app
- `SwiftUI`

### Backend Strategy

- Keep the current web/admin app as the content management and ingestion system
- Add dedicated `mobile API` endpoints for the iPhone app
- Return clean JSON shaped for mobile screens, not web page data structures

## Phase 1: MVP Scope

### Core screens

1. Home
2. Live Matches
3. Team Page
4. Match Page
5. Player Page
6. News / Telegram Feed
7. Preferences

### User value in MVP

- See favorite team and league data quickly
- Follow live matches
- Open team, match, and player details
- Read Telegram/news updates
- Save favorite teams and favorite leagues

## Phase 2: Mobile API Contract

### Endpoints to build

1. `/api/mobile/home`
Purpose: home screen payload

Should include:
- current season
- favorite teams and leagues context
- next match
- last match
- compact standings
- predictions
- live summary
- upcoming matches
- telegram/news highlights

2. `/api/mobile/live`
Purpose: live matches list

Should include:
- grouped live matches
- league and country
- score
- minute/status
- event count
- key events preview
- last updated timestamp

3. `/api/mobile/teams/:id`
Purpose: team page

Should include:
- team header
- coach
- standings context
- next match
- last match
- recent form
- squad
- team stats
- goals by minutes

4. `/api/mobile/games/:id`
Purpose: match page

Should include:
- header
- status and score
- events
- lineups
- match stats
- head to head
- predictions if relevant

5. `/api/mobile/players/:id`
Purpose: player page

Should include:
- player profile
- season selector
- season stats
- recent matches
- starts / bench / sub-in / sub-out summaries

6. `/api/mobile/news`
Purpose: telegram/news feed

Should include:
- merged feed from configured telegram sources
- source label
- team label
- image
- content preview
- content full text
- published date

7. `/api/mobile/preferences`
Purpose: user preferences

Should support:
- get preferences
- update favorite teams
- update favorite leagues

## Phase 3: iOS App Architecture

### Recommended structure

- `App/`
- `Core/`
- `Networking/`
- `Models/`
- `Features/Home/`
- `Features/Live/`
- `Features/Teams/`
- `Features/Games/`
- `Features/Players/`
- `Features/News/`
- `Features/Preferences/`
- `DesignSystem/`

### Technical choices

- `SwiftUI`
- `NavigationStack`
- `URLSession`
- `Codable`
- `AsyncImage` at first, then optional image cache layer
- `@Observable` or lightweight store pattern
- full `RTL` support

## Phase 4: Screen Breakdown

### Home

- top summary for selected/favorite team
- next match card
- last match card
- compact standings
- live strip
- telegram/news cards

### Live

- grouped by country and league
- compact rows
- expandable events
- fast refresh

### Team

- hero header
- upcoming and latest match
- table context
- form
- squad
- season statistics

### Match

- score and status
- timeline
- lineups on pitch
- match stats charts
- related predictions/h2h

### Player

- player profile
- current season stats
- season switcher
- linked matches for appearances and substitutions

### News

- source-aware cards
- images
- expand/collapse text
- filter by source or team later

### Preferences

- favorite teams multi-select
- favorite leagues multi-select
- saved to account and reflected in Home

## Phase 5: Development Order

### Sprint 1

- define mobile API contract
- build `/api/mobile/home`
- build `/api/mobile/live`
- scaffold iOS project
- implement app shell and navigation

### Sprint 2

- implement Home screen
- implement Live screen
- connect preferences loading

### Sprint 3

- build `/api/mobile/teams/:id`
- build `/api/mobile/games/:id`
- implement Team and Match screens

### Sprint 4

- build `/api/mobile/players/:id`
- build `/api/mobile/news`
- implement Player and News screens

### Sprint 5

- build `/api/mobile/preferences`
- implement Preferences screen
- polish loading, empty, and error states

## Phase 6: Native Capabilities After MVP

- push notifications
- background refresh
- deep links
- share sheet
- cached images
- offline-friendly last viewed data

## Data Rules

- favorite team and league filters should affect the Home screen first
- live should remain global unless explicitly filtered
- cup competitions must use only teams actually present in fixtures
- mobile endpoints should avoid overfetching and return only what each screen needs

## Risks

### Backend risk

- current web queries may be too broad for mobile
- fix by creating dedicated view models per endpoint

### Data quality risk

- cup competitions can be polluted by season-wide team stats if not constrained
- fix by grounding cup data in fixtures

### UX risk

- too much web-style density on mobile
- fix by designing mobile-first payloads and layouts

## Immediate Next Step

Start with `Phase 2`:

1. define JSON shape for `/api/mobile/home`
2. define JSON shape for `/api/mobile/live`
3. implement those two endpoints in the current app
4. only then open the iOS project
