from __future__ import annotations

from dataclasses import asdict, is_dataclass
from typing import Any

REDACTED = "[REDACTED]"
MAX_LIST_ITEMS = 50
SECRET_EXACT_KEYS = {
    "uid",
    "ltuid",
    "ltoken",
    "ltuid_v2",
    "ltoken_v2",
    "cookie_token",
    "cookie_token_v2",
    "account_id",
    "account_id_v2",
    "account_mid_v2",
    "authkey",
    "stoken",
    "mid",
    "ds",
    "session",
}


def sanitize_output(value: Any, key: str = "") -> Any:
    if isinstance(value, bool):
        return value

    if _is_secret_key(key):
        return REDACTED

    if value is None or isinstance(value, (int, float)):
        return value

    if isinstance(value, str):
        return REDACTED if _looks_sensitive(value) else value

    if is_dataclass(value):
        return sanitize_output(asdict(value), key)

    if isinstance(value, dict):
        return {str(k): sanitize_output(v, str(k)) for k, v in value.items()}

    if isinstance(value, (list, tuple, set)):
        items = list(value)
        sanitized = [sanitize_output(item, key) for item in items[:MAX_LIST_ITEMS]]
        if len(items) > MAX_LIST_ITEMS:
            sanitized.append({"__truncated": len(items) - MAX_LIST_ITEMS})
        return sanitized

    if hasattr(value, "dict") and callable(value.dict):
        return sanitize_output(value.dict(), key)

    if hasattr(value, "__dict__"):
        return sanitize_output(vars(value), key)

    return str(value)


def _is_secret_key(key: str) -> bool:
    normalized = key.lower().replace("-", "_")
    if "cookie" in normalized or "token" in normalized:
        return True
    return normalized in SECRET_EXACT_KEYS


def _looks_sensitive(value: str) -> bool:
    lowered = value.lower()
    return any(
        marker in lowered
        for marker in (
            "ltoken=",
            "ltuid=",
            "cookie_token",
            "account_id",
            "stoken=",
            "mid=",
        )
    )
