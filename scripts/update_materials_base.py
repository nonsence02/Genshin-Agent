"""Scrape material metadata from English Genshin Impact Fandom Wiki into JSON files."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote, unquote


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DICTIONARY_PATH = PROJECT_ROOT / "data" / "raw" / "dictionary.json"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "knowledge_base" / "materials"
FANDOM_BASE_URL = "https://genshin-impact.fandom.com/wiki"
DAYS_OF_WEEK = ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")


class WikiClient:
    def __init__(self, timeout: float = 30.0) -> None:
        self._cloudscraper = self._load_cloudscraper()
        self.session = self._create_session()
        self.timeout = timeout

    def _load_cloudscraper(self) -> Any:
        try:
            import cloudscraper
        except ImportError as exc:
            raise RuntimeError("Install `cloudscraper` first: pip install cloudscraper") from exc
        return cloudscraper

    def _create_session(self) -> Any:
        session = self._cloudscraper.create_scraper(
            browser={"browser": "chrome", "platform": "windows", "desktop": True}
        )
        session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,ru;q=0.7",
                "Connection": "keep-alive",
            }
        )
        return session

    def get_soup(self, url: str) -> Any:
        try:
            from bs4 import BeautifulSoup
        except ImportError as exc:
            raise RuntimeError("Install `beautifulsoup4` first: pip install beautifulsoup4") from exc

        last_error: Exception | None = None
        for attempt in range(3):
            try:
                response = self.session.get(url, timeout=self.timeout)
                if response.status_code == 403 and attempt < 2:
                    self.session = self._create_session()
                    time.sleep(1.5)
                    continue
                response.raise_for_status()
                return BeautifulSoup(response.text, "html.parser")
            except Exception as exc:  # noqa: BLE001 - keep scraper resilient against Cloudflare hiccups.
                last_error = exc
                if attempt < 2:
                    self.session = self._create_session()
                    time.sleep(1.5)
                    continue
                raise
        raise RuntimeError(f"Failed to fetch {url}") from last_error


def main() -> int:
    args = parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    material_names = load_material_names(args.dictionary)
    pending = [name for name in material_names if not (args.output_dir / f"{slug_from_title(name)}.json").exists()]
    if args.limit > 0:
        pending = pending[: args.limit]

    print(f"Loaded {len(material_names)} material name(s) from {args.dictionary}")
    print(f"Pending this run: {len(pending)}. Output: {args.output_dir}")

    client = WikiClient(timeout=args.timeout)
    for index, name in enumerate(pending, start=1):
        url = fandom_url_for_title(name)
        print(f"[{index}/{len(pending)}] {name} -> {url}")
        try:
            soup = client.get_soup(url)
            data = parse_material_page(name, url, soup)
            output_path = args.output_dir / f"{data['id']}.json"
            output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"  OK: {output_path.name}")
        except Exception as exc:  # noqa: BLE001 - continue batch and keep already written files.
            print(f"  ERROR: {exc}", file=sys.stderr)
        time.sleep(args.sleep)

    print("Done.")
    return 0


def load_material_names(path: Path) -> list[str]:
    if not path.exists():
        raise FileNotFoundError(f"Dictionary JSON not found: {path}")
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"Dictionary JSON must be an object: {path}")
    return sorted((str(key) for key in data if key), key=str.casefold)


def parse_material_page(name_en: str, url: str, soup: Any) -> dict[str, Any]:
    infobox = soup.select_one("aside.portable-infobox, .portable-infobox, .pi-theme-genshin")
    item_type = extract_item_type(infobox) if infobox else ""
    days = extract_days(infobox) if infobox else []
    source = extract_source(infobox) if infobox else []

    if not source:
        source = extract_source_from_body(soup)
    if not days:
        days = extract_days_from_text(infobox.get_text(" ", strip=True) if infobox else "")

    return {
        "id": slug_from_title(name_en),
        "name_en": name_en,
        "type": item_type,
        "days": days,
        "source": source,
        "source_url": url,
    }


def extract_item_type(infobox: Any) -> str:
    for label in ("Item Type", "Type", "Item Group"):
        value = find_infobox_value(infobox, label)
        if value:
            return strip_label(value, label)
    data_source_value = find_data_source_value(infobox, ("type", "item-type", "itemType"))
    return data_source_value


def extract_days(infobox: Any) -> list[str]:
    values: list[str] = []
    for label in ("Days of the Week", "Day", "Available"):
        value = find_infobox_value(infobox, label)
        if value:
            values.extend(extract_days_from_text(value))
    data_source_value = find_data_source_value(infobox, ("days", "day", "availability"))
    if data_source_value:
        values.extend(extract_days_from_text(data_source_value))
    return ordered_unique(values)


def extract_source(infobox: Any) -> list[str]:
    values: list[str] = []
    for label in ("How to Obtain", "Source", "Sources", "Dropped By"):
        value = find_infobox_value(infobox, label)
        if value:
            values.extend(split_source_text(strip_label(value, label)))
    for data_source in ("obtain", "source", "sources", "drop", "dropped-by"):
        value = find_data_source_value(infobox, (data_source,))
        if value:
            values.extend(split_source_text(value))
    return ordered_unique(values)


def find_infobox_value(infobox: Any, label: str) -> str:
    label_folded = label.casefold()
    for item in infobox.select(".pi-item.pi-data, [data-source]"):
        label_node = item.select_one(".pi-data-label")
        item_label = normalize_space(label_node.get_text(" ", strip=True)) if label_node else ""
        if label_folded in item_label.casefold():
            value_node = item.select_one(".pi-data-value")
            source = value_node or item
            return normalize_space(source.get_text(" ", strip=True))
    return ""


def find_data_source_value(infobox: Any, data_sources: Iterable[str]) -> str:
    for data_source in data_sources:
        node = infobox.select_one(f'[data-source="{data_source}"]')
        if node:
            value_node = node.select_one(".pi-data-value")
            source = value_node or node
            return normalize_space(source.get_text(" ", strip=True))
    return ""


def extract_source_from_body(soup: Any) -> list[str]:
    heading = find_heading(soup, ("how to obtain", "source", "sources", "obtained from"))
    if not heading:
        return []
    values: list[str] = []
    for node in iter_until_next_heading(heading):
        if getattr(node, "name", None) not in {"p", "ul", "ol", "table", "div"}:
            continue
        text = normalize_space(node.get_text(" ", strip=True))
        if text:
            values.extend(split_source_text(text))
    return ordered_unique(values)


def split_source_text(value: str) -> list[str]:
    text = normalize_space(value)
    if not text:
        return []
    text = re.sub(r"\bSource[s]?\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\bHow to Obtain\b", " ", text, flags=re.IGNORECASE)
    parts = re.split(r"\s*(?:\n|;|\u2022|•)\s*", text)
    cleaned: list[str] = []
    for part in parts:
        candidate = normalize_space(part)
        if not candidate:
            continue
        if len(candidate) > 180:
            candidate = candidate[:180].rsplit(" ", 1)[0].rstrip() + "..."
        cleaned.append(candidate)
    return cleaned


def extract_days_from_text(value: str) -> list[str]:
    found = []
    for day in DAYS_OF_WEEK:
        if re.search(rf"\b{re.escape(day)}\b", value, flags=re.IGNORECASE):
            found.append(day)
    return found


def find_heading(soup: Any, keywords: Iterable[str]) -> Any | None:
    for heading in soup.select("h2, h3, h4"):
        text = normalize_space(heading.get_text(" ", strip=True)).casefold()
        if any(keyword in text for keyword in keywords):
            return heading
    return None


def iter_until_next_heading(heading: Any) -> Iterable[Any]:
    current_level = int(heading.name[1]) if getattr(heading, "name", "").startswith("h") else 2
    for sibling in heading.find_all_next():
        name = getattr(sibling, "name", "")
        if name in {"h2", "h3", "h4"} and int(name[1]) <= current_level:
            break
        yield sibling


def fandom_url_for_title(title: str) -> str:
    wiki_title = title.replace(" ", "_")
    return f"{FANDOM_BASE_URL}/{quote(wiki_title, safe='_()%-')}"


def slug_from_title(title: str) -> str:
    decoded = unquote(title).replace("_", " ")
    slug = re.sub(r"[\s_]+", "-", decoded).strip("-").casefold()
    slug = re.sub(r"[^a-z0-9-]+", "", slug)
    return re.sub(r"-{2,}", "-", slug).strip("-") or "unknown"


def strip_label(value: str, label: str) -> str:
    return normalize_space(re.sub(rf"^{re.escape(label)}\s*", "", value, flags=re.IGNORECASE))


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def ordered_unique(values: Iterable[str]) -> list[str]:
    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = normalize_space(value)
        if not normalized or normalized in seen:
            continue
        unique.append(normalized)
        seen.add(normalized)
    return unique


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape material metadata from Genshin Fandom into JSON.")
    parser.add_argument("--dictionary", type=Path, default=DEFAULT_DICTIONARY_PATH, help="English->Russian dictionary JSON.")
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR, help="Material JSON output directory.")
    parser.add_argument("--limit", type=int, default=5, help="Limit materials parsed in this run. 0 means all.")
    parser.add_argument("--sleep", type=float, default=1.0, help="Delay between Wiki requests.")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP request timeout.")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
