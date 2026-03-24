from __future__ import annotations

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path
import shutil
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .config import settings
from .database import (
    delete_game_event,
    delete_team_personnel,
    get_game_event,
    get_player_meta,
    get_player_meta_map,
    get_scoped_data,
    get_team_meta,
    get_team_meta_map,
    get_team_personnel,
    has_scoped_data,
    init_db,
    list_cached_leagues,
    list_cached_teams,
    list_game_events,
    list_game_player_assignments,
    list_table_data,
    list_team_personnel,
    save_scoped_data,
    upsert_game_event,
    upsert_game_player_assignment,
    upsert_player_meta,
    upsert_team_meta,
    upsert_team_personnel,
)
from .services.api_football import ApiFootballClient, ApiFootballError, TeamContext
from .services.translation import TranslationService


STATIC_DIR = Path(__file__).resolve().parent / "static"
LANGUAGES = {"he", "en"}
EVENT_TYPES = {"starter", "sub_in", "sub_out", "yellow", "red", "goal", "assist"}
LINEUP_STATUSES = {"starter", "bench", "not_in_squad"}
POSITION_GROUPS = {
    "goalkeeper": {"he": "שוער", "en": "Goalkeeper"},
    "defender": {"he": "הגנה", "en": "Defender"},
    "midfielder": {"he": "קישור", "en": "Midfielder"},
    "attacker": {"he": "התקפה", "en": "Attacker"},
    "staff": {"he": "צוות", "en": "Staff"},
    "unknown": {"he": "לא הוגדר", "en": "Unknown"},
}
EVENT_META = {
    "starter": {"icon": "★", "label_he": "פתח", "label_en": "Starter"},
    "sub_in": {"icon": "⬆", "label_he": "נכנס", "label_en": "Sub In"},
    "sub_out": {"icon": "⬇", "label_he": "יצא", "label_en": "Sub Out"},
    "yellow": {"icon": "🟨", "label_he": "צהוב", "label_en": "Yellow"},
    "red": {"icon": "🟥", "label_he": "אדום", "label_en": "Red"},
    "goal": {"icon": "⚽", "label_he": "שער", "label_en": "Goal"},
    "assist": {"icon": "🅰", "label_he": "בישול", "label_en": "Assist"},
}

settings.uploads_dir.mkdir(parents=True, exist_ok=True)
settings.player_photos_dir.mkdir(parents=True, exist_ok=True)
settings.team_logos_dir.mkdir(parents=True, exist_ok=True)
settings.personnel_photos_dir.mkdir(parents=True, exist_ok=True)


class FetchRequest(BaseModel):
    season: int = Field(..., ge=min(settings.seasons), le=max(settings.seasons))
    league_id: int = Field(..., gt=0)
    league_name_en: str | None = None
    team_id: int = Field(..., gt=0)
    team_name_en: str | None = None
    fixtures: bool = True
    player_stats: bool = True
    standings: bool = True


class TeamMetaRequest(BaseModel):
    team_id: int
    league_id: int | None = None
    season: int | None = None
    team_name_en_override: str | None = None
    team_name_he_override: str | None = None
    coach_name: str | None = None
    coach_title: str | None = None
    notes: str | None = None


class GameAssignmentRequest(BaseModel):
    fixture_id: int
    team_id: int
    player_id: int
    lineup_status: str | None = None
    position_group: str | None = None
    sort_order: int = 0


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def choose_payload(row: dict[str, Any], language: str) -> Any:
    return row["payload_he"] if language == "he" else row["payload_en"]


def choose_text(row: dict[str, Any], english_key: str, hebrew_key: str, language: str) -> Any:
    if language == "he":
        return row.get(hebrew_key) or row.get(english_key)
    return row.get(english_key) or row.get(hebrew_key)


def choose_team_name(row: dict[str, Any], team_meta: dict[str, Any] | None, language: str) -> str | None:
    if team_meta:
        if language == "he" and team_meta.get("team_name_he_override"):
            return team_meta["team_name_he_override"]
        if language == "en" and team_meta.get("team_name_en_override"):
            return team_meta["team_name_en_override"]
    return choose_text(row, "team_name_en", "team_name_he", language)


def choose_player_name(player: dict[str, Any], player_meta: dict[str, Any] | None, language: str) -> str | None:
    if player_meta:
        if language == "he" and player_meta.get("player_name_he_override"):
            return player_meta["player_name_he_override"]
        if language == "en" and player_meta.get("player_name_en_override"):
            return player_meta["player_name_en_override"]
    return player.get("name")


def build_table_preview(data_type: str, rows: list[dict[str, Any]], language: str) -> list[dict[str, Any]]:
    preview_rows: list[dict[str, Any]] = []
    team_meta_map = get_team_meta_map([row["team_id"] for row in rows if row.get("team_id")])

    for row in rows:
        payload = choose_payload(row, language)
        team_meta = team_meta_map.get(row["team_id"]) if row.get("team_id") else None
        preview_rows.append(
            {
                "season": row["season"],
                "league_id": row["league_id"],
                "league_name": choose_text(row, "league_name_en", "league_name_he", language),
                "team_id": row["team_id"],
                "team_name": choose_team_name(row, team_meta, language),
                "fetched_at": row["fetched_at"],
                "record_count": row["record_count"],
                "language": language,
                "items": flatten_payload(data_type, payload, language, row),
            }
        )
    return preview_rows


