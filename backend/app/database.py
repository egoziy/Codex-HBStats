from __future__ import annotations

import json
import sqlite3
from contextlib import contextmanager
from typing import Any, Iterator

from .config import settings


DATA_TABLES = ("fixtures", "player_stats", "standings")
DATA_COLUMNS = (
    "season",
    "league_id",
    "league_name_en",
    "league_name_he",
    "team_id",
    "team_name_en",
    "team_name_he",
    "fetched_at",
    "record_count",
    "payload_en",
    "payload_he",
)


def init_db() -> None:
    with sqlite3.connect(settings.database_path) as conn:
        conn.row_factory = sqlite3.Row
        for table in DATA_TABLES:
            ensure_data_table_schema(conn, table)
        ensure_team_meta_table(conn)
        ensure_player_meta_table(conn)
        ensure_team_personnel_table(conn)
        ensure_game_events_table(conn)
        ensure_game_player_assignments_table(conn)
        conn.commit()


def ensure_data_table_schema(conn: sqlite3.Connection, table: str) -> None:
    columns = get_column_names(conn, table)
    if not columns:
        create_data_table(conn, table)
        return

    expected = set(DATA_COLUMNS)
    if expected.issubset(columns):
        return

    legacy_rows = conn.execute(f"SELECT * FROM {table}").fetchall()
    conn.execute(f"DROP TABLE IF EXISTS {table}_legacy")
    conn.execute(f"ALTER TABLE {table} RENAME TO {table}_legacy")
    create_data_table(conn, table)

    for row in legacy_rows:
        payload_en = extract_legacy_payload(row, "payload_en", "payload")
        payload_he = extract_legacy_payload(row, "payload_he", "payload")
        league_name_en = extract_legacy_value(row, "league_name_en", "league_name")
        team_name_en = extract_legacy_value(row, "team_name_en", "team_name")

        conn.execute(
            f"""
            INSERT INTO {table} (
                season, league_id, league_name_en, league_name_he, team_id, team_name_en, team_name_he,
                fetched_at, record_count, payload_en, payload_he
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row["season"],
                extract_legacy_value(row, "league_id"),
                league_name_en,
                extract_legacy_value(row, "league_name_he", "league_name") or league_name_en,
                extract_legacy_value(row, "team_id"),
                team_name_en,
                extract_legacy_value(row, "team_name_he", "team_name") or team_name_en,
                row["fetched_at"],
                row["record_count"],
                json.dumps(payload_en),
                json.dumps(payload_he),
            ),
        )
    conn.execute(f"DROP TABLE IF EXISTS {table}_legacy")


def create_data_table(conn: sqlite3.Connection, table: str) -> None:
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {table} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            season INTEGER NOT NULL,
            league_id INTEGER,
            league_name_en TEXT,
            league_name_he TEXT,
            team_id INTEGER,
            team_name_en TEXT,
            team_name_he TEXT,
            fetched_at TEXT NOT NULL,
            record_count INTEGER NOT NULL,
            payload_en TEXT NOT NULL,
            payload_he TEXT NOT NULL
        )
        """
    )
    conn.execute(
        f"""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_{table}_scope
        ON {table} (season, league_id, team_id)
        """
    )


def ensure_team_meta_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS team_meta (
            team_id INTEGER PRIMARY KEY,
            league_id INTEGER,
            season INTEGER,
            team_name_en_override TEXT,
            team_name_he_override TEXT,
            coach_name TEXT,
            coach_title TEXT,
            notes TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )
    ensure_columns(conn, "team_meta", {"logo_path": "TEXT"})


def ensure_player_meta_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS player_meta (
            player_id INTEGER PRIMARY KEY,
            team_id INTEGER,
            season INTEGER,
            league_id INTEGER,
            player_name_en_override TEXT,
            player_name_he_override TEXT,
            position_override TEXT,
            jersey_number TEXT,
            photo_path TEXT,
            updated_at TEXT NOT NULL
        )
        """
    )


def ensure_team_personnel_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS team_personnel (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            league_id INTEGER,
            season INTEGER,
            name_en TEXT,
            name_he TEXT,
            role_en TEXT,
            role_he TEXT,
            bio_en TEXT,
            bio_he TEXT,
            photo_path TEXT,
            display_order INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_team_personnel_scope
        ON team_personnel (team_id, season, league_id, display_order, id)
        """
    )


