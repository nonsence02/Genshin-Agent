"""Scrape English Genshin Impact Fandom Wiki into compact character KB files."""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence
from urllib.parse import unquote, urljoin, urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "knowledge_base" / "characters"
DEFAULT_LIST_URL = "https://genshin-impact.fandom.com/wiki/Character/List"
FALLBACK_LIST_URLS = (
    "https://genshin-impact.fandom.com/wiki/Characters",
    "https://genshin-impact.fandom.com/wiki/Category:Playable_Characters",
)
MISSING = "Не найдено"


WEAPON_NAMES = {"sword", "claymore", "polearm", "catalyst", "bow"}
ELEMENT_NAMES = {"anemo", "geo", "electro", "dendro", "hydro", "pyro", "cryo"}
JUNK_LINK_MARKERS = (
    "adventure rank",
    "acquaint fate",
    "intertwined fate",
    "primogem",
    "mora",
    "artifact",
    "weapon",
    "ascension",
    "material",
)
JUNK_MATERIALS = {
    "mora",
    "adventure exp",
    "companionship exp",
    "materials",
    "total",
    "level",
}
REJECT_MATERIAL_MARKERS = (
    "ascension",
    "material",
    "normal boss",
    "weekly boss",
    "talent",
    "local specialty",
    "common item",
    "character exp",
    "level",
    "phase",
    "cost",
    "reward",
    "domain",
    "normal attack",
    "elemental skill",
    "elemental burst",
    "constellation",
    "damage",
    "attack",
    "cooldown",
    "duration",
    "energy",
    "stamina",
    "hp",
    "atk",
    "def",
)


@dataclass(frozen=True)
class CharacterLink:
    name: str
    url: str


@dataclass(frozen=True)
class MaterialCategories:
    stones: tuple[str, ...] = ()
    talent_books: tuple[str, ...] = ()
    mob_drops: tuple[str, ...] = ()
    weekly_boss: tuple[str, ...] = ()
    special_materials: tuple[str, ...] = ()
    crown: str = ""