def flatten_payload(data_type: str, payload: Any, language: str, row: dict[str, Any]) -> list[dict[str, Any]]:
    if data_type == "fixtures":
        flattened = []
        for item in payload:
            fixture_id = item.get("fixture", {}).get("id")
            flattened.append(
                {
                    "fixture_id": fixture_id,
                    "date": item.get("fixture", {}).get("date"),
                    "status": item.get("fixture", {}).get("status", {}).get("long") or item.get("fixture", {}).get("status", {}).get("short"),
                    "league": item.get("league", {}).get("name"),
                    "home": item.get("teams", {}).get("home", {}).get("name"),
                    "away": item.get("teams", {}).get("away", {}).get("name"),
                    "score": format_fixture_score(item),
                    "game_page": f"/game?fixture_id={fixture_id}&team_id={row.get('team_id') or ''}&language={language}" if fixture_id else None,
                }
            )
        return flattened

    if data_type == "player_stats":
        player_ids = [item.get("player", {}).get("id") for item in payload if item.get("player", {}).get("id")]
        player_meta_map = get_player_meta_map(player_ids)
        flattened: list[dict[str, Any]] = []
        for item in payload:
            player = item.get("player", {})
            player_meta = player_meta_map.get(player.get("id"))
            statistics = item.get("statistics", [])
            primary = statistics[0] if statistics else {}
            games = primary.get("games", {})
            goals = primary.get("goals", {})
            cards = primary.get("cards", {})
            flattened.append(
                {
                    "player": choose_player_name(player, player_meta, language),
                    "age": player.get("age"),
                    "position": player_meta.get("position_override") if player_meta and player_meta.get("position_override") else games.get("position"),
                    "appearances": games.get("appearences"),
                    "minutes": games.get("minutes"),
                    "goals": goals.get("total"),
                    "assists": goals.get("assists"),
                    "yellow": cards.get("yellow"),
                    "red": cards.get("red"),
                    "jersey_number": player_meta.get("jersey_number") if player_meta else None,
                }
            )
        return flattened

    if data_type == "standings":
        flattened = []
        for block in payload:
            league = block.get("league", {})
            standings_groups = league.get("standings", [])
            for group in standings_groups:
                for standing_row in group:
                    flattened.append(
                        {
                            "league": league.get("name"),
                            "rank": standing_row.get("rank"),
                            "team": standing_row.get("team", {}).get("name"),
                            "points": standing_row.get("points"),
                            "played": standing_row.get("all", {}).get("played"),
                            "goal_diff": standing_row.get("goalsDiff"),
                            "form": standing_row.get("form"),
                        }
                    )
        return flattened
    return []


def format_fixture_score(item: dict[str, Any]) -> str:
    goals = item.get("goals", {})
    home = goals.get("home")
    away = goals.get("away")
    if home is None and away is None:
        return "-"
    return f"{home}-{away}"


def validate_language(language: str) -> str:
    if language not in LANGUAGES:
        raise HTTPException(status_code=400, detail="Unsupported language.")
    return language


def validate_event_type(event_type: str) -> str:
    if event_type not in EVENT_TYPES:
        raise HTTPException(status_code=400, detail="Unsupported event type.")
    return event_type


def validate_lineup_status(lineup_status: str | None) -> str | None:
    if lineup_status is None or lineup_status == "":
        return None
    if lineup_status not in LINEUP_STATUSES:
        raise HTTPException(status_code=400, detail="Unsupported lineup status.")
    return lineup_status


def validate_position_group(position_group: str | None) -> str | None:
    if position_group is None or position_group == "":
        return None
    if position_group not in POSITION_GROUPS:
        raise HTTPException(status_code=400, detail="Unsupported position group.")
    return position_group


def row_needs_translation(row: dict[str, Any] | None) -> bool:
    if row is None:
        return False
    if not row.get("payload_he"):
        return True
    if row.get("payload_he") == row.get("payload_en"):
        return True
    if row.get("league_name_he") == row.get("league_name_en"):
        return True
    if row.get("team_name_he") == row.get("team_name_en") and row.get("team_name_en"):
        return True
    return False


def build_photo_url(photo_path: str | None) -> str | None:
    if not photo_path:
        return None
    path = Path(photo_path)
    return f"/uploads/{path.parent.name}/{path.name}"


def build_personnel_payload(row: dict[str, Any]) -> dict[str, Any]:
    payload = dict(row)
    payload["photo_url"] = build_photo_url(row.get("photo_path"))
    return payload


def sanitize_filename(filename: str) -> str:
    safe = "".join(ch if ch.isalnum() or ch in {".", "_", "-"} else "_" for ch in filename)
    return safe or "upload.bin"


def position_group_label(position_group: str | None, language: str) -> str:
    return POSITION_GROUPS.get(position_group or "unknown", POSITION_GROUPS["unknown"])[language]


def detect_position_group(position_text: str | None) -> str:
    text = (position_text or "").strip().lower()
    if any(token in text for token in ("goal", "keeper", "שוער")):
        return "goalkeeper"
    if any(token in text for token in ("def", "back", "centre-back", "בלם", "מגן", "הגנה")):
        return "defender"
    if any(token in text for token in ("mid", "wing", "קשר", "קישור")):
        return "midfielder"
    if any(token in text for token in ("forw", "strik", "attack", "חלוץ", "כנף", "התקפה")):
        return "attacker"
    return "unknown"


