"""Scrape character lore and combat metadata from English Genshin Impact Fandom Wiki."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DICTIONARY_PATH = PROJECT_ROOT / "data" / "raw" / "dictionary.json"
DEFAULT_CHARACTER_DIR = PROJECT_ROOT / "knowledge_base" / "characters"
DEFAULT_OUTPUT_DIR = PROJECT_ROOT / "knowledge_base" / "character_lore"
FANDOM_BASE_URL = "https://genshin-impact.fandom.com/wiki"
TALENT_KEYS = {
    "normal attack": "normal_attack",
    "elemental skill": "elemental_skill",
    "elemental burst": "elemental_burst",
}


@dataclass(frozen=True)
class CharacterCandidate:
    character_id: str
    name_en: str

    @property
    def url(self) -> str:
        return fandom_url_for_title(self.name_en)


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
            except Exception as exc:  # noqa: BLE001 - Fandom/Cloudflare can be noisy.
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

    candidates = load_character_candidates(args.dictionary, args.character_dir)
    pending = [
        candidate for candidate in candidates if not (args.output_dir / f"{candidate.character_id}.json").exists()
    ]
    if args.limit > 0:
        pending = pending[: args.limit]

    print(f"Loaded {len(candidates)} character candidate(s). Pending this run: {len(pending)}.")
    print(f"Output: {args.output_dir}")

    client = WikiClient(timeout=args.timeout)
    for index, candidate in enumerate(pending, start=1):
        print(f"[{index}/{len(pending)}] {candidate.name_en} -> {candidate.url}")
        try:
            soup = client.get_soup(candidate.url)
            data = parse_character_page(candidate, soup)
            output_path = args.output_dir / f"{candidate.character_id}.json"
            output_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"  OK: {output_path.name}")
        except Exception as exc:  # noqa: BLE001 - batch scraping should continue.
            print(f"  ERROR: {exc}", file=sys.stderr)
        time.sleep(args.sleep)

    print("Done.")
    return 0


def load_character_candidates(dictionary_path: Path, character_dir: Path) -> list[CharacterCandidate]:
    existing = load_existing_character_names(character_dir)
    candidates: dict[str, CharacterCandidate] = {}

    if dictionary_path.exists():
        data = json.loads(dictionary_path.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            for english_name in data:
                character_id = slug_from_title(str(english_name))
                if character_id in existing:
                    candidates[character_id] = CharacterCandidate(character_id, str(english_name))

    for character_id, name_en in existing.items():
        candidates.setdefault(character_id, CharacterCandidate(character_id, name_en))

    return sorted(candidates.values(), key=lambda item: item.character_id)


def load_existing_character_names(character_dir: Path) -> dict[str, str]:
    if not character_dir.exists():
        raise FileNotFoundError(f"Character KB directory not found: {character_dir}")

    names: dict[str, str] = {}
    for path in character_dir.glob("*.json"):
        character_id = path.stem
        name_en = title_from_slug(character_id)
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            data = {}
        if isinstance(data, dict) and data.get("name"):
            name_en = str(data["name"])
        names[character_id] = name_en
    return names


def parse_character_page(candidate: CharacterCandidate, soup: Any) -> dict[str, Any]:
    infobox = select_character_infobox(soup)
    combat_talents = extract_combat_talents(soup)

    return {
        "id": candidate.character_id,
        "name_en": candidate.name_en,
        "element": extract_infobox_field(infobox, "Element") if infobox else "",
        "weapon": extract_infobox_field(infobox, "Weapon") if infobox else "",
        "region": extract_infobox_field(infobox, "Region") if infobox else "",
        "rarity": extract_rarity(infobox) if infobox else None,
        "description": extract_description(soup),
        "combat_talents": combat_talents,
        "source_url": candidate.url,
    }


def select_character_infobox(soup: Any) -> Any | None:
    boxes = soup.select("aside.portable-infobox, .portable-infobox, .pi-theme-genshin")
    for box in boxes:
        if box.select_one('[data-source="weapon"]') and box.select_one('[data-source="element"]'):
            return box
    return boxes[0] if boxes else None


def extract_infobox_field(infobox: Any, label: str) -> str:
    data_source = label.casefold().replace(" ", "-")
    value = find_data_source_value(infobox, (data_source, label.casefold()))
    if value:
        return strip_label(value, label)
    value = find_infobox_value(infobox, label)
    return strip_label(value, label)


def extract_rarity(infobox: Any) -> int | None:
    value = find_data_source_value(infobox, ("rarity", "quality"))
    match = re.search(r"[45]", value)
    if match:
        return int(match.group(0))

    value = find_infobox_value(infobox, "Rarity")
    match = re.search(r"[45]", value)
    return int(match.group(0)) if match else None


def extract_description(soup: Any) -> str:
    quote = soup.select_one(".mw-parser-output blockquote, .mw-parser-output .quote")
    if quote:
        text = clean_description_text(quote.get_text(" ", strip=True))
        if text:
            return text

    content = soup.select_one(".mw-parser-output")
    if not content:
        return ""
    for paragraph in content.find_all("p", recursive=False):
        text = clean_description_text(paragraph.get_text(" ", strip=True))
        if len(text) >= 40:
            return text
    for paragraph in content.find_all("p"):
        text = clean_description_text(paragraph.get_text(" ", strip=True))
        if len(text) >= 40:
            return text
    return ""


def extract_combat_talents(soup: Any) -> dict[str, str]:
    talents = {"normal_attack": "", "elemental_skill": "", "elemental_burst": ""}
    talents.update(extract_talents_from_tables(soup))

    for phrase, key in TALENT_KEYS.items():
        if not talents[key]:
            talents[key] = heuristic_find_talent_description(soup, phrase)

    return talents


def extract_talents_from_tables(soup: Any) -> dict[str, str]:
    talents: dict[str, str] = {}
    tables = soup.select("table.talent_table, table.talent-table")
    if not tables:
        tables = [
            table
            for table in soup.select("table.wikitable")
            if any(phrase in table.get_text(" ", strip=True).casefold() for phrase in TALENT_KEYS)
        ]

    for table in tables:
        current_key = ""
        for row in direct_table_rows(table):
            text = normalize_space(row.get_text(" ", strip=True))
            folded = text.casefold()
            for phrase, key in TALENT_KEYS.items():
                if phrase in folded:
                    current_key = key
                    break
            if not current_key or talents.get(current_key):
                continue
            description = extract_description_from_row(row)
            if description:
                talents[current_key] = description
                current_key = ""
    return talents


def extract_description_from_row(row: Any) -> str:
    cells = row.find_all(["td", "th"], recursive=False)
    for cell in reversed(cells):
        for table in cell.find_all("table"):
            table.decompose()
        text = clean_talent_text(cell.get_text(" ", strip=True))
        if is_talent_description(text):
            return truncate_text(text, 900)
    return ""


def heuristic_find_talent_description(soup: Any, phrase: str) -> str:
    phrase_folded = phrase.casefold()
    talent_root = find_heading(soup, ("combat talents", "talents")) or soup
    search_area = list(iter_section_siblings(talent_root)) if talent_root is not soup else [soup]

    for root in search_area:
        for marker in root.find_all(["h2", "h3", "h4", "h5", "b", "strong", "td", "th"]):
            text = normalize_space(marker.get_text(" ", strip=True))
            if phrase_folded not in text.casefold():
                continue
            description = find_following_description(marker)
            if description:
                return truncate_text(description, 900)
    return ""


def find_following_description(marker: Any) -> str:
    for node in marker.find_all_next(["p", "td", "div", "li"], limit=30):
        if node.find_parent("table", class_=re.compile(r"skill|attribute|scaling", re.I)):
            continue
        text = clean_talent_text(node.get_text(" ", strip=True))
        if is_talent_description(text):
            return text
    return ""


def direct_table_rows(table: Any) -> list[Any]:
    rows: list[Any] = []
    for child in table.find_all("tr"):
        if child.find_parent("table") is table:
            rows.append(child)
    return rows


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
        for node in infobox.select(f'[data-source="{data_source}"]'):
            value_node = node.select_one(".pi-data-value")
            source = value_node or node
            text = normalize_space(source.get_text(" ", strip=True))
            if text and text.casefold() != data_source.replace("-", " ").casefold():
                return text
            for image in source.select("img"):
                alt_text = image.get("alt") or image.get("title") or ""
                alt_text = normalize_space(alt_text)
                if alt_text:
                    return alt_text
            for link in source.select("a"):
                link_text = normalize_space(link.get_text(" ", strip=True) or link.get("title") or "")
                if link_text and link_text.casefold() != data_source.replace("-", " ").casefold():
                    return link_text
    return ""


def find_heading(soup: Any, names: Iterable[str]) -> Any | None:
    wanted = tuple(name.casefold() for name in names)
    for heading in soup.find_all(["h2", "h3", "h4"]):
        text = normalize_space(heading.get_text(" ", strip=True)).casefold()
        if any(name in text for name in wanted):
            return heading
    for span in soup.find_all(id=True):
        text = normalize_space(str(span.get("id", ""))).replace("_", " ").casefold()
        if any(name in text for name in wanted):
            return span.find_parent(["h2", "h3", "h4"]) or span
    return None


def iter_section_siblings(heading: Any) -> Iterable[Any]:
    for node in heading.find_all_next():
        if getattr(node, "name", None) in {"h2", "h3"} and node is not heading:
            break
        yield node


def clean_description_text(value: str) -> str:
    text = normalize_space(value)
    text = re.sub(r"\[[^\]]+\]", "", text)
    return normalize_space(text)


def clean_talent_text(value: str) -> str:
    text = normalize_space(value)
    text = re.sub(r"\[[^\]]+\]", "", text)
    text = re.sub(r"\bLevel\s+\d+.*", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\bUpgrade Preview\b.*", "", text, flags=re.IGNORECASE)
    if "%" in text:
        text = re.sub(r"\b[\d.]+%\b", "", text)
    return normalize_space(text)


def is_talent_description(text: str) -> bool:
    if len(text) < 40:
        return False
    folded = text.casefold()
    reject_markers = (
        "attribute scaling",
        "dmg%",
        "cooldown",
        "energy cost",
        "frames",
        "talent level",
        "constellation",
    )
    return not any(marker in folded for marker in reject_markers)


def strip_label(value: str, label: str) -> str:
    return normalize_space(re.sub(rf"^{re.escape(label)}\s*", "", value, flags=re.IGNORECASE))


def truncate_text(value: str, limit: int) -> str:
    text = normalize_space(value)
    if len(text) <= limit:
        return text
    return text[: limit - 3].rstrip() + "..."


def fandom_url_for_title(title: str) -> str:
    return f"{FANDOM_BASE_URL}/{quote(title.replace(' ', '_'), safe='()_-')}"


def slug_from_title(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.casefold()).strip("-")


def title_from_slug(value: str) -> str:
    return " ".join(part.capitalize() for part in value.replace("-", " ").split())


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape character lore metadata from Genshin Impact Fandom.")
    parser.add_argument("--dictionary", type=Path, default=DEFAULT_DICTIONARY_PATH)
    parser.add_argument("--character-dir", type=Path, default=DEFAULT_CHARACTER_DIR)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--limit", type=int, default=3, help="Maximum characters to scrape; 0 means no limit.")
    parser.add_argument("--sleep", type=float, default=1.5, help="Pause between requests.")
    parser.add_argument("--timeout", type=float, default=30.0)
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
