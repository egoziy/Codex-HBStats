from __future__ import annotations

import re
from typing import Any

from deep_translator import GoogleTranslator


URL_RE = re.compile(r"^https?://", re.IGNORECASE)
ISOISH_RE = re.compile(r"^[0-9:\-+TZ./ ]+$")
HEBREW_OVERRIDES = {
    "Ligat Ha'al": "ליגת העל",
    "Liga Leumit": "הליגה הלאומית",
    "Liga Alef": "ליגה א'",
    "State Cup": "גביע המדינה",
    "Toto Cup Ligat Al": "גביע הטוטו לליגת העל",
    "Super Cup": "אלוף האלופים",
    "Hapoel Beer Sheva": "הפועל באר שבע",
}


class TranslationService:
    def __init__(self) -> None:
        self.translator = GoogleTranslator(source="auto", target="iw")
        self.cache: dict[str, str] = {}

    def translate_text(self, value: str | None) -> str | None:
        if value is None:
            return None

        text = value.strip()
        if not text:
            return value
        if text in HEBREW_OVERRIDES:
            self.cache[text] = HEBREW_OVERRIDES[text]
            return self.cache[text]
        if text in self.cache:
            return self.cache[text]
        if not self._should_translate(text):
            self.cache[text] = value
            return value

        try:
            translated = self.translator.translate(text)
        except Exception:
            translated = value

        self.cache[text] = translated or value
        return self.cache[text]

    def translate_payload(self, payload: Any) -> Any:
        if isinstance(payload, dict):
            return {key: self.translate_payload(value) for key, value in payload.items()}
        if isinstance(payload, list):
            return [self.translate_payload(item) for item in payload]
        if isinstance(payload, str):
            return self.translate_text(payload)
        return payload

    def translate_options(self, rows: list[dict[str, Any]], english_key: str, hebrew_key: str) -> list[dict[str, Any]]:
        translated_rows = []
        for row in rows:
            localized = dict(row)
            localized[hebrew_key] = self.translate_text(str(row.get(english_key, "")).strip()) if row.get(english_key) else None
            translated_rows.append(localized)
        return translated_rows

    @staticmethod
    def _should_translate(text: str) -> bool:
        if URL_RE.match(text):
            return False
        if ISOISH_RE.match(text):
            return False
        if "@" in text or "\\" in text or "/" in text:
            return False
        return any("a" <= char.lower() <= "z" for char in text)