def minute_label(minute: int | None, extra_minute: int | None) -> str:
    if minute is None:
        return "-"
    if extra_minute:
        return f"{minute}+{extra_minute}'"
    return f"{minute}'"


def build_editor_players(season: int, league_id: int, team_id: int) -> list[dict[str, Any]]:
    row = get_scoped_data("player_stats", season, league_id, team_id)
    if row is None:
        return []

    payload_en = row["payload_en"]
    payload_he = row["payload_he"]
    meta_map = get_player_meta_map([item.get("player", {}).get("id") for item in payload_en if item.get("player", {}).get("id")])

    players: list[dict[str, Any]] = []
    for index, item_en in enumerate(payload_en):
        item_he = payload_he[index] if index < len(payload_he) else item_en
        player_en = item_en.get("player", {})
        player_he = item_he.get("player", {})
        statistics_en = item_en.get("statistics", [])
        primary_en = statistics_en[0] if statistics_en else {}
        games_en = primary_en.get("games", {})
        meta = meta_map.get(player_en.get("id"))
        position_value = meta.get("position_override") if meta and meta.get("position_override") else games_en.get("position")
        group = detect_position_group(position_value)
        players.append(
            {
                "player_id": player_en.get("id"),
                "team_id": team_id,
                "season": season,
                "league_id": league_id,
                "player_name_en": meta.get("player_name_en_override") if meta and meta.get("player_name_en_override") else player_en.get("name"),
                "player_name_he": meta.get("player_name_he_override") if meta and meta.get("player_name_he_override") else player_he.get("name"),
                "base_position": games_en.get("position"),
                "position_override": meta.get("position_override") if meta else None,
                "position_group": group,
                "position_group_he": position_group_label(group, "he"),
                "position_group_en": position_group_label(group, "en"),
                "jersey_number": meta.get("jersey_number") if meta else None,
                "photo_path": meta.get("photo_path") if meta else None,
                "photo_url": build_photo_url(meta.get("photo_path")) if meta and meta.get("photo_path") else None,
                "age": player_en.get("age"),
            }
        )
    return players


def get_cached_options(cache_type: str, cache_key: str) -> list[dict[str, Any]] | None:
    return app.state.options_cache[cache_type].get(cache_key)


def set_cached_options(cache_type: str, cache_key: str, value: list[dict[str, Any]]) -> None:
    app.state.options_cache[cache_type][cache_key] = value


def build_team_baseline(season: int, league_id: int, team_id: int, language: str) -> dict[str, Any]:
    team_meta = get_team_meta(team_id)
    team_row = get_scoped_data("fixtures", season, league_id, team_id) or get_scoped_data("player_stats", season, league_id, team_id)
    base_name_en = team_row.get("team_name_en") if team_row else None
    base_name_he = team_row.get("team_name_he") if team_row else None
    return {
        "team_id": team_id,
        "team_name_en": team_meta.get("team_name_en_override") if team_meta and team_meta.get("team_name_en_override") else base_name_en,
        "team_name_he": team_meta.get("team_name_he_override") if team_meta and team_meta.get("team_name_he_override") else base_name_he or base_name_en,
        "coach_name": team_meta.get("coach_name") if team_meta else None,
        "coach_title": team_meta.get("coach_title") if team_meta else None,
        "logo_url": build_photo_url(team_meta.get("logo_path")) if team_meta and team_meta.get("logo_path") else None,
        "display_name": (team_meta.get("team_name_he_override") if team_meta and team_meta.get("team_name_he_override") else base_name_he or base_name_en)
        if language == "he"
        else (team_meta.get("team_name_en_override") if team_meta and team_meta.get("team_name_en_override") else base_name_en or base_name_he),
    }


def find_fixture_context(fixture_id: int, preferred_team_id: int | None = None) -> dict[str, Any] | None:
    rows = list_table_data("fixtures")
    for row in rows:
        if preferred_team_id and row.get("team_id") != preferred_team_id:
            continue
        for index, item_en in enumerate(row["payload_en"]):
            if item_en.get("fixture", {}).get("id") == fixture_id:
                item_he = row["payload_he"][index] if index < len(row["payload_he"]) else item_en
                return {
                    "row": row,
                    "item_en": item_en,
                    "item_he": item_he,
                }
    if preferred_team_id is not None:
        return find_fixture_context(fixture_id, None)
    return None


def list_scope_fixtures(season: int, league_id: int, team_id: int, language: str) -> list[dict[str, Any]]:
    row = get_scoped_data("fixtures", season, league_id, team_id)
    if row is None:
        return []
    payload = choose_payload(row, language)
    fixtures = []
    for item in payload:
        fixture = item.get("fixture", {})
        teams = item.get("teams", {})
        fixtures.append(
            {
                "fixture_id": fixture.get("id"),
                "date": fixture.get("date"),
                "status": fixture.get("status", {}).get("long") or fixture.get("status", {}).get("short"),
                "home_name": teams.get("home", {}).get("name"),
                "away_name": teams.get("away", {}).get("name"),
                "home_id": teams.get("home", {}).get("id"),
                "away_id": teams.get("away", {}).get("id"),
                "score": format_fixture_score(item),
            }
        )
    fixtures.sort(key=lambda item: item.get("date") or "")
    return fixtures


