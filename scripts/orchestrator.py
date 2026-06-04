"""Interactive RAG orchestrator for the local Genshin planner agent."""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Iterable


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_INVENTORY_PATH = PROJECT_ROOT / "data" / "raw" / "inventory.json"
DEFAULT_DICTIONARY_PATH = PROJECT_ROOT / "data" / "raw" / "dictionary.json"
KB_ROOT = PROJECT_ROOT / "knowledge_base"

DEFAULT_BASE_URL = os.getenv("GENSHIN_LLM_BASE_URL", "http://localhost:11434/v1")
DEFAULT_MODEL = os.getenv("GENSHIN_LLM_MODEL", "qwen2.5:7b-instruct-q4_K_M")
DEFAULT_API_KEY = os.getenv("GENSHIN_LLM_API_KEY", "ollama")

SYSTEM_PROMPT = """Ты — продвинутый ИИ-ассистент по Genshin Impact.

Твоя задача — анализировать инвентарь пользователя, его задачу и точечно загруженную базу знаний, чтобы строить практичные планы прокачки и фарма.

Работай строго по алгоритму ниже. Не классифицируй материалы самостоятельно: база знаний уже содержит готовые категории.

## Шаг 1: обязательный блок <thinking>

Каждый ответ ОБЯЗАН начинаться с тега <thinking> и заканчиваться внутри этого блока тегом </thinking>.
Внутри <thinking> сделай короткую рабочую раскладку:
1. Найди в KB готовые строки категорий: "Камни", "Книги талантов", "Материалы с мобов", "Еженедельный босс", "Особые материалы (Диковинка / Босс)", "Корона".
2. Используй названия материалов и предметов ровно в том виде, в котором они пришли в контексте KB. Контекст уже предварительно обработан словарем переводов.
3. Возьми цифры ТОЛЬКО из блока "## Стандартная стоимость прокачки":
   - Для возвышения используй строку "Возвышение (до 90 ур.)".
   - Для одного таланта используй строку "Один талант (до 10 ур.)".
   - Если пользователь просит 3 таланта, используй готовую строку "ТРИ таланта (до 10 ур.)".
   - Никаких самостоятельных умножений книг, материалов с мобов, еженедельного босса или корон.
4. Если в инвентаре есть количество конкретного материала, вычти его: нужно X, в инвентаре Y, не хватает Z.
5. Если количество в инвентаре не найдено, пиши: "в инвентаре неизвестно, нужно проверить запас". Не ставь 0 без данных.

## Жесткие правила

- Отвечай на русском языке.
- Бери материалы только из готовых категорий KB. Не пытайся заново определять, что является камнем, книгой, боссом или диковинкой.
- Используй только термины, которые пришли в контексте KB и инвентаря. Не придумывай свои названия материалов, оружия, персонажей или боссов.
- Не копируй справочный блок целиком. Возьми из него только нужные цифры и подставь в шаблон.
- Если запрошено 3 таланта, бери готовые цифры из строки "ТРИ таланта (до 10 ур.)"; не умножай самостоятельно.
- Расшифровывай цифры со слэшами из справочного блока в финальном ответе: 9/63/114 = 9 зеленых, 63 синих, 114 фиолетовых.
- Не выдумывай материалы, которых нет в KB. Если данных не хватает, поставь "Не найдено в KB".

## Шаг 2: финальный ответ строго по шаблону

После </thinking> выведи ТОЛЬКО следующий Markdown-шаблон, подставив вычисленные значения:

# План прокачки: [Имя персонажа на русском]

## Необходимые ресурсы (с учетом инвентаря)

**Возвышение (до 90 уровня):**
* Диковинка / Босс: 168 / 46 шт. — [Особые материалы из KB]
* Камни: 1 Осколок, 9 Фрагментов, 9 Кусков, 6 Драгоценных — [Камни из KB]
* Материалы с мобов: 18 серых, 30 зеленых, 36 синих — [Материалы с мобов из KB]

**Прокачка [Количество] талантов до [Уровень] уровня:**
* Книги талантов: [Кол-во] зеленых, [Кол-во] синих, [Кол-во] фиолетовых — [Книги талантов из KB]
* Материалы с мобов: [Кол-во] серых, [Кол-во] зеленых, [Кол-во] синих — [Материалы с мобов из KB]
* Еженедельный босс: [Кол-во] шт. — [Еженедельный босс из KB]
* Корона прозрения: [Кол-во] шт.

## Короткий план фарма
* [1-3 конкретных шага фарма на русском]
"""


