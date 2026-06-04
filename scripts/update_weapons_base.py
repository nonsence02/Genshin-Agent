"""Scrape English Genshin Impact Fandom Wiki into compact weapon KB files."""

from __future__ import annotations

import argparse
import re
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Sequence
from urllib.parse import unquote, urljoin, urlparse


PROJECT_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_DIR = PROJECT_ROOT / "knowledge_base" / "weapons"
DEFAULT_LIST_URL = "https://genshin-impact.fandom.com/wiki/Weapon/List"
MISSING = "Не найдено"

WEAPON_TYPES = {"sword", "claymore", "polearm", "catalyst", "bow"}
JUNK_LINK_MARKERS = (
    "weapon",
    "wish",
    "event",
    "forge",
    "shop",
    "chest",
    "material",
    "ascension",
    "enhancement",
    "refinement",
)
REJECT_MATERIAL_MARKERS = (
    "ascension",
    "material",
    "weapon",
    "level",
    "phase",
    "cost",
    "total",
    "domain",
    "mora",
    "enhancement",
    "ore",
    "refinement",
    "base atk",
    "secondary stat",
)


@dataclass(frozen=True)
class WeaponLink:
    name: str
    url: str


@dataclass(frozen=True)
class WeaponKnowledge:
    slug: str
    name: str
    url: str
    weapon_type: str = MISSING
    rarity: str = MISSING
    base_atk: str = MISSING
    secondary_stat: str = MISSING
    passive: str = MISSING
    materials: tuple[str, ...] = ()

    def to_markdown(self) -> str:
        title_name = title_from_slug(self.slug)
        title = f"{title_name} ({self.name})" if title_name.casefold() != self.name.casefold() else self.name

        return "\n".join(
            [
                f"# {title}",
                "",
                "## Характеристики",
                f"- Тип: {self.weapon_type}",
                f"- Редкость: {self.rarity}",
                f"- Базовая атака: {self.base_atk}",
                f"- Вторичная характеристика: {self.secondary_stat}",
                f"- Пассивный навык: {self.passive}",
                "",
                "## Материалы для прокачки",
                f"- Материалы: {join_or_missing(self.materials)}",
                "",
                "## Стандартная стоимость прокачки (Справочно)",
                "- **Возвышение (до 90 ур.):** 5 зеленых, 14 синих, 14 фиолетовых, 6 золотых материалов (из подземелий); 15/18/27 с элитных врагов; 10/15/18 с обычных врагов.",
                "",
                f"<!-- Source: {self.url} -->",
                "",
            ]
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
        links = [WeaponLink(name=canonical_name_from_url(args.url), url=args.url)]
    else:
        links = collect_weapon_links(client, args.list_url)
    if args.limit:
        links = links[: args.limit]

    print(f"Found {len(links)} weapon link(s). Writing to {args.output_dir}")
    for index, link in enumerate(links, start=1):
        print(f"[{index}/{len(links)}] {link.name} -> {link.url}")
        try:
            soup = client.get_soup(link.url)
            knowledge = parse_weapon_page(link, soup)
            output_path = args.output_dir / f"{knowledge.slug}.md"
            output_path.write_text(knowledge.to_markdown(), encoding="utf-8")
        except Exception as exc:  # noqa: BLE001 - batch scraping should continue.
            print(f"  ERROR: {exc}", file=sys.stderr)
        time.sleep(args.sleep)

    print("Done.")
    return 0


def collect_weapon_links(client: WikiClient, list_url: str) -> list[WeaponLink]:
    print(f"Collecting weapon links from {list_url}")
    soup = client.get_soup(list_url)
    links = extract_weapon_links_from_list_page(soup, list_url)
    if not links:
        raise RuntimeError("Could not collect weapon links from Wiki list page.")
    return links


def extract_weapon_links_from_list_page(soup: Any, base_url: str) -> list[WeaponLink]:
    links: list[WeaponLink] = []
    seen_urls: set[str] = set()

    for table in soup.select("table.article-table, table.wikitable, table.fandom-table"):
        headers = [normalize_space(cell.get_text(" ", strip=True)).casefold() for cell in table.select("th")]
        if headers and not any("weapon" in header or "name" in header for header in headers):
            continue
        for row in table.select("tr"):
            cells = row.find_all(["td", "th"])
            if not cells:
                continue
            link = first_weapon_link(cells, base_url)
            if link and link.url not in seen_urls:
                links.append(link)
                seen_urls.add(link.url)

    return links


def first_weapon_link(cells: Sequence[Any], base_url: str) -> WeaponLink | None:
    for cell in cells:
        for anchor in cell.select("a[href]"):
            link = anchor_to_weapon_link(anchor, base_url)
            if link:
                return link
    return None


def anchor_to_weapon_link(anchor: Any, base_url: str) -> WeaponLink | None:
    href = str(anchor.get("href", ""))
    name = normalize_space(str(anchor.get("title") or anchor.get_text(" ", strip=True)))
    if not href or not name:
        return None
    if href.startswith("#") or href.startswith("http") and "genshin-impact.fandom.com/wiki/" not in href:
        return None
    if any(token in href for token in ("/File:", "/Category:", "/Template:", "/Special:")):
        return None
    folded = name.casefold()
    if folded in WEAPON_TYPES:
        return None
    if any(token in folded for token in JUNK_LINK_MARKERS):
        return None
    return WeaponLink(name=name, url=urljoin(base_url, href.split("#", 1)[0]))


def parse_weapon_page(link: WeaponLink, soup: Any) -> WeaponKnowledge:
    canonical_name = canonical_name_from_url(link.url) or link.name
    infobox = parse_infobox(soup)
    passive = parse_passive_skill(soup)
    materials = parse_ascension_materials(soup, canonical_name)

    return WeaponKnowledge(
        slug=slug_from_url(link.url),
        name=canonical_name,
        url=link.url,
        weapon_type=infobox.get("type", MISSING),
        rarity=infobox.get("rarity", MISSING),
        base_atk=infobox.get("base_atk", MISSING),
        secondary_stat=infobox.get("secondary_stat", MISSING),
        passive=passive or MISSING,
        materials=tuple(materials),
    )


def parse_infobox(soup: Any) -> dict[str, str]:
    result: dict[str, str] = {}
    infobox = soup.select_one(".portable-infobox, aside.portable-infobox, .pi-theme-genshin")
    if not infobox:
        return result

    weapon_type = infobox.select_one('[data-source="type"] a')
    if weapon_type:
        result["type"] = normalize_space(weapon_type.get_text(" ", strip=True))
    if not result.get("type"):
        result["type"] = strip_infobox_label(find_infobox_value(infobox, "Weapon Type"), "Weapon Type")

    rarity = infobox.select_one('[data-source="rarity"] img')
    if rarity:
        result["rarity"] = clean_rarity(str(rarity.get("alt") or rarity.get("title") or ""))
    if "rarity" not in result:
        quality_node = find_infobox_data_item(infobox, "Quality")
        if quality_node:
            result["rarity"] = clean_rarity(
                " ".join(str(img.get("alt") or img.get("title") or "") for img in quality_node.select("img"))
            )

    base_atk = infobox.select_one('[data-source="base-atk"]')
    if base_atk:
        result["base_atk"] = clean_numeric_stat(base_atk.get_text(" ", strip=True))
    if "base_atk" not in result:
        result["base_atk"] = strip_infobox_label(find_infobox_value(infobox, "Base ATK"), "Base ATK")
    if result.get("base_atk") in {"", MISSING}:
        result["base_atk"] = find_quality_text(infobox, r"\b\d+\s*-\s*\d+\b", reject="%")

    secondary_stat = infobox.select_one('[data-source="secondary-stat"]')
    if secondary_stat:
        result["secondary_stat"] = normalize_space(secondary_stat.get_text(" ", strip=True))
    if "secondary_stat" not in result:
        result["secondary_stat"] = strip_infobox_label(
            find_infobox_value(infobox, "Secondary Attribute Type"), "Secondary Attribute Type"
        )
    if result.get("secondary_stat") in {"", MISSING}:
        result["secondary_stat"] = find_quality_text(
            infobox,
            r"\b(?:CRIT Rate|CRIT DMG|ATK|DEF|HP|Elemental Mastery|Energy Recharge|Physical DMG Bonus)\b",
        )

    return result


def find_infobox_data_item(infobox: Any, label: str) -> Any | None:
    label_folded = label.casefold()
    for item in infobox.select(".pi-item.pi-data, [data-source]"):
        label_node = item.select_one(".pi-data-label")
        item_label = normalize_space(label_node.get_text(" ", strip=True)) if label_node else ""
        if label_folded in item_label.casefold():
            return item
    return None


def find_infobox_value(infobox: Any, label: str) -> str:
    item = find_infobox_data_item(infobox, label)
    if not item:
        return ""
    value_node = item.select_one(".pi-data-value")
    source = value_node or item
    return normalize_space(source.get_text(" ", strip=True))


def strip_infobox_label(value: str, label: str) -> str:
    text = normalize_space(value)
    text = re.sub(rf"^{re.escape(label)}\s*", "", text, flags=re.IGNORECASE)
    return text or MISSING


def find_quality_text(infobox: Any, pattern: str, reject: str = "") -> str:
    for node in infobox.select('[data-source="quality"]'):
        text = normalize_space(node.get_text(" ", strip=True))
        folded = text.casefold()
        if not text or any(label in folded for label in ("quality", "base atk", "secondary attribute")):
            continue
        if reject and reject in text:
            continue
        match = re.search(pattern, text, flags=re.IGNORECASE)
        if match:
            return normalize_space(match.group(0))
    return MISSING


def parse_passive_skill(soup: Any) -> str:
    infobox = soup.select_one(".portable-infobox, aside.portable-infobox, .pi-theme-genshin")
    if infobox:
        for selector in (
            '[data-source="passive-skill"]',
            '[data-source="effect"]',
            '[data-source="special-ability"]',
        ):
            node = infobox.select_one(selector)
            if node:
                candidates = [clean_passive_text(item.get_text(" ", strip=True)) for item in infobox.select(selector)]
                candidates = [candidate for candidate in candidates if len(candidate) >= 35]
                if candidates:
                    return truncate_text(max(candidates, key=len), 700)

    for heading in soup.select("h2, h3, h4"):
        heading_text = normalize_space(heading.get_text(" ", strip=True)).casefold()
        if not any(marker in heading_text for marker in ("passive", "refinement", "effect")):
            continue
        for node in iter_until_next_heading(heading):
            if getattr(node, "name", None) not in {"p", "div", "td", "li"}:
                continue
            text = clean_passive_text(node.get_text(" ", strip=True))
            if len(text) >= 35:
                return truncate_text(text, 700)

    return ""


def parse_ascension_materials(soup: Any, weapon_name: str) -> list[str]:
    materials: list[str] = []
    seen: set[str] = set()

    for heading in soup.select("h2, h3, h4"):
        heading_text = normalize_space(heading.get_text(" ", strip=True)).casefold()
        if "ascension" not in heading_text:
            continue
        for node in iter_until_next_heading(heading):
            if getattr(node, "name", None) != "table":
                continue
            for anchor in node.select("a[href]"):
                candidate = normalize_space(str(anchor.get("title") or anchor.get_text(" ", strip=True)))
                if is_clean_material_name(candidate, weapon_name) and candidate not in seen:
                    materials.append(candidate)
                    seen.add(candidate)

    return materials


def is_clean_material_name(value: str, weapon_name: str = "") -> bool:
    candidate = normalize_space(value)
    if not candidate:
        return False
    folded = candidate.casefold()
    if weapon_name and weapon_name.casefold() in folded:
        return False
    if folded in WEAPON_TYPES:
        return False
    if any(marker in folded for marker in REJECT_MATERIAL_MARKERS):
        return False
    if len(candidate) > 52:
        return False
    if re.search(r"\d", candidate):
        return False
    if any(symbol in candidate for symbol in ("%","+","/","\\","{","}","[","]","<",">","=","*","×",":")):
        return False
    if candidate.count(".") or candidate.count("!") or candidate.count("?"):
        return False
    return True


def clean_passive_text(value: str) -> str:
    text = normalize_space(value)
    if not text:
        return ""
    for label in ("Passive", "Description", "Refinement", "Effect"):
        text = re.sub(rf"\b{re.escape(label)}\b", " ", text, flags=re.IGNORECASE)
    text = re.sub(r"\([^)]*\d[^)]*\)", "", text)
    text = re.sub(r"\d+(?:[.,]\d+)?\s*%", "", text)
    text = re.sub(r"\d+(?:[.,]\d+)?(?:/\d+(?:[.,]\d+)?)+", "", text)
    text = re.sub(r"\b\d+(?:[.,]\d+)?(?:st|nd|rd|th|s)?\b", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\d+(?:[.,]\d+)?", "", text)
    text = re.sub(r"\s*/\s*", " ", text)
    text = re.sub(r"\s+([.,;:!?])", r"\1", text)
    return normalize_space(text)


def clean_numeric_stat(value: str) -> str:
    text = normalize_space(value)
    range_match = re.search(r"\b\d+(?:\.\d+)?\s*-\s*\d+(?:\.\d+)?%?\b", text)
    if range_match:
        return range_match.group(0)
    match = re.search(r"\b\d+(?:\.\d+)?%?\b", text)
    return match.group(0) if match else text or MISSING


def clean_rarity(value: str) -> str:
    match = re.search(r"[1-5]", value)
    return f"{match.group(0)}★" if match else MISSING


def iter_until_next_heading(heading: Any) -> Iterable[Any]:
    current_level = int(heading.name[1]) if getattr(heading, "name", "").startswith("h") else 2
    for sibling in heading.find_all_next():
        name = getattr(sibling, "name", "")
        if name in {"h2", "h3"} and int(name[1]) <= current_level:
            break
        yield sibling


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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Scrape English Genshin Impact Fandom Wiki into Markdown weapon KB files."
    )
    parser.add_argument("--list-url", default=DEFAULT_LIST_URL, help="Weapon list page URL.")
    parser.add_argument("--url", default="", help="Parse one concrete weapon page URL.")
    parser.add_argument("--output-dir", type=Path, default=OUTPUT_DIR, help="Markdown output directory.")
    parser.add_argument("--limit", type=int, default=0, help="Optional test limit. 0 means all.")
    parser.add_argument("--sleep", type=float, default=1.0, help="Delay between weapon page requests.")
    parser.add_argument("--timeout", type=float, default=30.0, help="HTTP request timeout.")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(main())