def build_event_payload(
    event_row: dict[str, Any],
    player_map: dict[int, dict[str, Any]],
    team_map: dict[int, dict[str, Any]],
    language: str,
) -> dict[str, Any]:
    event_type = event_row["event_type"]
    meta = EVENT_META.get(event_type, {"icon": "•", "label_he": event_type, "label_en": event_type})
    player = player_map.get(event_row["player_id"]) if event_row.get("player_id") else None
    related = player_map.get(event_row["related_player_id"]) if event_row.get("related_player_id") else None
    team = team_map.get(event_row["team_id"]) if event_row.get("team_id") else None
    return {
        "id": event_row["id"],
        "fixture_id": event_row["fixture_id"],
        "team_id": event_row.get("team_id"),
        "team_name": team.get("display_name") if team else None,
        "player_id": event_row.get("player_id"),
        "player_name": player.get("display_name") if player else None,
        "related_player_id": event_row.get("related_player_id"),
        "related_player_name": related.get("display_name") if related else None,
        "event_type": event_type,
        "event_label": meta["label_he"] if language == "he" else meta["label_en"],
        "icon": meta["icon"],
        "minute": event_row.get("minute"),
        "extra_minute": event_row.get("extra_minute"),
        "minute_label": minute_label(event_row.get("minute"), event_row.get("extra_minute")),
        "notes": event_row.get("notes_he") if language == "he" else event_row.get("notes_en"),
        "notes_he": event_row.get("notes_he"),
        "notes_en": event_row.get("notes_en"),
    }


def build_game_team_payload(
    fixture_context: dict[str, Any],
    team_id: int,
    language: str,
    assignments_by_team: dict[int, dict[int, dict[str, Any]]],
) -> dict[str, Any]:
    row = fixture_context["row"]
    players = build_editor_players(row["season"], row["league_id"], team_id)
    team = build_team_baseline(row["season"], row["league_id"], team_id, language)
    assignment_map = assignments_by_team.get(team_id, {})

    starters: dict[str, list[dict[str, Any]]] = {key: [] for key in POSITION_GROUPS}
    bench: list[dict[str, Any]] = []
    not_in_squad: list[dict[str, Any]] = []

    for player in players:
        assignment = assignment_map.get(player["player_id"], {})
        position_group = assignment.get("position_group") or player["position_group"]
        lineup_status = assignment.get("lineup_status") or "bench"
        display_name = player["player_name_he"] if language == "he" else player["player_name_en"]
        entry = {
            **player,
            "display_name": display_name,
            "position_group": position_group,
            "position_group_label": position_group_label(position_group, language),
            "lineup_status": lineup_status,
            "sort_order": assignment.get("sort_order", 0),
        }
        if lineup_status == "starter":
            starters.setdefault(position_group, []).append(entry)
        elif lineup_status == "not_in_squad":
            not_in_squad.append(entry)
        else:
            bench.append(entry)

    for key in starters:
        starters[key].sort(key=lambda item: (item.get("sort_order", 0), item.get("jersey_number") or "", item["display_name"] or ""))
    bench.sort(key=lambda item: (item.get("sort_order", 0), item.get("jersey_number") or "", item["display_name"] or ""))
    not_in_squad.sort(key=lambda item: (item.get("sort_order", 0), item.get("jersey_number") or "", item["display_name"] or ""))

    teams_en = fixture_context["item_en"].get("teams", {})
    goals = fixture_context["item_en"].get("goals", {})
    is_home = teams_en.get("home", {}).get("id") == team_id

    return {
        **team,
        "side": "home" if is_home else "away",
        "score": goals.get("home") if is_home else goals.get("away"),
        "starters": [
            {
                "group": group,
                "label": position_group_label(group, language),
                "players": starters[group],
            }
            for group in ("goalkeeper", "defender", "midfielder", "attacker", "unknown")
            if starters.get(group)
        ],
        "bench": bench,
        "not_in_squad": not_in_squad,
        "all_players": players,
    }