def main() -> int:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Install `openai` first: pip install openai") from exc

    task_input = input("Введите вашу задачу (или путь к файлу с задачей): ").strip()
    entity_input = input("Укажите ID персонажей или оружия для загрузки в контекст (через запятую): ").strip()

    task = read_task_input(task_input)
    entity_ids = parse_entity_ids(entity_input)
    inventory = read_inventory(DEFAULT_INVENTORY_PATH)
    dictionary = load_translation_dictionary(DEFAULT_DICTIONARY_PATH)
    knowledge_context = load_knowledge_context(entity_ids, dictionary)
    prompt = build_user_prompt(task, inventory, knowledge_context, entity_ids)

    client = OpenAI(base_url=DEFAULT_BASE_URL, api_key=DEFAULT_API_KEY)

    print("\n--- Ответ агента ---\n")
    stream = client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.2,
        stream=True,
    )

    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            print(delta, end="", flush=True)
    print()
    return 0


def read_task_input(value: str) -> str:
    if not value:
        return "Составь план прокачки по загруженному инвентарю и базе знаний."

    path = Path(value)
    if path.exists() and path.is_file():
        return path.read_text(encoding="utf-8").strip()

    project_path = PROJECT_ROOT / value
    if project_path.exists() and project_path.is_file():
        return project_path.read_text(encoding="utf-8").strip()

    return value


def parse_entity_ids(value: str) -> list[str]:
    ids: list[str] = []
    seen: set[str] = set()
    for item in value.split(","):
        entity_id = normalize_entity_id(item)
        if entity_id and entity_id not in seen:
            ids.append(entity_id)
            seen.add(entity_id)
    return ids


def normalize_entity_id(value: str) -> str:
    return value.strip().casefold().replace("_", "-").replace(" ", "-")


def read_inventory(path: Path = DEFAULT_INVENTORY_PATH) -> str:
    if not path.exists():
        return "Инвентарь не найден: data/raw/inventory.json отсутствует."

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return path.read_text(encoding="utf-8").strip()

    return json.dumps(data, ensure_ascii=False, indent=2)


def load_translation_dictionary(path: Path = DEFAULT_DICTIONARY_PATH) -> dict[str, str]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {str(key): str(value) for key, value in data.items() if key and value}


def apply_translation_dictionary(text: str, dictionary: dict[str, str]) -> str:
    translated = text
    for english, russian in sorted(dictionary.items(), key=lambda item: len(item[0]), reverse=True):
        translated = translated.replace(english, russian)
    return translated


def load_knowledge_context(entity_ids: Iterable[str], dictionary: dict[str, str] | None = None) -> str:
    chunks: list[str] = []
    missing: list[str] = []
    dictionary = dictionary or {}

    for entity_id in entity_ids:
        path = find_knowledge_file(entity_id)
        if path:
            content = path.read_text(encoding="utf-8").strip()
            content = apply_translation_dictionary(content, dictionary)
            chunks.append(f"## KB: {entity_id}\n\n{content}")
        else:
            missing.append(entity_id)

    if missing:
        chunks.append("## Не найдено в базе знаний\n\n" + "\n".join(f"- {item}" for item in missing))

    return "\n\n---\n\n".join(chunks) if chunks else "База знаний не загружена: ID сущностей не указаны."


def find_knowledge_file(entity_id: str) -> Path | None:
    candidates = (
        KB_ROOT / "characters" / f"{entity_id}.md",
        KB_ROOT / "weapons" / f"{entity_id}.md",
    )
    for path in candidates:
        if path.exists():
            return path
    return None


def build_user_prompt(task: str, inventory: str, knowledge_context: str, entity_ids: list[str]) -> str:
    loaded_ids = ", ".join(entity_ids) if entity_ids else "не указаны"
    return f"""# Задача пользователя
{task}

# Запрошенные сущности
{loaded_ids}

# Инвентарь пользователя
```json
{inventory}
```

# Точечная база знаний
{knowledge_context}

# Инструкция
Составь практичный план прокачки и фарма. Используй термины из контекста KB без переименования. Используй стандартную стоимость прокачки из KB для расчетов нехватки ресурсов.
"""


if __name__ == "__main__":
    raise SystemExit(main())
