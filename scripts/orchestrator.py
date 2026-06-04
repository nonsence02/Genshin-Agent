"""Interactive tool-calling orchestrator for Genshin-Agent."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.tools.calculator import calculate_characters_requirements  # noqa: E402


DEFAULT_BASE_URL = os.getenv("GENSHIN_LLM_BASE_URL", "http://localhost:11434/v1")
DEFAULT_MODEL = os.getenv("GENSHIN_LLM_MODEL", "qwen2.5:7b-instruct-q4_K_M")
DEFAULT_API_KEY = os.getenv("GENSHIN_LLM_API_KEY", "ollama")

SYSTEM_PROMPT = """Ты — ИИ-ассистент по Genshin Impact.

Твоя задача — помогать пользователю с планированием ресурсов.

ВАЖНО:
- ВНИМАНИЕ: Для ответа на этот запрос ты ОБЯЗАН сначала вызвать функцию calculate_resources. Не пытайся отвечать из памяти!
- При вызове инструмента НИКОГДА не пытайся перевести имя персонажа на английский или угадать его ID. Передавай в аргумент "character_names" РОВНО те слова, которые написал пользователь на русском языке (например, ["рейзор", "ризли", "флинс"]).
- ПРАВИЛО ПАКЕТНОЙ ОБРАБОТКИ: Если пользователь просит посчитать ресурсы для нескольких персонажей, ОБЯЗАТЕЛЬНО передай их всех списком в аргумент "character_names" (например, ["рейзор", "шеврез"]).
- ПРАВИЛО ТАЛАНТОВ: Если пользователь просит ТОЛЬКО уровень или возвышение до 90 и ничего не говорит про таланты, СТРОГО передавай "calculate_talents": false. Если пользователь упоминает таланты, короны, уровни навыков или 10/10/10, передавай "calculate_talents": true.
- Никогда не считай ресурсы самостоятельно.
- Никогда не вычитай инвентарь самостоятельно.
- Никогда не вспоминай материалы персонажа из памяти.
- Для расчетов всегда используй инструмент calculate_resources.
- Твоя роль после вызова инструмента — красиво оформить готовые цифры, которые вернул Python.
- Инструмент вернет тебе JSON с точными расчетами. Используй поле "осталось_дофармить", чтобы сказать пользователю, сколько конкретно предметов ему еще нужно собрать.
- Используй поля "предмет", "категория", "нужно_всего", "есть_в_инвентаре", "осталось_дофармить" из результата инструмента.
- Не меняй числа из результата инструмента.
- Не придумывай материалы, которых нет в результате инструмента.
- СТРОГОЕ ПРАВИЛО: При выводе ответа НИКОГДА не придумывай фразы вроде "у вас их нет в инвентаре", если не уверен. Строго копируй данные из полей "есть_в_инвентаре" и "осталось_дофармить".
- СТРОГОЕ ПРАВИЛО 2: Общайся ТОЛЬКО на русском языке. Запрещено использовать китайский.
- Если инструмент вернул информацию о днях фарма ("дни_фарма") и источниках ("где_найти"), обязательно переведи эти данные на русский язык в финальном ответе и посоветуй пользователю, в какие дни лучше идти в подземелья.
- ПРАВИЛО РАСПИСАНИЯ: Если в данных предмета указан "режим_сбора" (например, "Ежедневно" или "1 раз в неделю"), СТРОГО указывай это пользователю. НИКОГДА не говори "следите за днями фарма" или "не упустите дни" для диковинок, обычных мобов и обычных боссов — они доступны всегда. Расписание по дням недели существует ТОЛЬКО для книг талантов и материалов оружия.
- Отвечай на русском языке, кратко и практично, в Markdown.
"""

TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "calculate_resources",
            "description": (
                "Высчитывает точную нехватку материалов для прокачки персонажа "
                "с учетом сырого Inventory Camera GOOD inventory.json и JSON базы знаний."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "character_names": {
                        "type": "array",
                        "description": "Список имен персонажей ровно как написал пользователь. Не переводи на английский и не угадывай ID. Примеры: [\"рейзор\", \"шеврез\"], [\"ризли\"], [\"флинс\", \"aino\"].",
                        "items": {
                            "type": "string",
                        },
                        "minItems": 1,
                    },
                    "calculate_talents": {
                        "type": "boolean",
                        "description": "False, если пользователь просит только уровень/возвышение до 90 и не говорит про таланты. True, если пользователь упоминает таланты, короны, уровни навыков или 10/10/10.",
                    },
                    "target_talents": {
                        "type": "array",
                        "description": "Целевые уровни трех талантов в порядке [обычная атака, элементальный навык, взрыв стихии]. Например [1, 9, 8]. Если пользователь просит все таланты на 10, передай [10, 10, 10].",
                        "items": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 10,
                        },
                        "minItems": 3,
                        "maxItems": 3,
                        "default": [10, 10, 10],
                    },
                },
                "required": ["character_names", "calculate_talents"],
                "additionalProperties": False,
            },
        },
    }
]


def main() -> int:
    try:
        from openai import OpenAI
    except ImportError as exc:
        raise RuntimeError("Install `openai` first: pip install openai") from exc

    user_request = input("Введите вашу задачу: ").strip()
    if not user_request:
        user_request = "Посчитай ресурсы для прокачки персонажа."

    client = OpenAI(base_url=DEFAULT_BASE_URL, api_key=DEFAULT_API_KEY)
    messages: list[dict[str, Any]] = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_request},
    ]

    print("[⏳ Ожидание ответа от нейросети...]", flush=True)
    first_response = client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=messages,
        tools=TOOLS,
        tool_choice={"type": "function", "function": {"name": "calculate_resources"}},
        temperature=0.1,
    )
    assistant_message = first_response.choices[0].message
    messages.append(assistant_message.model_dump(exclude_none=True))

    tool_calls = assistant_message.tool_calls or []
    if not tool_calls:
        print("\n--- Ответ агента ---\n")
        content = assistant_message.content or "Модель не вызвала инструмент. Уточните ID персонажа, например: aino."
        print(content)
        return 0

    for tool_call in tool_calls:
        print(f"[⚙️ Нейросеть вызвала инструмент: {tool_call.function.name}. Считаю...]", flush=True)
        tool_result = execute_tool_call(tool_call)
        messages.append(
            {
                "role": "tool",
                "tool_call_id": tool_call.id,
                "name": tool_call.function.name,
                "content": json.dumps(tool_result, ensure_ascii=False),
            }
        )

    print("\n--- Ответ агента ---\n")
    stream = client.chat.completions.create(
        model=DEFAULT_MODEL,
        messages=messages,
        temperature=0.2,
        stream=True,
    )
    for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            print(delta, end="", flush=True)
    print()
    return 0


def execute_tool_call(tool_call: Any) -> dict[str, Any]:
    function_name = tool_call.function.name
    try:
        arguments = json.loads(tool_call.function.arguments or "{}")
    except json.JSONDecodeError as exc:
        return {
            "error": "invalid_tool_arguments",
            "message": f"Could not parse tool arguments as JSON: {exc}",
            "raw_arguments": tool_call.function.arguments,
        }

    if function_name != "calculate_resources":
        return {
            "error": "unknown_tool",
            "message": f"Unknown tool requested: {function_name}",
        }

    return calculate_resources(
        character_names=extract_character_names(arguments),
        target_talents=extract_target_talents(arguments),
        calculate_talents=extract_calculate_talents(arguments),
    )


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

    if "talents_count" in arguments:
        try:
            talents_count = max(0, min(3, int(arguments.get("talents_count", 3))))
        except (TypeError, ValueError):
            talents_count = 3
        return [10 if index < talents_count else 1 for index in range(3)]

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