def build_game_payload(fixture_id: int, preferred_team_id: int | None, language: str) -> dict[str, Any]:
    fixture_context = find_fixture_context(fixture_id, preferred_team_id)
    if fixture_context is None:
        raise HTTPException(status_code=404, detail="Fixture not found in local database.")

    row = fixture_context["row"]
    item = fixture_context["item_he"] if language == "he" else fixture_context["item_en"]
    item_en = fixture_context["item_en"]
    teams_en = item_en.get("teams", {})
    home_team_id = teams_en.get("home", {}).get("id")
    away_team_id = teams_en.get("away", {}).get("id")
    home_team = build_team_baseline(row["season"], row["league_id"], home_team_id, language) if home_team_id else None
    away_team = build_team_baseline(row["season"], row["league_id"], away_team_id, language) if away_team_id else None

    assignments = list_game_player_assignments(fixture_id)
    assignments_by_team: dict[int, dict[int, dict[str, Any]]] = {}
    for assignment in assignments:
        assignments_by_team.setdefault(assignment["team_id"], {})[assignment["player_id"]] = assignment

    home_payload = build_game_team_payload(fixture_context, home_team_id, language, assignments_by_team) if home_team_id else None
    away_payload = build_game_team_payload(fixture_context, away_team_id, language, assignments_by_team) if away_team_id else None

    player_map: dict[int, dict[str, Any]] = {}
    for team_payload in (home_payload, away_payload):
        if not team_payload:
            continue
        for player in team_payload["all_players"]:
            player_map[player["player_id"]] = {
                "display_name": player["player_name_he"] if language == "he" else player["player_name_en"],
                "display_name_he": player["player_name_he"],
                "display_name_en": player["player_name_en"],
            }

    team_map = {
        team_id_value: payload
        for team_id_value, payload in ((home_team_id, home_payload), (away_team_id, away_payload))
        if team_id_value and payload
    }

    events = [build_event_payload(event_row, player_map, team_map, language) for event_row in list_game_events(fixture_id)]

    return {
        "fixture_id": fixture_id,
        "season": row["season"],
        "league_id": row["league_id"],
        "league_name": row["league_name_he"] if language == "he" else row["league_name_en"],
        "fixture": {
            "date": item.get("fixture", {}).get("date"),
            "venue": item.get("fixture", {}).get("venue", {}).get("name"),
            "status": item.get("fixture", {}).get("status", {}).get("long") or item.get("fixture", {}).get("status", {}).get("short"),
            "score": format_fixture_score(item_en),
        },
        "home_team": home_payload or home_team,
        "away_team": away_payload or away_team,
        "events": events,
        "legend": [
            {"event_type": key, "icon": value["icon"], "label": value["label_he"] if language == "he" else value["label_en"]}
            for key, value in EVENT_META.items()
        ],
    }


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    settings.player_photos_dir.mkdir(parents=True, exist_ok=True)
    settings.team_logos_dir.mkdir(parents=True, exist_ok=True)
    settings.personnel_photos_dir.mkdir(parents=True, exist_ok=True)
    init_db()
    client = ApiFootballClient()
    translator = TranslationService()
    app.state.client = client
    app.state.translator = translator
    app.state.default_team = None
    app.state.default_team_he = None
    app.state.startup_error = None
    app.state.options_cache = {"leagues": {}, "teams": {}}

    try:
        app.state.default_team = client.find_team_by_name(settings.team_search_name)
        app.state.default_team_he = translator.translate_text(app.state.default_team.team_name)
    except ApiFootballError as exc:
        app.state.startup_error = str(exc)
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
app.mount("/uploads", StaticFiles(directory=settings.uploads_dir), name="uploads")


def get_client() -> ApiFootballClient:
    return app.state.client


def get_translator() -> TranslationService:
    return app.state.translator


def get_default_team() -> TeamContext | None:
    return getattr(app.state, "default_team", None)


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/editor")
def editor_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "editor.html")


@app.get("/game")
def game_page() -> FileResponse:
    return FileResponse(STATIC_DIR / "game.html")


@app.get("/api/status")
def status() -> dict[str, Any]:
    default_team = get_default_team()
    return {
        "app_name": settings.app_name,
        "default_team": {
            "id": default_team.team_id,
            "name_en": default_team.team_name,
            "name_he": getattr(app.state, "default_team_he", None) or default_team.team_name,
        }
        if default_team
        else None,
        "startup_error": getattr(app.state, "startup_error", None),
        "seasons": settings.seasons,
        "database_path": str(settings.database_path),
        "default_language": "he",
        "supported_languages": sorted(LANGUAGES),
        "position_groups": [
            {"value": key, "label_he": value["he"], "label_en": value["en"]}
            for key, value in POSITION_GROUPS.items()
            if key != "staff"
        ],
        "event_types": [
            {"value": key, "icon": value["icon"], "label_he": value["label_he"], "label_en": value["label_en"]}
            for key, value in EVENT_META.items()
        ],
    }


@app.get("/api/options/leagues")
def league_options(
    season: int = Query(..., ge=min(settings.seasons), le=max(settings.seasons)),
    language: str = Query("he"),
) -> dict[str, Any]:
    language = validate_language(language)
    cache_key = str(season)
    cached = get_cached_options("leagues", cache_key)
    if cached is None:
        client = get_client()
        translator = get_translator()
        try:
            leagues = client.list_leagues(season)
        except ApiFootballError as exc:
            leagues = list_cached_leagues(season)
            if not leagues:
                raise HTTPException(status_code=502, detail=str(exc)) from exc

        cached = translator.translate_options(leagues, "league_name", "league_name_he")
        set_cached_options("leagues", cache_key, cached)

    localized = []
    for league in cached:
        localized.append({**league, "display_name": league.get("league_name_he") if language == "he" else league.get("league_name")})
    return {"season": season, "language": language, "leagues": localized, "cached": True}