@dataclass(frozen=True)
class CharacterKnowledge:
    slug: str
    name: str
    url: str
    weapon: str = MISSING
    element: str = MISSING
    rarity: str = MISSING
    skill_description: str = MISSING
    burst_description: str = MISSING
    materials: MaterialCategories = MaterialCategories()

    def to_json_dict(self) -> dict[str, Any]:
        return {
            "id": self.slug,
            "name": self.name,
            "source_url": self.url,
            "profile": {
                "weapon": self.weapon,
                "element": self.element,
                "rarity": self.rarity,
            },
            "skills": {
                "elemental_skill": self.skill_description,
                "elemental_burst": self.burst_description,
            },
            "materials": {
                "ascension": {
                    "stones": list(self.materials.stones),
                    "mob_drops": list(self.materials.mob_drops),
                    "special": list(self.materials.special_materials),
                },
                "talents": {
                    "books": list(self.materials.talent_books),
                    "mob_drops": list(self.materials.mob_drops),
                    "weekly_boss": list(self.materials.weekly_boss),
                    "crown": self.materials.crown or "Crown of Insight",
                },
            },
            "standard_costs": character_standard_costs(),
        }


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
            except Exception as exc:  # noqa: BLE001 - retry transient Wiki/Cloudflare failures.
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

    client = WikiClient(timeout=args.timeout)
    if args.url:
        links = [CharacterLink(name=canonical_name_from_url(args.url), url=args.url)]
    else:
        links = collect_character_links(client, args.list_url)
    if args.limit:
        links = links[: args.limit]

    print(f"Found {len(links)} character link(s). Writing to {args.output_dir}")
    for index, link in enumerate(links, start=1):
        print(f"[{index}/{len(links)}] {link.name} -> {link.url}")
        try:
            soup = client.get_soup(link.url)
            knowledge = parse_character_page(link, soup)
            output_path = args.output_dir / f"{knowledge.slug}.json"
            output_path.write_text(
                json.dumps(knowledge.to_json_dict(), ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
        except Exception as exc:  # noqa: BLE001 - batch scraping should continue.
            print(f"  ERROR: {exc}", file=sys.stderr)
        time.sleep(args.sleep)

    print("Done.")
    return 0


def collect_character_links(client: WikiClient, list_url: str) -> list[CharacterLink]:
    for url in (list_url, *FALLBACK_LIST_URLS):
        print(f"Collecting character links from {url}")
        try:
            soup = client.get_soup(url)
            links = extract_character_links_from_list_page(soup, url)
            if links:
                return links
        except Exception as exc:  # noqa: BLE001 - try fallback pages.
            print(f"  WARN: failed to parse {url}: {exc}", file=sys.stderr)
    raise RuntimeError("Could not collect character links from Wiki list pages.")


def extract_character_links_from_list_page(soup: Any, base_url: str) -> list[CharacterLink]:
    links: list[CharacterLink] = []
    seen_urls: set[str] = set()

    for table in soup.select("table.article-table, table.wikitable, table.fandom-table"):
        headers = [normalize_space(cell.get_text(" ", strip=True)).casefold() for cell in table.select("th")]
        if headers and not any("name" in header or "character" in header for header in headers):
            continue
        for row in table.select("tr"):
            cells = row.find_all(["td", "th"])
            if len(cells) < 2:
                continue
            link = first_character_link(cells, base_url)
            if link and link.url not in seen_urls:
                links.append(link)
                seen_urls.add(link.url)

    if links:
        return links

    category_root = soup.select_one(".category-page__members, .mw-category, .mw-parser-output")
    if category_root:
        for anchor in category_root.select("a[href]"):
            link = anchor_to_character_link(anchor, base_url)
            if link and link.url not in seen_urls:
                links.append(link)
                seen_urls.add(link.url)

    return links


def first_character_link(cells: Sequence[Any], base_url: str) -> CharacterLink | None:
    for cell in cells:
        for anchor in cell.select("a[href]"):
            link = anchor_to_character_link(anchor, base_url)
            if link:
                return link
    return None


def anchor_to_character_link(anchor: Any, base_url: str) -> CharacterLink | None:
    href = str(anchor.get("href", ""))
    name = normalize_space(anchor.get_text(" ", strip=True))
    if not href or not name:
        return None
    if href.startswith("#") or href.startswith("http") and "genshin-impact.fandom.com/wiki/" not in href:
        return None
    if any(token in href for token in ("/File:", "/Category:", "/Template:", "/Special:")):
        return None
    folded = name.casefold()
    if folded in ELEMENT_NAMES or folded in WEAPON_NAMES:
        return None
    if any(token in folded for token in JUNK_LINK_MARKERS):
        return None
    return CharacterLink(name=name, url=urljoin(base_url, href.split("#", 1)[0]))


def parse_character_page(link: CharacterLink, soup: Any) -> CharacterKnowledge:
    canonical_name = canonical_name_from_url(link.url) or link.name
    infobox = parse_infobox(soup)
    blocked_names = collect_talent_names(soup)
    skill_description, burst_description = parse_talent_descriptions(soup)
    materials = parse_material_categories(soup, canonical_name, blocked_names)

    return CharacterKnowledge(
        slug=slug_from_url(link.url),
        name=canonical_name,
        url=link.url,
        weapon=infobox.get("weapon", MISSING),
        element=infobox.get("element", MISSING),
        rarity=infobox.get("rarity", MISSING),
        skill_description=skill_description or MISSING,
        burst_description=burst_description or MISSING,
        materials=materials,
    )


def parse_infobox(soup: Any) -> dict[str, str]:
    result: dict[str, str] = {}
    infobox = soup.select_one(".portable-infobox, aside.portable-infobox, .pi-theme-genshin")
    if infobox:
        weapon = infobox.select_one('[data-source="weapon"] a')
        if weapon:
            result["weapon"] = normalize_space(weapon.get_text(" ", strip=True))

        element = infobox.select_one('[data-source="element"] a')
        if element:
            result["element"] = normalize_space(element.get_text(" ", strip=True))

        rarity = infobox.select_one('[data-source="rarity"] img')
        if rarity:
            result["rarity"] = clean_rarity(str(rarity.get("alt") or rarity.get("title") or ""))

    page_text = soup.get_text(" ", strip=True)
    if "weapon" not in result:
        result["weapon"] = find_known_value(page_text, WEAPON_NAMES)
    if "element" not in result:
        result["element"] = find_known_value(page_text, ELEMENT_NAMES)
    if "rarity" not in result:
        result["rarity"] = find_rarity_in_page_text(page_text)

    return result


def parse_talent_descriptions(soup: Any) -> tuple[str, str]:
    table_skill, table_burst = parse_talent_table_descriptions(soup)
    skill = table_skill or heuristic_find_talent_description(soup, "Elemental Skill")
    burst = table_burst or heuristic_find_talent_description(soup, "Elemental Burst")
    return skill, burst


def parse_talent_table_descriptions(soup: Any) -> tuple[str, str]:
    skill = ""
    burst = ""

    talent_tables = soup.select("table.talent_table, table.talent-table")
    if not talent_tables:
        talent_tables = [
            table
            for table in soup.select("table.wikitable")
            if "elemental skill" in table.get_text(" ", strip=True).casefold()
            or "elemental burst" in table.get_text(" ", strip=True).casefold()
        ]

    for table in talent_tables:
        rows = direct_table_rows(table)
        pending_type = ""
        for row in rows:
            cells = row.find_all(["th", "td"], recursive=False)
            if len(cells) >= 3:
                pending_type = normalize_space(cells[2].get_text(" ", strip=True)).casefold()
                continue
            if not cells or not pending_type:
                continue

            description = extract_talent_description_from_cell(cells[0])
            if not description:
                continue
            if "elemental skill" in pending_type and not skill:
                skill = truncate_text(description, 700)
            elif "elemental burst" in pending_type and not burst:
                burst = truncate_text(description, 700)
            pending_type = ""

    return skill, burst


def direct_table_rows(table: Any) -> list[Any]:
    rows = table.find_all("tr", recursive=False)
    if rows:
        return rows
    tbody = table.find("tbody", recursive=False)
    if tbody:
        return tbody.find_all("tr", recursive=False)
    return []


def extract_talent_description_from_cell(cell: Any) -> str:
    text = collect_text_before_nested_table(cell)
    if len(text) < 40:
        text = extract_description_from_full_talent_cell_text(cell.get_text(" ", strip=True))
    for label in ("Description", "Gameplay Notes", "Advanced Properties", "Attribute Scaling", "Preview"):
        text = re.sub(rf"\b{re.escape(label)}\b", " ", text, flags=re.IGNORECASE)
    text = text.split("%", 1)[0]
    return clean_talent_text(text)


def extract_description_from_full_talent_cell_text(value: str) -> str:
    text = normalize_space(value)
    for marker in ("Preview", "Description"):
        if marker in text:
            text = text.split(marker, 1)[1]
            break
    for marker in (
        "Talent Level",
        "Level 1",
        "Press DMG",
        "Hold DMG",
        "Skill DMG",
        "Burst DMG",
        "Cooldown",
        "Energy Cost",
    ):
        if marker in text:
            text = text.split(marker, 1)[0]
    return text


def collect_text_before_nested_table(node: Any) -> str:
    pieces: list[str] = []

    def walk(current: Any) -> bool:
        for child in getattr(current, "children", []):
            name = getattr(child, "name", None)
            if name == "table":
                return True
            if name in {"script", "style"}:
                continue
            if name is not None and hasattr(child, "children"):
                if walk(child):
                    return True
            else:
                pieces.append(str(child))
        return False

    walk(node)
    return normalize_space(" ".join(pieces))


def heuristic_find_talent_description(soup: Any, phrase: str) -> str:
    phrase_folded = phrase.casefold()
    talent_root = find_heading(soup, ("talents", "combat talents")) or soup
    search_area = list(iter_section_siblings(talent_root)) if talent_root is not soup else [soup]

    for root in search_area:
        for marker in root.find_all(["h2", "h3", "h4", "h5", "b", "strong", "td", "th"]):
            text = normalize_space(marker.get_text(" ", strip=True))
            if phrase_folded not in text.casefold():
                continue
            if len(text) > 90:
                continue
            for candidate in marker.find_all_next(["p", "td", "div", "li"]):
                desc = clean_talent_text(candidate.get_text(" ", strip=True))
                if is_full_talent_description(desc):
                    return truncate_text(desc, 700)

    return ""


def collect_talent_names(soup: Any) -> set[str]:
    names: set[str] = set()
    for table in soup.select("table.talent_table, table.talent-table, table.wikitable"):
        for row in table.select("tr"):
            cells = row.find_all(["th", "td"])
            if len(cells) >= 3:
                add_blocked_name(names, cells[1].get_text(" ", strip=True))
    for marker in soup.find_all(["b", "strong", "h3", "h4"]):
        text = normalize_space(marker.get_text(" ", strip=True))
        if len(text) <= 60 and any(token in text.casefold() for token in ("elemental", "normal attack", "burst")):
            add_blocked_name(names, text)
    return names


def add_blocked_name(names: set[str], value: str) -> None:
    text = normalize_space(value)
    folded = text.casefold()
    if not text:
        return
    if folded in {"talents", "combat talents", "normal attack", "elemental skill", "elemental burst"}:
        return
    if len(text) <= 60:
        names.add(folded)


def parse_material_categories(soup: Any, character_name: str, blocked_names: set[str]) -> MaterialCategories:
    ascension_materials = collect_materials_from_sections(
        soup,
        section_keywords=("ascensions and stats",),
        character_name=character_name,
        blocked_names=blocked_names,
    )
    talent_materials = collect_materials_from_sections(
        soup,
        section_keywords=("talent upgrade",),
        character_name=character_name,
        blocked_names=blocked_names,
    )
    all_materials = ordered_unique([*ascension_materials, *talent_materials])

    stones = [item for item in all_materials if is_stone_material(item)]
    talent_books = [item for item in all_materials if is_talent_book(item)]
    crowns = [item for item in all_materials if is_crown(item)]
    mob_drops = [
        item
        for item in ascension_materials
        if item in talent_materials
        and not is_stone_material(item)
        and not is_talent_book(item)
        and not is_crown(item)
    ]
    weekly_boss = [
        item
        for item in talent_materials
        if item not in ascension_materials
        and not is_talent_book(item)
        and not is_crown(item)
    ]
    special_materials = [
        item
        for item in ascension_materials
        if item not in mob_drops
        and not is_stone_material(item)
        and not is_talent_book(item)
        and not is_crown(item)
    ]

    return MaterialCategories(
        stones=tuple(ordered_unique(stones)),
        talent_books=tuple(ordered_unique(talent_books)),
        mob_drops=tuple(ordered_unique(mob_drops)),
        weekly_boss=tuple(ordered_unique(weekly_boss)),
        special_materials=tuple(ordered_unique(special_materials)),
        crown=crowns[0] if crowns else "",
    )


def collect_materials_from_sections(
    soup: Any,
    section_keywords: Sequence[str],
    character_name: str,
    blocked_names: set[str],
) -> list[str]:
    materials: list[str] = []
    seen: set[str] = set()

    for heading in soup.select("h2, h3, h4"):
        heading_text = normalize_space(heading.get_text(" ", strip=True)).casefold()
        if not any(keyword in heading_text for keyword in section_keywords):
            continue
        for node in iter_until_next_heading(heading):
            if getattr(node, "name", None) != "table":
                continue
            for anchor in node.select("a[href]"):
                candidate = normalize_space(str(anchor.get("title") or anchor.get_text(" ", strip=True)))
                if is_clean_material_name(candidate, character_name, blocked_names) and candidate not in seen:
                    materials.append(candidate)
                    seen.add(candidate)

    return materials


def is_stone_material(value: str) -> bool:
    folded = value.casefold()
    return any(marker in folded for marker in ("sliver", "fragment", "chunk", "gemstone"))


def is_talent_book(value: str) -> bool:
    folded = value.casefold()
    return any(marker in folded for marker in ("teachings of", "guide to", "philosophies of"))


def is_crown(value: str) -> bool:
    return value.casefold() == "crown of insight"


def character_standard_costs() -> dict[str, Any]:
    return {
        "ascension_90": {
            "specialty": 168,
            "boss": 46,
            "stones": {"sliver": 1, "fragment": 9, "chunk": 9, "gemstone": 6},
            "mob_drops": {"low": 18, "mid": 30, "high": 36},
        },
        "talent_10": {
            "books": {"low": 3, "mid": 21, "high": 38},
            "mob_drops": {"low": 6, "mid": 22, "high": 31},
            "weekly_boss": 6,
            "crown": 1,
        },
        "three_talents_10": {
            "books": {"low": 9, "mid": 63, "high": 114},
            "mob_drops": {"low": 18, "mid": 66, "high": 93},
            "weekly_boss": 18,
            "crown": 3,
        },
    }


def find_known_value(text: str, values: set[str]) -> str:
    for value in sorted(values, key=len, reverse=True):
        if re.search(rf"\b{re.escape(value)}\b", text, flags=re.IGNORECASE):
            return value.title()
    return MISSING


def find_rarity_in_page_text(text: str) -> str:
    match = re.search(r"\b([45])[- ]?Star(?:\s+Character)?\b", text, flags=re.IGNORECASE)
    return f"{match.group(1)}★" if match else MISSING


def is_clean_material_name(value: str, character_name: str = "", blocked_names: set[str] | None = None) -> bool:
    candidate = normalize_space(value)
    if not candidate:
        return False
    folded = candidate.casefold()
    if character_name and character_name.casefold() in folded:
        return False
    if blocked_names and folded in blocked_names:
        return False
    if folded in JUNK_MATERIALS or folded in ELEMENT_NAMES or folded in WEAPON_NAMES:
        return False
    if any(marker in folded for marker in REJECT_MATERIAL_MARKERS):
        return False
    if len(candidate) > 48:
        return False
    if re.search(r"\d", candidate):
        return False
    if any(symbol in candidate for symbol in ("%","+","/","\\","{","}","[","]","<",">","=","*","×",":")):
        return False
    if candidate.count(".") or candidate.count("!") or candidate.count("?"):
        return False
    return True


def clean_talent_text(value: str) -> str:
    text = normalize_space(value)
    if not text:
        return ""
    if "%" in text:
        return ""
    if re.search(r"\d+(?:[.,]\d+)?\s*[xх]\s*\d*", text.casefold()):
        return ""
    text = re.sub(r"\([^)]*\d[^)]*\)", "", text)
    text = re.sub(r"\b\d+(?:[.,]\d+)?(?:st|nd|rd|th|s)?\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\d+(?:[.,]\d+)?", "", text)
    text = re.sub(r"/{2,}", "", text)
    text = re.sub(r"\bevery\s+\.", ".", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def is_full_talent_description(text: str) -> bool:
    if len(text) < 40:
        return False
    if not re.search(r"[.!?。]$", text):
        return False
    folded = text.casefold()
    if any(marker in folded for marker in ("icon", "name", "type", "level")):
        return False
    return True


def find_heading(soup: Any, keywords: Sequence[str]) -> Any | None:
    for heading in soup.select("h2, h3"):
        text = normalize_space(heading.get_text(" ", strip=True)).casefold()
        if any(keyword in text for keyword in keywords):
            return heading
    return None


def iter_section_siblings(heading: Any) -> Iterable[Any]:
    for sibling in heading.find_next_siblings():
        if getattr(sibling, "name", None) == "h2":
            break
        yield sibling


def iter_until_next_heading(heading: Any) -> Iterable[Any]:
    current_level = int(heading.name[1]) if getattr(heading, "name", "").startswith("h") else 2
    for sibling in heading.find_all_next():
        name = getattr(sibling, "name", "")
        if name in {"h2", "h3"} and int(name[1]) <= current_level:
            break
        yield sibling


def clean_rarity(value: str) -> str:
    match = re.search(r"[45]", value)
    return f"{match.group(0)}★" if match else MISSING


def wiki_title_from_url(url: str) -> str:
    path = urlparse(url).path.rsplit("/", 1)[-1]
    return unquote(path).replace("_", " ")


def canonical_name_from_url(url: str) -> str:
    return normalize_space(wiki_title_from_url(url))


def slug_from_url(url: str) -> str:
    title = wiki_title_from_url(url)
    slug = re.sub(r"[\s_]+", "-", title).strip("-").casefold()
    slug = re.sub(r"[^a-z0-9-]+", "", slug)
    slug = re.sub(r"-{2,}", "-", slug).strip("-")
    return slug or "unknown"


def title_from_slug(value: str) -> str:
    return " ".join(part.capitalize() for part in value.replace("_", "-").split("-") if part) or "Unknown"


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def truncate_text(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[:limit].rsplit(" ", 1)[0].rstrip() + "..."


def join_or_missing(values: Sequence[str]) -> str:
    unique: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = normalize_space(value)
        if not normalized or normalized in seen:
            continue
        unique.append(normalized)
        seen.add(normalized)
    return ", ".join(unique) if unique else MISSING


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
    parser = argparse.ArgumentParser(
        description="Scrape English Genshin Impact Fandom Wiki into JSON KB files."
    )
    parser.add_argument("--list-url", default=DEFAULT_LIST_URL, help="Character list page URL.")
    parser.add_argument("--url", default="", help="Parse one concrete character page URL.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Markdown output directory.")
    parser.add_argument("--limit", type=int, default=0, help="Optional test limit. 0 means all.")
    parser.add_argument("--sleep", type=float, default=1.0, help="Delay between character page requests.")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP request timeout.")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