def ensure_game_events_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS game_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fixture_id INTEGER NOT NULL,
            team_id INTEGER,
            player_id INTEGER,
            related_player_id INTEGER,
            event_type TEXT NOT NULL,
            minute INTEGER,
            extra_minute INTEGER,
            notes_en TEXT,
            notes_he TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_game_events_scope
        ON game_events (fixture_id, team_id, minute, extra_minute, id)
        """
    )


def ensure_game_player_assignments_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS game_player_assignments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fixture_id INTEGER NOT NULL,
            team_id INTEGER NOT NULL,
            player_id INTEGER NOT NULL,
            lineup_status TEXT,
            position_group TEXT,
            sort_order INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_game_player_assignment_unique
        ON game_player_assignments (fixture_id, team_id, player_id)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_game_player_assignment_scope
        ON game_player_assignments (fixture_id, team_id, lineup_status, position_group, sort_order, player_id)
        """
    )


def get_column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return {row[1] for row in rows}


def ensure_columns(conn: sqlite3.Connection, table: str, columns: dict[str, str]) -> None:
    existing = get_column_names(conn, table)
    for column_name, column_type in columns.items():
        if column_name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column_name} {column_type}")


def extract_legacy_value(row: sqlite3.Row, *column_names: str) -> Any:
    for column_name in column_names:
        if column_name in row.keys():
            return row[column_name]
    return None