@app.get("/api/options/teams")
def team_options(
    season: int = Query(..., ge=min(settings.seasons), le=max(settings.seasons)),
    league_id: int = Query(..., gt=0),
    language: str = Query("he"),
) -> dict[str, Any]:
    language = validate_language(language)
    cache_key = f"{season}:{league_id}"
    cached = get_cached_options("teams", cache_key)
    if cached is None:
        client = get_client()
        translator = get_translator()
        try:
            teams = client.list_teams(league_id, season)
        except ApiFootballError as exc:
            teams = list_cached_teams(season, league_id)
            if not teams:
                raise HTTPException(status_code=502, detail=str(exc)) from exc

        cached = translator.translate_options(teams, "team_name", "team_name_he")
        set_cached_options("teams", cache_key, cached)

    team_meta_map = get_team_meta_map([team["team_id"] for team in cached if team.get("team_id")])
    localized = []
    for team in cached:
        meta = team_meta_map.get(team["team_id"])
        team_name_en = meta.get("team_name_en_override") if meta and meta.get("team_name_en_override") else team.get("team_name")
        team_name_he = meta.get("team_name_he_override") if meta and meta.get("team_name_he_override") else team.get("team_name_he")
        localized.append(
            {
                **team,
                "team_name": team_name_en,
                "team_name_he": team_name_he,
                "coach_name": meta.get("coach_name") if meta else None,
                "coach_title": meta.get("coach_title") if meta else None,
                "logo_url": build_photo_url(meta.get("logo_path")) if meta and meta.get("logo_path") else None,
                "display_name": team_name_he if language == "he" else team_name_en,
            }
        )
    return {"season": season, "league_id": league_id, "language": language, "teams": localized, "cached": True}


@app.post("/api/fetch")
def fetch_and_store(payload: FetchRequest) -> dict[str, Any]:
    if not any([payload.fixtures, payload.player_stats, payload.standings]):
        raise HTTPException(status_code=400, detail="Select at least one data type.")

    client = get_client()
    translator = get_translator()
    league_name_he = translator.translate_text(payload.league_name_en)
    team_name_he = translator.translate_text(payload.team_name_en)

    tasks = [
        ("fixtures", payload.fixtures, lambda: client.fetch_fixtures(payload.team_id, payload.season, payload.league_id), payload.team_id, payload.team_name_en, team_name_he),
        ("player_stats", payload.player_stats, lambda: client.fetch_players(payload.team_id, payload.season, payload.league_id), payload.team_id, payload.team_name_en, team_name_he),
        ("standings", payload.standings, lambda: client.fetch_standings(payload.league_id, payload.season), None, None, None),
    ]

    results = []
    for table, selected, fetcher, team_id, team_name_en, team_name_he_value in tasks:
        if not selected:
            continue

        if has_scoped_data(table, payload.season, payload.league_id, team_id):
            row = get_scoped_data(table, payload.season, payload.league_id, team_id)
            if row_needs_translation(row):
                translated_payload = translator.translate_payload(row["payload_en"])
                translated_league_name = translator.translate_text(row["league_name_en"] or payload.league_name_en)
                translated_team_name = translator.translate_text(row["team_name_en"] or team_name_en)
                save_scoped_data(
                    table=table,
                    season=payload.season,
                    league_id=payload.league_id,
                    league_name_en=row["league_name_en"] or payload.league_name_en,
                    league_name_he=translated_league_name,
                    team_id=team_id,
                    team_name_en=row["team_name_en"] or team_name_en,
                    team_name_he=translated_team_name,
                    fetched_at=row["fetched_at"],
                    record_count=row["record_count"],
                    payload_en=row["payload_en"],
                    payload_he=translated_payload,
                )
                row = get_scoped_data(table, payload.season, payload.league_id, team_id)
            results.append(
                {
                    "data_type": table,
                    "status": "cached",
                    "season": payload.season,
                    "league_id": payload.league_id,
                    "league_name_en": row["league_name_en"],
                    "league_name_he": row["league_name_he"],
                    "team_id": team_id,
                    "team_name_en": row["team_name_en"],
                    "team_name_he": row["team_name_he"],
                    "record_count": row["record_count"] if row else 0,
                }
            )
            continue

        try:
            payload_en = fetcher()
        except ApiFootballError as exc:
            raise HTTPException(status_code=502, detail=f"{table}: {exc}") from exc

        payload_he = translator.translate_payload(payload_en)
        flattened = flatten_payload(table, payload_he, "he", {"team_id": team_id})
        save_scoped_data(
            table=table,
            season=payload.season,
            league_id=payload.league_id,
            league_name_en=payload.league_name_en,
            league_name_he=league_name_he,
            team_id=team_id,
            team_name_en=team_name_en,
            team_name_he=team_name_he_value,
            fetched_at=utc_now(),
            record_count=len(flattened),
            payload_en=payload_en,
            payload_he=payload_he,
        )
        results.append(
            {
                "data_type": table,
                "status": "fetched",
                "season": payload.season,
                "league_id": payload.league_id,
                "league_name_en": payload.league_name_en,
                "league_name_he": league_name_he,
                "team_id": team_id,
                "team_name_en": team_name_en,
                "team_name_he": team_name_he_value,
                "record_count": len(flattened),
            }
        )

    return {
        "season": payload.season,
        "league": {"id": payload.league_id, "name_en": payload.league_name_en, "name_he": league_name_he},
        "team": {"id": payload.team_id, "name_en": payload.team_name_en, "name_he": team_name_he},
        "results": results,
    }


@app.get("/api/data/{data_type}")
def browse_data(
    data_type: str,
    season: int | None = Query(None, ge=min(settings.seasons), le=max(settings.seasons)),
    league_id: int | None = Query(None, gt=0),
    team_id: int | None = Query(None, gt=0),
    language: str = Query("he"),
) -> dict[str, Any]:
    if data_type not in {"fixtures", "player_stats", "standings"}:
        raise HTTPException(status_code=404, detail="Unknown data type.")

    language = validate_language(language)
    if data_type == "standings":
        team_id = None

    rows = list_table_data(data_type, season=season, league_id=league_id, team_id=team_id)
    return {"data_type": data_type, "language": language, "rows": build_table_preview(data_type, rows, language)}


