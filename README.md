<<<<<<< HEAD
# Soccer League Management System

A comprehensive web application for managing soccer leagues with detailed statistics, player tracking, and game event logging. Built with modern web technologies for maximum performance and user experience.

## 🎯 Features (Phase 1)

### Core Functionality
- **League Management**: Create and manage seasons with teams and players
- **Team Management**: Add teams with logos and coach information
- **Player Management**: Add players with jersey numbers and photos
- **Game Tracking**: Schedule and record games with scores
- **Event Logging**: Track in-game events (goals, assists, cards, substitutions)
- **Statistics**: Automatic calculation of player and team statistics
- **Role-Based Access**: Admin panel for managing data, public view for statistics

### Internationalization
- Full English and Hebrew support
- Stored separately for both languages in the database
- Easy translation system using i18next

## 🛠️ Technology Stack

- **Frontend**: Next.js 14 with TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT-based auth with bcryptjs
- **Internationalization**: i18next with next-i18next
- **Code Quality**: ESLint

## 📋 Prerequisites

- Node.js 18+ and npm 9+
- PostgreSQL 12+
- Git (for version control)

## 🚀 Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Database

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Update the `DATABASE_URL` with your PostgreSQL connection string:

```
DATABASE_URL="postgresql://user:password@localhost:5432/soccer_league"
```

### 3. Initialize Database

Run Prisma migrations to create the database schema:

```bash
npm run db:push
```

Or for development with migration tracking:

```bash
npm run db:migrate
```

### 4. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` in your browser.

## 📦 Project Structure

```
soccer-league-management/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── auth/           # Authentication endpoints
│   │   │   ├── teams/          # Team CRUD operations
│   │   │   ├── players/        # Player CRUD operations
│   │   │   ├── games/          # Game CRUD operations
│   │   │   └── events/         # Game event operations
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Home page
│   │   └── globals.css         # Global styles
│   └── lib/
│       ├── prisma.ts           # Prisma client setup
│       ├── auth.ts             # Authentication utilities
│       └── i18n.ts             # i18n configuration
├── prisma/
│   └── schema.prisma           # Database schema
├── public/
│   └── locales/                # Translation files
│       ├── en/common.json
│       └── he/common.json
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.js
├── next.config.js
└── .env.example
```

## 🗄️ Database Schema

### Core Models

- **User**: System users with role-based access
- **Season**: League season (e.g., 2023/2024)
- **Team**: Teams participating in the league
- **Player**: Players on teams
- **Game**: Matches between teams
- **GameEvent**: In-game events (goals, cards, etc.)
- **Standing**: League standings/table
- **PlayerStatistics**: Aggregated player stats
- **TeamStatistics**: Aggregated team stats
- **GameStatistics**: Detailed game statistics

## 🔑 API Endpoints

### Authentication
- `POST /api/auth` - Register/Login

### Teams
- `GET /api/teams?seasonId=X` - Get teams by season
- `POST /api/teams` - Create team (Admin)
- `PUT /api/teams` - Update team (Admin)
- `DELETE /api/teams?id=X` - Delete team (Admin)

### Players
- `GET /api/players?teamId=X` - Get players by team
- `POST /api/players` - Create player (Admin)
- `PUT /api/players` - Update player (Admin)
- `DELETE /api/players?id=X` - Delete player (Admin)

### Games
- `GET /api/games?seasonId=X` - Get games by season
- `POST /api/games` - Create game (Admin)
- `PUT /api/games` - Update game (Admin)
- `DELETE /api/games?id=X` - Delete game (Admin)

### Game Events
- `GET /api/events?gameId=X` - Get game events
- `POST /api/events` - Create event (Admin)
- `DELETE /api/events?id=X` - Delete event (Admin)

## 🔐 Authentication

The system uses JWT tokens for authentication. When a user logs in or registers:

1. Password is hashed using bcryptjs
2. JWT token is issued (7-day expiration)
3. Token must be sent in Authorization header: `Bearer <token>`
4. Admin endpoints verify token and user role

## 🌍 Internationalization

All content is stored in English and Hebrew:
- Database stores both `nameEn` and `nameHe` for teams, players, etc.
- Front-end can display content in either language
- Translation files in `/public/locales/` for UI strings

## 📊 Statistics

The system automatically maintains:
- Player statistics (goals, assists, cards, games played)
- Team statistics (total goals, assists)
- League standings (wins, losses, draws, points, goal differential)
- Game statistics (possession, shots, corners, fouls)

