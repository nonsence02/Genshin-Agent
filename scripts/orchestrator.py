"""Interactive Gemini tool-calling orchestrator for Genshin-Agent."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import google.generativeai as genai

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover - optional convenience dependency.
    load_dotenv = None


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.tools.artifact_info import get_artifact_set_details  # noqa: E402
from scripts.tools.artifact_scorer import recommend_best_artifacts  # noqa: E402
from scripts.tools.calculator import calculate_characters_requirements, resolve_character_id  # noqa: E402
from scripts.tools.character_info import get_character_lore  # noqa: E402
from scripts.tools.equipped_gear import get_character_equipment  # noqa: E402
from scripts.tools.stat_calculator import calculate_character_full_stats  # noqa: E402
from scripts.tools.weapon_calculator import calculate_weapon_ascension  # noqa: E402
from scripts.tools.weapon_info import get_weapon_details  # noqa: E402
from scripts.tools.weapon_recommender import recommend_best_weapon  # noqa: E402


DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

SYSTEM_PROMPT = """
Ты — Genshin Impact Агент. Твоя задача — отвечать на вопросы пользователя о его аккаунте,
экипировке, статах, ресурсах, оружии, артефактах и развитии персонажей.

КРИТИЧЕСКИ ВАЖНО:
- Если пользователь спрашивает статы, экипировку или рекомендации для персонажа, ты ОБЯЗАН вызвать соответствующий инструмент.
- Если пользователь спрашивает итоговые HP/АТК/DEF/криты/МС/восстановление энергии, вызови get_character_stats.
- Если пользователь спрашивает, что надето на персонаже, вызови get_equipped_gear.
- Если пользователь просит подобрать артефакт, вызови recommend_artifacts.
- Если пользователь просит подобрать оружие, вызови recommend_weapon.
- Если пользователь спрашивает материалы прокачки персонажа, вызови calculate_resources.
- Если пользователь спрашивает оружие, его пассивку, статы или материалы, вызови get_weapon_info или calculate_weapon_resources.
- Если пользователь спрашивает сет артефактов, вызови get_artifact_info.
- Если пользователь спрашивает отряды, синергию, роль или способности персонажей, вызови get_character_info.

ПРАВИЛО ИМЕН:
- Передавай имя персонажа строго в оригинальном виде из пользовательского запроса.
- НЕ переводи, НЕ исправляй ошибки, НЕ склоняй, НЕ заменяй на похожие имена.
- Например, если пользователь написал "Сяо", передай "Сяо". Категорически запрещено заменять "Сяо" на "Сян Лин".
- Python-инструменты сами распознают ID персонажа.