@app.get("/api/editor/team")
def editor_team(
    season: int = Query(..., ge=min(settings.seasons), le=max(settings.seasons)),
    league_id: int = Query(..., gt=0),
    team_id: int = Query(..., gt=0),
) -> dict[str, Any]:
    try:
        teams = team_options(season=season, league_id=league_id, language="en")["teams"]
    except HTTPException:
        teams = list_cached_teams(season, league_id)
    base_team = next((team for team in teams if team["team_id"] == team_id), None)
    if base_team is None:
        raise HTTPException(status_code=404, detail="Team not found.")

    meta = get_team_meta(team_id)
    return {
        "team_id": team_id,
        "league_id": league_id,
        "season": season,
        "team_name_en": meta.get("team_name_en_override") if meta and meta.get("team_name_en_override") else base_team.get("team_name"),
        "team_name_he": meta.get("team_name_he_override") if meta and meta.get("team_name_he_override") else base_team.get("team_name_he"),
        "coach_name": meta.get("coach_name") if meta else None,
        "coach_title": meta.get("coach_title") if meta else None,
        "notes": meta.get("notes") if meta else None,
        "logo_path": meta.get("logo_path") if meta else None,
        "logo_url": build_photo_url(meta.get("logo_path")) if meta and meta.get("logo_path") else None,
    }


@app.put("/api/editor/team")
def save_team_meta(payload: TeamMetaRequest) -> dict[str, Any]:
    existing = get_team_meta(payload.team_id)
    upsert_team_meta(
        team_id=payload.team_id,
        league_id=payload.league_id,
        season=payload.season,
        team_name_en_override=payload.team_name_en_override,
        team_name_he_override=payload.team_name_he_override,
        coach_name=payload.coach_name,
        coach_title=payload.coach_title,
        notes=payload.notes,
        logo_path=existing.get("logo_path") if existing else None,
        updated_at=utc_now(),
    )
    return {"status": "saved", "team_id": payload.team_id}


@app.post("/api/editor/team-logo")
async def save_team_logo(
    team_id: int = Form(...),
    league_id: int | None = Form(None),
    season: int | None = Form(None),
    team_name_en_override: str | None = Form(None),
    team_name_he_override: str | None = Form(None),
    coach_name: str | None = Form(None),
    coach_title: str | None = Form(None),
    notes: str | None = Form(None),
    logo: UploadFile | None = File(None),
) -> dict[str, Any]:
    existing = get_team_meta(team_id)
    logo_path = existing.get("logo_path") if existing else None
    if logo and logo.filename:
        extension = Path(logo.filename).suffix or ".bin"
        filename = sanitize_filename(f"team_{team_id}_{utc_now().replace(':', '-').replace('.', '-')}{extension}")
        destination = settings.team_logos_dir / filename
        with destination.open("wb") as buffer:
            shutil.copyfileobj(logo.file, buffer)
        logo_path = str(destination)

    upsert_team_meta(
        team_id=team_id,
        league_id=league_id,
        season=season,
        team_name_en_override=team_name_en_override,
        team_name_he_override=team_name_he_override,
        coach_name=coach_name,
        coach_title=coach_title,
        notes=notes,
        logo_path=logo_path,
        updated_at=utc_now(),
    )
    return {"status": "saved", "team_id": team_id, "logo_url": build_photo_url(logo_path)}


@app.get("/api/editor/players")
def editor_players(
    season: int = Query(..., ge=min(settings.seasons), le=max(settings.seasons)),
    league_id: int = Query(..., gt=0),
    team_id: int = Query(..., gt=0),
) -> dict[str, Any]:
    players = build_editor_players(season, league_id, team_id)
    return {"season": season, "league_id": league_id, "team_id": team_id, "players": players, "has_player_stats": bool(players)}


@app.post("/api/editor/player")
async def save_player_meta(
    player_id: int = Form(...),
    team_id: int | None = Form(None),
    season: int | None = Form(None),
    league_id: int | None = Form(None),
    player_name_en_override: str | None = Form(None),
    player_name_he_override: str | None = Form(None),
    position_override: str | None = Form(None),
    jersey_number: str | None = Form(None),
    photo: UploadFile | None = File(None),
) -> dict[str, Any]:
    existing = get_player_meta(player_id)
    photo_path = existing.get("photo_path") if existing else None
    if photo and photo.filename:
        extension = Path(photo.filename).suffix or ".bin"
        filename = sanitize_filename(f"{player_id}_{utc_now().replace(':', '-').replace('.', '-')}{extension}")
        destination = settings.player_photos_dir / filename
        with destination.open("wb") as buffer:
            shutil.copyfileobj(photo.file, buffer)
        photo_path = str(destination)

    upsert_player_meta(
        player_id=player_id,
        team_id=team_id,
        season=season,
        league_id=league_id,
        player_name_en_override=player_name_en_override,
        player_name_he_override=player_name_he_override,
        position_override=position_override,
        jersey_number=jersey_number,
        photo_path=photo_path,
        updated_at=utc_now(),
    )
    return {"status": "saved", "player_id": player_id, "photo_url": build_photo_url(photo_path)}


