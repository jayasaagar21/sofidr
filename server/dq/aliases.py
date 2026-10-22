"""Canonical value maps for categorical standardization.

Inspired by common data-quality practice (ISO-style country crosswalks,
synonym collapse for booleans/status). Used by human-facing cleaning so
US / USA / United States resolve to one label.
"""

from __future__ import annotations

import re
import unicodedata

# Canonical English short names (readable in downloads). Aliases → canonical.
COUNTRY_CANONICAL: dict[str, str] = {
    # United States
    "us": "United States",
    "u.s": "United States",
    "u.s.": "United States",
    "usa": "United States",
    "u.s.a": "United States",
    "u.s.a.": "United States",
    "united states": "United States",
    "united states of america": "United States",
    "united states of america.": "United States",
    "america": "United States",
    "the united states": "United States",
    "the us": "United States",
    "the usa": "United States",
    # United Kingdom
    "uk": "United Kingdom",
    "u.k": "United Kingdom",
    "u.k.": "United Kingdom",
    "gb": "United Kingdom",
    "gbr": "United Kingdom",
    "great britain": "United Kingdom",
    "united kingdom": "United Kingdom",
    "england": "United Kingdom",
    "scotland": "United Kingdom",
    "wales": "United Kingdom",
    # Others commonly fragmented
    "uae": "United Arab Emirates",
    "u.a.e": "United Arab Emirates",
    "u.a.e.": "United Arab Emirates",
    "united arab emirates": "United Arab Emirates",
    "korea": "South Korea",
    "south korea": "South Korea",
    "republic of korea": "South Korea",
    "north korea": "North Korea",
    "russia": "Russia",
    "russian federation": "Russia",
    "vietnam": "Vietnam",
    "viet nam": "Vietnam",
    "czech republic": "Czechia",
    "czechia": "Czechia",
    "holland": "Netherlands",
    "the netherlands": "Netherlands",
    "netherlands": "Netherlands",
    "brasil": "Brazil",
    "brazil": "Brazil",
    "ivory coast": "Côte d'Ivoire",
    "cote divoire": "Côte d'Ivoire",
    "cote d'ivoire": "Côte d'Ivoire",
    "côte d'ivoire": "Côte d'Ivoire",
    "turkiye": "Turkey",
    "turkey": "Turkey",
    "deutschland": "Germany",
    "germany": "Germany",
    "france": "France",
    "canada": "Canada",
    "mexico": "Mexico",
    "méxico": "Mexico",
    "india": "India",
    "china": "China",
    "prc": "China",
    "japan": "Japan",
    "australia": "Australia",
    "new zealand": "New Zealand",
    "nz": "New Zealand",
    "singapore": "Singapore",
    "south africa": "South Africa",
    "rsa": "South Africa",
}

BOOL_CANONICAL: dict[str, str] = {
    "y": "Yes",
    "yes": "Yes",
    "true": "Yes",
    "t": "Yes",
    "1": "Yes",
    "n": "No",
    "no": "No",
    "false": "No",
    "f": "No",
    "0": "No",
}

STATUS_CANONICAL: dict[str, str] = {
    "active": "Active",
    "inactive": "Inactive",
    "pending": "Pending",
    "approved": "Approved",
    "rejected": "Rejected",
    "complete": "Completed",
    "completed": "Completed",
    "done": "Completed",
    "cancelled": "Cancelled",
    "canceled": "Cancelled",
}


def normalize_key(value: str) -> str:
    """Lowercase, strip accents/punctuation for alias lookup."""
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.strip().lower()
    text = re.sub(r"[^\w\s.]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    # Collapse "u s a" style splits after punctuation removal
    text = text.replace(" . ", ".")
    return text


def canonicalize_country(value: str) -> str | None:
    key = normalize_key(value)
    if key in COUNTRY_CANONICAL:
        return COUNTRY_CANONICAL[key]
    # Compact form without spaces/dots: "u.s.a." → "usa"
    compact = re.sub(r"[\s.]+", "", key)
    return COUNTRY_CANONICAL.get(compact)


def looks_like_country_column(name: str, samples: list[str]) -> bool:
    key = re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
    if any(token in key for token in ("country", "nation", "region", "geo", "location")):
        return True
    if not samples:
        return False
    hits = sum(1 for s in samples if canonicalize_country(s) is not None)
    return hits / max(len(samples), 1) >= 0.25
