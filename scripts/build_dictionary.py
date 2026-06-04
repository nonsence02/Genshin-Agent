"""Build an English -> Russian material dictionary from Genshin Fandom pages."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote


PROJECT_ROOT = Path(__file__).resolve().parents[1]
KB_DIRS = (
    PROJECT_ROOT / "knowledge_base" / "characters",
    PROJECT_ROOT / "knowledge_base" / "weapons",
)
DEFAULT_OUTPUT_PATH = PROJECT_ROOT / "data" / "raw" / "dictionary.json"
FANDOM_BASE_URL = "https://genshin-impact.fandom.com/wiki"
REJECT_TERMS = {
    "anemo",
    "cryo",
    "dendro",
    "electro",
    "geo",
    "hydro",
    "pyro",
    "bow",
    "catalyst",
    "claymore",
    "polearm",
    "sword",
    "atk",
    "cd",
    "def",
    "dmg",
    "enemy",
    "hp",
    "level",
    "party",
}
REJECT_MARKERS = (
    "elemental ",
    "passive",
    "resistance",
    "moonsign",
    "mini-map",
    "utility",
    "normal attack",
    "charged attack",
    "plunging attack",
    "constellation",
    "interruption",
)


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
            except Exception as exc:  # noqa: BLE001 - retry transient Cloudflare/Fandom failures.
                last_error = exc
                if attempt < 2:
                    self.session = self._create_session()
                    time.sleep(1.5)
                    continue
                raise
        raise RuntimeError(f"Failed to fetch {url}") from last_error


def main() -> int:
    args = parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)

    dictionary = load_dictionary(args.output)
    terms = collect_unique_terms(KB_DIRS)
    pending = [term for term in terms if term not in dictionary]
    if args.limit > 0:
        pending = pending[: args.limit]

    print(f"Collected {len(terms)} unique term(s). Already translated: {len(dictionary)}.")
    print(f"Pending this run: {len(pending)}. Output: {args.output}")

    client = WikiClient(timeout=args.timeout)
    successful_new_entries = 0

    for index, term in enumerate(pending, start=1):
        url = fandom_url_for_title(term)
        print(f"[{index}/{len(pending)}] {term} -> {url}")
        try:
            soup = client.get_soup(url)
            translation = extract_russian_translation(soup)
            if translation:
                dictionary[term] = translation
                successful_new_entries += 1
                print(f"  OK: {translation}")
            else:
                print("  WARN: Russian translation not found.", file=sys.stderr)
        except Exception as exc:  # noqa: BLE001 - keep partial progress.
            print(f"  ERROR: {exc}", file=sys.stderr)

        if successful_new_entries and successful_new_entries % 10 == 0:
            save_dictionary(args.output, dictionary)
            print(f"  Saved checkpoint: {len(dictionary)} entries.")

        time.sleep(args.sleep)

    save_dictionary(args.output, dictionary)
    print(f"Done. Saved {len(dictionary)} entries.")
    return 0


def collect_unique_terms(kb_dirs: Iterable[Path]) -> list[str]:
    terms: set[str] = set()
    excluded_titles = collect_kb_titles(kb_dirs)
    for kb_dir in kb_dirs:
        if not kb_dir.exists():
            continue
        for path in sorted(kb_dir.glob("*.md")):
            for term in extract_material_terms(path.read_text(encoding="utf-8")):
                if term.casefold() in excluded_titles:
                    continue
                terms.add(term)
    return sorted(terms, key=str.casefold)


def collect_kb_titles(kb_dirs: Iterable[Path]) -> set[str]:
    titles: set[str] = set()
    for kb_dir in kb_dirs:
        if not kb_dir.exists():
            continue
        for path in kb_dir.glob("*.md"):
            title = normalize_space(path.stem.replace("-", " "))
            if title:
                titles.add(title.casefold())
    return titles


def extract_material_terms(markdown: str) -> list[str]:
    block = extract_material_block(markdown)
    terms: list[str] = []
    for line in block.splitlines():
        stripped = line.strip()
        if not stripped.startswith("- ") or ":" not in stripped:
            continue
        _, raw_values = stripped.split(":", 1)
        for value in raw_values.split(","):
            term = clean_term(value)
            if is_dictionary_term(term):
                terms.append(term)
    return terms


def extract_material_block(markdown: str) -> str:
    match = re.search(
        r"^## Материалы для прокачки\s*(.*?)(?=^## |\Z)",
        markdown,
        flags=re.MULTILINE | re.DOTALL,
    )
    return match.group(1) if match else ""


def is_dictionary_term(value: str) -> bool:
    if not value or value == "Не найдено":
        return False
    folded = value.casefold()
    if folded in REJECT_TERMS:
        return False
    if any(marker in folded for marker in REJECT_MARKERS):
        return False
    if re.search(r"\d", value):
        return False
    if len(value) <= 2:
        return False
    return bool(re.search(r"[A-Za-z]", value))


def clean_term(value: str) -> str:
    return normalize_space(value).strip("\"'")


def fandom_url_for_title(title: str) -> str:
    wiki_title = title.replace(" ", "_")
    return f"{FANDOM_BASE_URL}/{quote(wiki_title, safe='_()%-')}"


def extract_russian_translation(soup: Any) -> str:
    other_languages_heading = find_other_languages_heading(soup)
    tables = []
    if other_languages_heading:
        for node in iter_until_next_heading(other_languages_heading):
            if getattr(node, "name", None) == "table":
                tables.append(node)
    if not tables:
        tables = list(soup.select("table.wikitable"))

    for table in tables:
        translation = extract_russian_translation_from_table(table)
        if translation:
            return translation
    return ""


def extract_russian_translation_from_table(table: Any) -> str:
    for row in table.select("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) < 2:
            continue
        language = normalize_space(cells[0].get_text(" ", strip=True))
        if language.casefold() != "russian":
            continue
        value_cell = cells[1]
        for small in value_cell.select("small"):
            small.decompose()
        return normalize_space(value_cell.get_text(" ", strip=True))
    return ""


def find_other_languages_heading(soup: Any) -> Any | None:
    for heading in soup.select("h2, h3, h4"):
        text = normalize_space(heading.get_text(" ", strip=True)).casefold()
        if "other languages" in text:
            return heading
    return None


def iter_until_next_heading(heading: Any) -> Iterable[Any]:
    current_level = int(heading.name[1]) if getattr(heading, "name", "").startswith("h") else 2
    for sibling in heading.find_all_next():
        name = getattr(sibling, "name", "")
        if name in {"h2", "h3", "h4"} and int(name[1]) <= current_level:
            break
        yield sibling


def load_dictionary(path: Path) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        print(f"WARN: could not parse {path}; starting with an empty dictionary.", file=sys.stderr)
        return {}
    if not isinstance(data, dict):
        print(f"WARN: {path} is not a JSON object; starting with an empty dictionary.", file=sys.stderr)
        return {}
    return {str(key): str(value) for key, value in data.items() if key and value}


def save_dictionary(path: Path, dictionary: dict[str, str]) -> None:
    ordered = dict(sorted(dictionary.items(), key=lambda item: item[0].casefold()))
    path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build English -> Russian material dictionary from Fandom.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH, help="Output dictionary JSON path.")
    parser.add_argument("--limit", type=int, default=0, help="Limit materials parsed in this run. 0 means all.")
    parser.add_argument("--sleep", type=float, default=1.0, help="Delay between Wiki requests.")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP request timeout.")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