@app.get("/api/editor/team-personnel")
def editor_team_personnel(
    season: int = Query(..., ge=min(settings.seasons), le=max(settings.seasons)),
    league_id: int = Query(..., gt=0),
    team_id: int = Query(..., gt=0),
) -> dict[str, Any]:
    personnel = [build_personnel_payload(item) for item in list_team_personnel(team_id, season=season, league_id=league_id)]
    return {"season": season, "league_id": league_id, "team_id": team_id, "members": personnel}


@app.post("/api/editor/team-personnel")
async def save_team_personnel(
    personnel_id: int | None = Form(None),
    team_id: int = Form(...),
    league_id: int | None = Form(None),
    season: int | None = Form(None),
    name_en: str | None = Form(None),
    name_he: str | None = Form(None),
    role_en: str | None = Form(None),
    role_he: str | None = Form(None),
    bio_en: str | None = Form(None),
    bio_he: str | None = Form(None),
    display_order: int = Form(0),
    photo: UploadFile | None = File(None),
) -> dict[str, Any]:
    existing = get_team_personnel(personnel_id) if personnel_id else None
    photo_path = existing.get("photo_path") if existing else None
    if photo and photo.filename:
        extension = Path(photo.filename).suffix or ".bin"
        filename = sanitize_filename(f"personnel_{team_id}_{utc_now().replace(':', '-').replace('.', '-')}{extension}")
        destination = settings.personnel_photos_dir / filename
        with destination.open("wb") as buffer:
            shutil.copyfileobj(photo.file, buffer)
        photo_path = str(destination)

    saved_id = upsert_team_personnel(
        personnel_id=personnel_id,
        team_id=team_id,
        league_id=league_id,
        season=season,
        name_en=name_en,
        name_he=name_he,
        role_en=role_en,
        role_he=role_he,
        bio_en=bio_en,
        bio_he=bio_he,
        photo_path=photo_path,
        display_order=display_order,
        updated_at=utc_now(),
    )
    return {"status": "saved", "personnel_id": saved_id, "photo_url": build_photo_url(photo_path)}


@app.delete("/api/editor/team-personnel/{personnel_id}")
def remove_team_personnel(personnel_id: int) -> dict[str, Any]:
    delete_team_personnel(personnel_id)
    return {"status": "deleted", "personnel_id": personnel_id}


@app.get("/api/editor/games")
def editor_games(
    season: int = Query(..., ge=min(settings.seasons), le=max(settings.seasons)),
    league_id: int = Query(..., gt=0),
    team_id: int = Query(..., gt=0),
    language: str = Query("he"),
) -> dict[str, Any]:
    language = validate_language(language)
    return {"season": season, "league_id": league_id, "team_id": team_id, "games": list_scope_fixtures(season, league_id, team_id, language)}


@app.get("/api/editor/game/{fixture_id}")
def editor_game(
    fixture_id: int,
    team_id: int = Query(..., gt=0),
    language: str = Query("he"),
) -> dict[str, Any]:
    language = validate_language(language)
    return build_game_payload(fixture_id, team_id, language)


@app.post("/api/editor/game-lineup")
def save_game_lineup(payload: GameAssignmentRequest) -> dict[str, Any]:
    lineup_status = validate_lineup_status(payload.lineup_status)
    position_group = validate_position_group(payload.position_group) or "unknown"
    upsert_game_player_assignment(
        fixture_id=payload.fixture_id,
        team_id=payload.team_id,
        player_id=payload.player_id,
        lineup_status=lineup_status,
        position_group=position_group,
        sort_order=payload.sort_order,
        updated_at=utc_now(),
    )
    return {"status": "saved", "fixture_id": payload.fixture_id, "player_id": payload.player_id}


@app.post("/api/editor/game-event")
def save_game_event_endpoint(
    event_id: int | None = Form(None),
    fixture_id: int = Form(...),
    team_id: int | None = Form(None),
    player_id: int | None = Form(None),
    related_player_id: int | None = Form(None),
    event_type: str = Form(...),
    minute: int | None = Form(None),
    extra_minute: int | None = Form(None),
    notes_en: str | None = Form(None),
    notes_he: str | None = Form(None),
) -> dict[str, Any]:
    event_type = validate_event_type(event_type)
    existing = get_game_event(event_id) if event_id else None
    saved_id = upsert_game_event(
        event_id=event_id,
        fixture_id=fixture_id,
        team_id=team_id,
        player_id=player_id,
        related_player_id=related_player_id,
        event_type=event_type,
        minute=minute,
        extra_minute=extra_minute,
        notes_en=notes_en,
        notes_he=notes_he,
        created_at=existing.get("created_at") if existing else utc_now(),
        updated_at=utc_now(),
    )
    return {"status": "saved", "event_id": saved_id}


@app.delete("/api/editor/game-event/{event_id}")
def remove_game_event(event_id: int) -> dict[str, Any]:
    delete_game_event(event_id)
    return {"status": "deleted", "event_id": event_id}


@app.get("/api/game/{fixture_id}")
def game_data(
    fixture_id: int,
    team_id: int | None = Query(None, gt=0),
    language: str = Query("he"),
) -> dict[str, Any]:
    language = validate_language(language)
    return build_game_payload(fixture_id, team_id, language)