ПРАВИЛА ОТВЕТА:
- Отвечай строго на русском языке.
- Не придумывай данные, которых не вернул инструмент.
- Если инструмент вернул ошибку или пустой результат, честно скажи, что данных не найдено.
- Числа, статы и списки предметов бери только из результата инструмента.
- Финальный ответ форматируй в Markdown, кратко и практично.
""".strip()

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "calculate_resources",
            "description": "Точно рассчитать нехватку материалов для прокачки одного или нескольких персонажей с учетом инвентаря.",
            "parameters": {
                "type": "object",
                "properties": {
                    "character_names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Имена персонажей ровно как написал пользователь.",
                    },
                    "calculate_talents": {
                        "type": "boolean",
                        "description": "False, если пользователь просит только уровень/возвышение. True, если упоминает таланты.",
                    },
                    "target_talents": {
                        "type": "array",
                        "items": {"type": "integer"},
                        "description": "Цели талантов [обычная атака, навык, ульта], например [1, 9, 8] или [10, 10, 10].",
                    },
                },
                "required": ["character_names", "calculate_talents"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_character_info",
            "description": "Получить элемент, оружие, роль, таланты, пассивки и созвездия персонажа.",
            "parameters": {
                "type": "object",
                "properties": {
                    "character_names": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Имена персонажей ровно как написал пользователь.",
                    },
                },
                "required": ["character_names"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_weapon_info",
            "description": "Получить характеристики оружия, пассивный эффект и материалы возвышения.",
            "parameters": {
                "type": "object",
                "properties": {
                    "weapon_name": {"type": "string", "description": "Название или ключ оружия."},
                },
                "required": ["weapon_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_artifact_info",
            "description": "Получить информацию о сете артефактов: бонусы 2/4 частей и редкость.",
            "parameters": {
                "type": "object",
                "properties": {
                    "set_name": {"type": "string", "description": "Название сета артефактов."},
                },
                "required": ["set_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_artifacts",
            "description": "Подобрать лучшие свободные артефакты для персонажа на конкретный слот.",
            "parameters": {
                "type": "object",
                "properties": {
                    "character_id": {
                        "type": "string",
                        "description": "Имя персонажа ровно как написал пользователь или ID.",
                    },
                    "slot": {
                        "type": "string",
                        "enum": ["flower", "plume", "sands", "goblet", "circlet"],
                        "description": "Слот: flower, plume, sands, goblet или circlet.",
                    },
                },
                "required": ["character_id", "slot"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_equipped_gear",
            "description": "Посмотреть текущее оружие и артефакты персонажа.",
            "parameters": {
                "type": "object",
                "properties": {
                    "character_name": {
                        "type": "string",
                        "description": "Имя персонажа ровно как написал пользователь.",
                    },
                },
                "required": ["character_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "recommend_weapon",
            "description": "Подобрать лучшее свободное оружие для персонажа на основе инвентаря и билд-настроек.",
            "parameters": {
                "type": "object",
                "properties": {
                    "character_id": {
                        "type": "string",
                        "description": "Имя персонажа ровно как написал пользователь или ID.",
                    },
                },
                "required": ["character_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_character_stats",
            "description": "Посчитать точные итоговые характеристики персонажа с учетом уровня, оружия и артефактов.",
            "parameters": {
                "type": "object",
                "properties": {
                    "character_id": {
                        "type": "string",
                        "description": "Имя персонажа ровно как написал пользователь или ID.",
                    },
                },
                "required": ["character_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "calculate_weapon_resources",
            "description": "Рассчитать материалы возвышения оружия до 90 уровня.",
            "parameters": {
                "type": "object",
                "properties": {
                    "weapon_name": {"type": "string", "description": "Название или ключ оружия."},
                },
                "required": ["weapon_name"],
            },
        },
    },
]


def main() -> int:
    load_environment()
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY не найден. Добавьте его в .env или переменные окружения.")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        DEFAULT_MODEL,
        system_instruction=SYSTEM_PROMPT,
        tools=build_gemini_tools(),
        generation_config={"temperature": 0.1},
    )
    chat = model.start_chat(enable_automatic_function_calling=False)

    user_request = input("Введите вашу задачу: ").strip()
    if not user_request:
        user_request = "Посчитай статы персонажа."

    print("[⏳ Ожидание ответа от Gemini...]", flush=True)
    response = chat.send_message(user_request)
    final_response = handle_gemini_response(chat, response)

    print("\n--- Ответ агента ---\n")
    print(extract_text(final_response) or "Gemini не вернул текстовый ответ.")
    return 0


def load_environment() -> None:
    if load_dotenv is not None:
        load_dotenv(PROJECT_ROOT / ".env")


def build_gemini_tools() -> list[dict[str, Any]]:
    declarations = []
    for tool in TOOLS:
        function = tool["function"]
        declarations.append(
            {
                "name": function["name"],
                "description": function["description"],
                "parameters": clean_schema_for_gemini(function["parameters"]),
            }
        )
    return [{"function_declarations": declarations}]


def clean_schema_for_gemini(schema: Any) -> Any:
    if isinstance(schema, list):
        return [clean_schema_for_gemini(item) for item in schema]
    if not isinstance(schema, dict):
        return schema

    cleaned = {}
    for key, value in schema.items():
        if key in {"additionalProperties", "default"}:
            continue
        cleaned[key] = clean_schema_for_gemini(value)
    return cleaned


def handle_gemini_response(chat: Any, response: Any, max_rounds: int = 5) -> Any:
    current_response = response
    for _ in range(max_rounds):
        function_calls = extract_function_calls(current_response)
        if not function_calls:
            return current_response

        response_parts = []
        for function_name, arguments in function_calls:
            print(f"[⚙️ Gemini вызвал инструмент: {function_name} с аргументами: {arguments}]", flush=True)
            tool_result = execute_tool(function_name, arguments)
            response_parts.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=function_name,
                        response={"result": serialize_tool_result(tool_result)},
                    )
                )
            )

        current_response = chat.send_message(response_parts)

    return current_response


def extract_function_calls(response: Any) -> list[tuple[str, dict[str, Any]]]:
    calls: list[tuple[str, dict[str, Any]]] = []
    for part in get_response_parts(response):
        function_call = getattr(part, "function_call", None)
        if not function_call or not getattr(function_call, "name", ""):
            continue
        calls.append((function_call.name, dict(function_call.args or {})))
    return calls


def get_response_parts(response: Any) -> list[Any]:
    try:
        return list(response.parts)
    except (AttributeError, ValueError):
        pass

    parts: list[Any] = []
    for candidate in getattr(response, "candidates", []) or []:
        content = getattr(candidate, "content", None)
        parts.extend(getattr(content, "parts", []) or [])
    return parts


def extract_text(response: Any) -> str:
    try:
        return response.text
    except (AttributeError, ValueError):
        pass

    text_parts = []
    for part in get_response_parts(response):
        text = getattr(part, "text", "")
        if text:
            text_parts.append(text)
    return "\n".join(text_parts).strip()


def execute_tool(function_name: str, arguments: dict[str, Any]) -> Any:
    if function_name == "calculate_resources":
        return calculate_resources(
            character_names=extract_character_names(arguments),
            target_talents=extract_target_talents(arguments),
            calculate_talents=extract_calculate_talents(arguments),
        )
    if function_name == "get_character_info":
        return get_character_lore(character_names=extract_character_names(arguments))
    if function_name == "get_weapon_info":
        return get_weapon_details(str(arguments.get("weapon_name") or "").strip())
    if function_name == "get_artifact_info":
        return get_artifact_set_details(str(arguments.get("set_name") or "").strip())
    if function_name == "recommend_artifacts":
        return recommend_best_artifacts(
            character_id=str(arguments.get("character_id") or "").strip(),
            slot=str(arguments.get("slot") or "").strip(),
        )
    if function_name == "get_equipped_gear":
        return get_character_equipment(str(arguments.get("character_name") or "").strip())
    if function_name == "get_character_stats":
        return calculate_character_full_stats(
            str(arguments.get("character_id") or arguments.get("character_name") or "").strip()
        )
    if function_name == "calculate_weapon_resources":
        return calculate_weapon_ascension(str(arguments.get("weapon_name") or "").strip())
    if function_name == "recommend_weapon":
        raw_character = str(arguments.get("character_id") or arguments.get("character_name") or "").strip()
        resolved_character_id = resolve_character_id(raw_character) or raw_character
        return recommend_best_weapon(resolved_character_id)

    return {
        "error": "unknown_tool",
        "message": f"Unknown tool requested: {function_name}",
    }


def serialize_tool_result(value: Any) -> Any:
    if isinstance(value, (dict, list, str, int, float, bool)) or value is None:
        return value
    return str(value)


def extract_character_names(arguments: dict[str, Any]) -> list[str]:
    names = arguments.get("character_names")
    if isinstance(names, list):
        return [str(name).strip() for name in names if str(name).strip()]

    fallback = arguments.get("character_name") or arguments.get("character_id") or ""
    return [str(fallback).strip()] if str(fallback).strip() else []


def extract_target_talents(arguments: dict[str, Any]) -> list[int]:
    target_talents = arguments.get("target_talents")
    if isinstance(target_talents, list):
        normalized: list[int] = []
        for value in target_talents[:3]:
            try:
                normalized.append(max(1, min(10, int(value))))
            except (TypeError, ValueError):
                normalized.append(1)
        while len(normalized) < 3:
            normalized.append(1)
        return normalized

    return [10, 10, 10]


def extract_calculate_talents(arguments: dict[str, Any]) -> bool:
    value = arguments.get("calculate_talents", True)
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().casefold() not in {"false", "0", "no", "нет", "не"}
    return bool(value)


def calculate_resources(
    character_names: list[str],
    target_talents: list[int] | None = None,
    calculate_talents: bool = True,
) -> dict[str, Any]:
    if not character_names:
        return {
            "error": "missing_character_names",
            "message": "character_names is required.",
        }

    try:
        return calculate_characters_requirements(
            character_names=character_names,
            target_talents=target_talents,
            calculate_talents=calculate_talents,
        )
    except Exception as exc:  # noqa: BLE001 - tool errors must be returned to the agent as JSON.
        return {
            "error": "calculator_failed",
            "character_names": character_names,
            "target_talents": target_talents,
            "calculate_talents": calculate_talents,
            "message": str(exc),
        }


if __name__ == "__main__":
    raise SystemExit(main())
