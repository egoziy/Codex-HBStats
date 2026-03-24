from pathlib import Path
import os

from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent.parent.parent
load_dotenv(BASE_DIR / ".env")


class Settings:
    app_name = "Israeli Football Data Hub"
    api_base_url = os.getenv("API_FOOTBALL_BASE_URL", "https://v3.football.api-sports.io")
    api_key = os.getenv("API_FOOTBALL_KEY", "").strip()
    api_host = os.getenv("API_FOOTBALL_HOST", "").strip()
    database_path = BASE_DIR / "hbs_data.sqlite3"
    uploads_dir = BASE_DIR / "uploads"
    player_photos_dir = uploads_dir / "player_photos"
    team_logos_dir = uploads_dir / "team_logos"
    personnel_photos_dir = uploads_dir / "personnel_photos"
    team_search_name = os.getenv("API_FOOTBALL_TEAM_NAME", "Hapoel Beer Sheva")
    seasons = list(range(2018, 2025))


settings = Settings()