## 🛠️ Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run db:push      # Sync Prisma schema with database
npm run db:migrate   # Create and run migration
npm run db:studio    # Open Prisma Studio GUI
```

## 📝 Next Steps (Future Phases)

### Phase 2: Core Features
- Admin dashboard UI
- Team and player management UI
- Game creation and event tracking UI
- League table display

### Phase 3: Data Integration
- Web scraper for external league data
- Data import/mapping system
- Conflict resolution for edited data

### Phase 4: Public Features
- Player statistics pages
- Game details pages with event timeline
- Responsive mobile design

### Phase 5: Advanced Features
- Cup tournament brackets
- European league integration
- Historical statistics
- Search and filtering

## 🐛 Troubleshooting

### Database Connection Issues
- Verify PostgreSQL is running
- Check DATABASE_URL is correct
- Run `npm run db:push` to sync schema

### Dependencies Not Installed
- Delete `node_modules` and `package-lock.json`
- Run `npm install` again

### Port Already in Use
- Default port is 3000
- Set custom port: `PORT=3001 npm run dev`

## 📄 License

This project is private. All rights reserved.

## 👥 Contributing

This is a single-dev project. For contributions, please contact the project owner.

---

**Getting Started**: Run `npm install` then `npm run dev`, then configure your `.env.local` with your PostgreSQL connection and run `npm run db:push`.
=======
# Israeli Football Data App

Local full stack app for fetching Israeli football data from API-Football, caching it in SQLite, and browsing the saved data in a single-page HTML frontend.

## Features

- FastAPI backend in Python
- Startup lookup for Hapoel Be'er Sheva's team ID from API-Football as a default reference
- Dropdowns to choose an Israeli league and a team for the selected season
- Hebrew-first frontend with an English/Hebrew display toggle
- Bilingual persistence: fetched records are saved in both English and Hebrew
- Separate editor page for manual team and player metadata
- Team logo upload and extended staff directory editing on the editor page
- Local SQLite storage with one table per data type:
  - `fixtures`
  - `player_stats`
  - `standings`
- Cache-first behavior: if the same season/league/team scope is already stored, the backend skips the API call
- Single HTML frontend with vanilla JavaScript and no build step

## Project Structure

```text
backend/
  app/
    services/
      api_football.py
    static/
      index.html
    config.py
    database.py
    main.py
.env.example
README.md
requirements.txt
```

## Prerequisites

- Python 3.11+ recommended
- An API-Football key

## Exact Run Steps

1. Open a terminal in the project root:

   ```powershell
   cd C:\Users\popch\Downloads\Codex\HBS
   ```

2. Create and activate a virtual environment:

   ```powershell
   python -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

3. Install dependencies:

   ```powershell
   pip install -r requirements.txt
   ```

4. Create a `.env` file from the example:

   ```powershell
   Copy-Item .env.example .env
   ```

5. Edit `.env` and set your real API key:

   ```env
API_FOOTBALL_KEY=your_real_key_here
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_HOST=
API_FOOTBALL_TEAM_NAME=Hapoel Beer Sheva
   ```

   If you use RapidAPI instead of the direct API-Sports endpoint, set:

   ```env
   API_FOOTBALL_BASE_URL=https://api-football-v1.p.rapidapi.com/v3
   API_FOOTBALL_HOST=api-football-v1.p.rapidapi.com
   ```

6. Start the app:

   ```powershell
   uvicorn backend.app.main:app --reload
   ```

   If port `8000` is already in use on your machine, run:

   ```powershell
   uvicorn backend.app.main:app --reload --port 8011
   ```

7. Open the app in your browser:

   [http://127.0.0.1:8000](http://127.0.0.1:8000)

## How It Works

- On startup, the backend searches API-Football for `Hapoel Beer Sheva` and keeps that as a default reference.
- The frontend loads Israeli leagues for the selected season, then loads teams for the chosen league.
- When you click `Fetch & Save`, the backend checks SQLite first.
- If the same `season + league + team` scope already exists for fixtures or player stats, the API is not called again.
- If the same `season + league` scope already exists for standings, the API is not called again.
- If it does not exist yet, the backend fetches the data from API-Football and stores the full payload in SQLite.

## API Endpoints

- `GET /` serves the frontend
- `GET /editor` serves the team/player editor page
- `GET /api/status` shows startup status, seasons, and the default Hapoel Be'er Sheva reference
- `GET /api/options/leagues?season=2024&language=he` lists Israeli leagues for that season
- `GET /api/options/teams?season=2024&league_id=200&language=he` lists teams for a league and season
- `POST /api/fetch` fetches and stores selected data for one season/league/team scope
- `GET /api/data/fixtures`
- `GET /api/data/player_stats`
- `GET /api/data/standings`
- `GET /api/editor/team`
- `PUT /api/editor/team`
- `POST /api/editor/team-logo`
- `GET /api/editor/players`
- `POST /api/editor/player`
- `GET /api/editor/team-personnel`
- `POST /api/editor/team-personnel`
- `DELETE /api/editor/team-personnel/{personnel_id}`

Optional query parameters are supported on `/api/data/{type}`:

- `season`
- `league_id`
- `team_id` for fixtures and player stats
- `language` with values `he` or `en`

## Notes

- The local database file is created as `hbs_data.sqlite3` in the project root.
- If the API key is missing or API-Football is unavailable, the backend still starts, but fetch requests will fail until startup lookup succeeds.
- The app supports both the direct API-Sports host and the RapidAPI-hosted API-Football endpoint.
- The app is focused on Israeli football leagues and teams.
- Existing rows from the older single-team schema are preserved during automatic database migration.
- Hebrew translations are generated when data is fetched and both English and Hebrew payloads are stored in SQLite.
- Uploaded player photos are stored locally under `uploads/player_photos/`.
- Uploaded team logos are stored under `uploads/team_logos/`.
- Uploaded staff photos are stored under `uploads/personnel_photos/`.
>>>>>>> 9d1ad32 (Build Israeli football local app with editor and game pages)