def extract_legacy_payload(row: sqlite3.Row, *column_names: str) -> Any:
    for column_name in column_names:
        if column_name in row.keys() and row[column_name]:
            return json.loads(row[column_name])
    return []


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(settings.database_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()


def has_scoped_data(table: str, season: int, league_id: int | None, team_id: int | None) -> bool:
    with get_connection() as conn:
        row = conn.execute(
            f"""
            SELECT 1
            FROM {table}
            WHERE season = ?
              AND league_id IS ?
              AND team_id IS ?
            """,
            (season, league_id, team_id),
        ).fetchone()
    return row is not None


def save_scoped_data(
    table: str,
    season: int,
    league_id: int | None,
    league_name_en: str | None,
    league_name_he: str | None,
    team_id: int | None,
    team_name_en: str | None,
    team_name_he: str | None,
    fetched_at: str,
    record_count: int,
    payload_en: Any,
    payload_he: Any,
) -> None:
    with get_connection() as conn:
        existing = conn.execute(
            f"""
            SELECT id
            FROM {table}
            WHERE season = ?
              AND league_id IS ?
              AND team_id IS ?
            """,
            (season, league_id, team_id),
        ).fetchone()

        serialized_en = json.dumps(payload_en)
        serialized_he = json.dumps(payload_he)
        if existing:
            conn.execute(
                f"""
                UPDATE {table}
                SET league_name_en = ?, league_name_he = ?, team_name_en = ?, team_name_he = ?,
                    fetched_at = ?, record_count = ?, payload_en = ?, payload_he = ?
                WHERE id = ?
                """,
                (
                    league_name_en,
                    league_name_he,
                    team_name_en,
                    team_name_he,
                    fetched_at,
                    record_count,
                    serialized_en,
                    serialized_he,
                    existing["id"],
                ),
            )
        else:
            conn.execute(
                f"""
                INSERT INTO {table} (
                    season, league_id, league_name_en, league_name_he, team_id, team_name_en, team_name_he,
                    fetched_at, record_count, payload_en, payload_he
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    season,
                    league_id,
                    league_name_en,
                    league_name_he,
                    team_id,
                    team_name_en,
                    team_name_he,
                    fetched_at,
                    record_count,
                    serialized_en,
                    serialized_he,
                ),
            )
        conn.commit()


def get_scoped_data(table: str, season: int, league_id: int | None, team_id: int | None) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute(
            f"""
            SELECT *
            FROM {table}
            WHERE season = ?
              AND league_id IS ?
              AND team_id IS ?
            """,
            (season, league_id, team_id),
        ).fetchone()
    return hydrate_data_row(row)


def list_table_data(
    table: str,
    season: int | None = None,
    league_id: int | None = None,
    team_id: int | None = None,
) -> list[dict[str, Any]]:
    clauses = []
    values: list[Any] = []

    if season is not None:
        clauses.append("season = ?")
        values.append(season)
    if league_id is not None:
        clauses.append("league_id = ?")
        values.append(league_id)
    if team_id is not None:
        clauses.append("team_id = ?")
        values.append(team_id)

    query = f"SELECT * FROM {table}"
    if clauses:
        query += " WHERE " + " AND ".join(clauses)
    query += " ORDER BY season DESC, league_name_en ASC, team_name_en ASC"

    with get_connection() as conn:
        rows = conn.execute(query, values).fetchall()
    return [hydrate_data_row(row) for row in rows if row is not None]


def hydrate_data_row(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {
        "id": row["id"],
        "season": row["season"],
        "league_id": row["league_id"],
        "league_name_en": row["league_name_en"],
        "league_name_he": row["league_name_he"],
        "team_id": row["team_id"],
        "team_name_en": row["team_name_en"],
        "team_name_he": row["team_name_he"],
        "fetched_at": row["fetched_at"],
        "record_count": row["record_count"],
        "payload_en": json.loads(row["payload_en"]),
        "payload_he": json.loads(row["payload_he"]),
    }


def upsert_team_meta(
    *,
    team_id: int,
    league_id: int | None,
    season: int | None,
    team_name_en_override: str | None,
    team_name_he_override: str | None,
    coach_name: str | None,
    coach_title: str | None,
    notes: str | None,
    logo_path: str | None,
    updated_at: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO team_meta (
                team_id, league_id, season, team_name_en_override, team_name_he_override,
                coach_name, coach_title, notes, logo_path, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(team_id) DO UPDATE SET
                league_id = excluded.league_id,
                season = excluded.season,
                team_name_en_override = excluded.team_name_en_override,
                team_name_he_override = excluded.team_name_he_override,
                coach_name = excluded.coach_name,
                coach_title = excluded.coach_title,
                notes = excluded.notes,
                logo_path = excluded.logo_path,
                updated_at = excluded.updated_at
            """,
            (
                team_id,
                league_id,
                season,
                team_name_en_override,
                team_name_he_override,
                coach_name,
                coach_title,
                notes,
                logo_path,
                updated_at,
            ),
        )
        conn.commit()


def get_team_meta(team_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM team_meta WHERE team_id = ?", (team_id,)).fetchone()
    return dict(row) if row else None


def get_team_meta_map(team_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not team_ids:
        return {}
    placeholders = ",".join("?" for _ in team_ids)
    with get_connection() as conn:
        rows = conn.execute(f"SELECT * FROM team_meta WHERE team_id IN ({placeholders})", team_ids).fetchall()
    return {row["team_id"]: dict(row) for row in rows}


def upsert_player_meta(
    *,
    player_id: int,
    team_id: int | None,
    season: int | None,
    league_id: int | None,
    player_name_en_override: str | None,
    player_name_he_override: str | None,
    position_override: str | None,
    jersey_number: str | None,
    photo_path: str | None,
    updated_at: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO player_meta (
                player_id, team_id, season, league_id, player_name_en_override, player_name_he_override,
                position_override, jersey_number, photo_path, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(player_id) DO UPDATE SET
                team_id = excluded.team_id,
                season = excluded.season,
                league_id = excluded.league_id,
                player_name_en_override = excluded.player_name_en_override,
                player_name_he_override = excluded.player_name_he_override,
                position_override = excluded.position_override,
                jersey_number = excluded.jersey_number,
                photo_path = excluded.photo_path,
                updated_at = excluded.updated_at
            """,
            (
                player_id,
                team_id,
                season,
                league_id,
                player_name_en_override,
                player_name_he_override,
                position_override,
                jersey_number,
                photo_path,
                updated_at,
            ),
        )
        conn.commit()


def get_player_meta(player_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM player_meta WHERE player_id = ?", (player_id,)).fetchone()
    return dict(row) if row else None


def get_player_meta_map(player_ids: list[int]) -> dict[int, dict[str, Any]]:
    if not player_ids:
        return {}
    placeholders = ",".join("?" for _ in player_ids)
    with get_connection() as conn:
        rows = conn.execute(f"SELECT * FROM player_meta WHERE player_id IN ({placeholders})", player_ids).fetchall()
    return {row["player_id"]: dict(row) for row in rows}


def list_cached_leagues(season: int) -> list[dict[str, Any]]:
    leagues: dict[int, dict[str, Any]] = {}
    with get_connection() as conn:
        for table in DATA_TABLES:
            rows = conn.execute(
                f"""
                SELECT DISTINCT league_id, league_name_en, league_name_he
                FROM {table}
                WHERE season = ?
                  AND league_id IS NOT NULL
                """,
                (season,),
            ).fetchall()
            for row in rows:
                leagues[row["league_id"]] = {
                    "league_id": row["league_id"],
                    "league_name": row["league_name_en"],
                    "league_name_he": row["league_name_he"] or row["league_name_en"],
                    "league_type": "Cached",
                    "country": "Israel",
                    "logo": None,
                }
    return sorted(leagues.values(), key=lambda item: (item["league_name"] or "", item["league_id"]))


def list_cached_teams(season: int, league_id: int) -> list[dict[str, Any]]:
    teams: dict[int, dict[str, Any]] = {}
    with get_connection() as conn:
        for table in DATA_TABLES:
            rows = conn.execute(
                f"""
                SELECT DISTINCT team_id, team_name_en, team_name_he
                FROM {table}
                WHERE season = ?
                  AND league_id = ?
                  AND team_id IS NOT NULL
                """,
                (season, league_id),
            ).fetchall()
            for row in rows:
                teams[row["team_id"]] = {
                    "team_id": row["team_id"],
                    "team_name": row["team_name_en"],
                    "team_name_he": row["team_name_he"] or row["team_name_en"],
                    "country": "Israel",
                    "founded": None,
                    "logo": None,
                    "venue_name": None,
                }
    return sorted(teams.values(), key=lambda item: (item["team_name"] or "", item["team_id"]))


def upsert_team_personnel(
    *,
    personnel_id: int | None,
    team_id: int,
    league_id: int | None,
    season: int | None,
    name_en: str | None,
    name_he: str | None,
    role_en: str | None,
    role_he: str | None,
    bio_en: str | None,
    bio_he: str | None,
    photo_path: str | None,
    display_order: int,
    updated_at: str,
) -> int:
    with get_connection() as conn:
        if personnel_id is None:
            cursor = conn.execute(
                """
                INSERT INTO team_personnel (
                    team_id, league_id, season, name_en, name_he, role_en, role_he,
                    bio_en, bio_he, photo_path, display_order, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    team_id,
                    league_id,
                    season,
                    name_en,
                    name_he,
                    role_en,
                    role_he,
                    bio_en,
                    bio_he,
                    photo_path,
                    display_order,
                    updated_at,
                ),
            )
            conn.commit()
            return int(cursor.lastrowid)

        conn.execute(
            """
            UPDATE team_personnel
            SET team_id = ?, league_id = ?, season = ?, name_en = ?, name_he = ?,
                role_en = ?, role_he = ?, bio_en = ?, bio_he = ?, photo_path = ?,
                display_order = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                team_id,
                league_id,
                season,
                name_en,
                name_he,
                role_en,
                role_he,
                bio_en,
                bio_he,
                photo_path,
                display_order,
                updated_at,
                personnel_id,
            ),
        )
        conn.commit()
        return personnel_id


def list_team_personnel(team_id: int, season: int | None = None, league_id: int | None = None) -> list[dict[str, Any]]:
    clauses = ["team_id = ?"]
    values: list[Any] = [team_id]
    if season is not None:
        clauses.append("season = ?")
        values.append(season)
    if league_id is not None:
        clauses.append("league_id = ?")
        values.append(league_id)

    query = "SELECT * FROM team_personnel WHERE " + " AND ".join(clauses) + " ORDER BY display_order ASC, id ASC"
    with get_connection() as conn:
        rows = conn.execute(query, values).fetchall()
    return [dict(row) for row in rows]


def get_team_personnel(personnel_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM team_personnel WHERE id = ?", (personnel_id,)).fetchone()
    return dict(row) if row else None


def delete_team_personnel(personnel_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM team_personnel WHERE id = ?", (personnel_id,))
        conn.commit()


def upsert_game_event(
    *,
    event_id: int | None,
    fixture_id: int,
    team_id: int | None,
    player_id: int | None,
    related_player_id: int | None,
    event_type: str,
    minute: int | None,
    extra_minute: int | None,
    notes_en: str | None,
    notes_he: str | None,
    created_at: str,
    updated_at: str,
) -> int:
    with get_connection() as conn:
        if event_id is None:
            cursor = conn.execute(
                """
                INSERT INTO game_events (
                    fixture_id, team_id, player_id, related_player_id, event_type, minute, extra_minute,
                    notes_en, notes_he, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    fixture_id,
                    team_id,
                    player_id,
                    related_player_id,
                    event_type,
                    minute,
                    extra_minute,
                    notes_en,
                    notes_he,
                    created_at,
                    updated_at,
                ),
            )
            conn.commit()
            return int(cursor.lastrowid)

        conn.execute(
            """
            UPDATE game_events
            SET fixture_id = ?, team_id = ?, player_id = ?, related_player_id = ?, event_type = ?,
                minute = ?, extra_minute = ?, notes_en = ?, notes_he = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                fixture_id,
                team_id,
                player_id,
                related_player_id,
                event_type,
                minute,
                extra_minute,
                notes_en,
                notes_he,
                updated_at,
                event_id,
            ),
        )
        conn.commit()
        return event_id


def list_game_events(fixture_id: int, team_id: int | None = None) -> list[dict[str, Any]]:
    clauses = ["fixture_id = ?"]
    values: list[Any] = [fixture_id]
    if team_id is not None:
        clauses.append("team_id = ?")
        values.append(team_id)

    query = """
        SELECT *
        FROM game_events
        WHERE """ + " AND ".join(clauses) + """
        ORDER BY
            COALESCE(minute, 999),
            COALESCE(extra_minute, 0),
            id
    """
    with get_connection() as conn:
        rows = conn.execute(query, values).fetchall()
    return [dict(row) for row in rows]


def get_game_event(event_id: int) -> dict[str, Any] | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM game_events WHERE id = ?", (event_id,)).fetchone()
    return dict(row) if row else None


def delete_game_event(event_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM game_events WHERE id = ?", (event_id,))
        conn.commit()


def upsert_game_player_assignment(
    *,
    fixture_id: int,
    team_id: int,
    player_id: int,
    lineup_status: str | None,
    position_group: str | None,
    sort_order: int,
    updated_at: str,
) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO game_player_assignments (
                fixture_id, team_id, player_id, lineup_status, position_group, sort_order, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(fixture_id, team_id, player_id) DO UPDATE SET
                lineup_status = excluded.lineup_status,
                position_group = excluded.position_group,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at
            """,
            (
                fixture_id,
                team_id,
                player_id,
                lineup_status,
                position_group,
                sort_order,
                updated_at,
            ),
        )
        conn.commit()


def list_game_player_assignments(fixture_id: int, team_id: int | None = None) -> list[dict[str, Any]]:
    clauses = ["fixture_id = ?"]
    values: list[Any] = [fixture_id]
    if team_id is not None:
        clauses.append("team_id = ?")
        values.append(team_id)

    query = """
        SELECT *
        FROM game_player_assignments
        WHERE """ + " AND ".join(clauses) + """
        ORDER BY team_id, lineup_status, position_group, sort_order, player_id
    """
    with get_connection() as conn:
        rows = conn.execute(query, values).fetchall()
    return [dict(row) for row in rows]
