from __future__ import annotations

from dataclasses import dataclass
import time
from typing import Any

import requests

from ..config import settings


class ApiFootballError(Exception):
    pass


@dataclass
class TeamContext:
    team_id: int
    team_name: str


class ApiFootballClient:
    def __init__(self) -> None:
        self.base_url = settings.api_base_url.rstrip("/")
        self.session = requests.Session()
        self.session.headers.update(self._build_headers())

    def ensure_configured(self) -> None:
        if not settings.api_key:
            raise ApiFootballError("Missing API_FOOTBALL_KEY in .env")
        if "rapidapi.com" in self.base_url and not settings.api_host:
            raise ApiFootballError("Missing API_FOOTBALL_HOST in .env for RapidAPI usage")

    def _build_headers(self) -> dict[str, str]:
        if "rapidapi.com" in self.base_url:
            return {
                "x-rapidapi-key": settings.api_key,
                "x-rapidapi-host": settings.api_host,
            }
        return {"x-apisports-key": settings.api_key}

    def _get(self, path: str, params: dict[str, Any], attempt: int = 1) -> dict[str, Any]:
        self.ensure_configured()
        response = self.session.get(f"{self.base_url}{path}", params=params, timeout=30)
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            raise ApiFootballError(f"API request failed: {response.status_code} {response.text}") from exc

        data = response.json()
        if isinstance(data, dict) and data.get("errors"):
            if "page" in params and self._page_param_not_supported(data["errors"]):
                retry_params = {key: value for key, value in params.items() if key != "page"}
                return self._get(path, retry_params, attempt=attempt)
            if self._is_rate_limited(data["errors"]) and attempt == 1:
                time.sleep(65)
                return self._get(path, params, attempt=2)
            raise ApiFootballError(f"API returned errors: {data['errors']}")
        return data

    def find_team_by_name(self, team_name: str) -> TeamContext:
        data = self._get("/teams", {"search": team_name})
        responses = data.get("response", [])
        if not responses:
            raise ApiFootballError(f"Could not find team with search term '{team_name}'")

        normalized_search = self._normalize_name(team_name)
        exact_match = None
        for item in responses:
            candidate = item.get("team", {}).get("name", "")
            normalized_candidate = self._normalize_name(candidate)
            if normalized_candidate == normalized_search:
                exact_match = item
                break

        match = exact_match or responses[0]
        team = match.get("team", {})
        return TeamContext(team_id=team["id"], team_name=team["name"])

    def list_leagues(self, season: int) -> list[dict[str, Any]]:
        data = self._get("/leagues", {"season": season, "country": "Israel"})
        leagues: list[dict[str, Any]] = []
        seen_ids: set[int] = set()
        for item in data.get("response", []):
            league = item.get("league", {})
            league_id = league.get("id")
            if not league_id or league_id in seen_ids:
                continue
            if league.get("type") not in {"League", "Cup"}:
                continue
            seen_ids.add(league_id)
            leagues.append(
                {
                    "league_id": league_id,
                    "league_name": league.get("name"),
                    "league_type": league.get("type"),
                    "country": item.get("country", {}).get("name"),
                    "logo": league.get("logo"),
                }
            )
        leagues.sort(key=lambda item: (item["league_name"] or "", item["league_id"]))
        return leagues

    def list_teams(self, league_id: int, season: int) -> list[dict[str, Any]]:
        data = self._get("/teams", {"league": league_id, "season": season})
        teams = []
        for item in data.get("response", []):
            team = item.get("team", {})
            venue = item.get("venue", {})
            teams.append(
                {
                    "team_id": team.get("id"),
                    "team_name": team.get("name"),
                    "country": team.get("country"),
                    "founded": team.get("founded"),
                    "logo": team.get("logo"),
                    "venue_name": venue.get("name"),
                }
            )
        teams.sort(key=lambda item: (item["team_name"] or "", item["team_id"] or 0))
        return teams

    def fetch_fixtures(self, team_id: int, season: int, league_id: int | None = None) -> list[dict[str, Any]]:
        page = 1
        all_rows: list[dict[str, Any]] = []
        while True:
            params: dict[str, Any] = {"team": team_id, "season": season, "page": page}
            if league_id is not None:
                params["league"] = league_id
            data = self._get("/fixtures", params)
            rows = data.get("response", [])
            all_rows.extend(rows)
            paging = data.get("paging", {}) or {}
            if page >= int(paging.get("total", 1)):
                break
            if "page" not in params or not paging:
                break
            page += 1
        return all_rows

    def fetch_players(self, team_id: int, season: int, league_id: int | None = None) -> list[dict[str, Any]]:
        page = 1
        all_rows: list[dict[str, Any]] = []
        while True:
            params: dict[str, Any] = {"team": team_id, "season": season, "page": page}
            if league_id is not None:
                params["league"] = league_id
            data = self._get("/players", params)
            rows = data.get("response", [])
            all_rows.extend(rows)
            paging = data.get("paging", {}) or {}
            if page >= int(paging.get("total", 1)):
                break
            if "page" not in params or not paging:
                break
            page += 1
        return all_rows

    def fetch_standings(self, league_id: int, season: int) -> list[dict[str, Any]]:
        data = self._get("/standings", {"league": league_id, "season": season})
        return data.get("response", [])

    @staticmethod
    def _normalize_name(value: str) -> str:
        lowered = value.lower().replace("'", "")
        return "".join(ch for ch in lowered if ch.isalnum() or ch.isspace()).strip()

    @staticmethod
    def _page_param_not_supported(errors: Any) -> bool:
        if not isinstance(errors, dict):
            return False
        page_error = errors.get("page")
        if not page_error:
            return False
        return "do not exist" in str(page_error).lower()

    @staticmethod
    def _is_rate_limited(errors: Any) -> bool:
        if not isinstance(errors, dict):
            return False
        return "ratelimit" in "".join(str(key).lower() for key in errors.keys())
