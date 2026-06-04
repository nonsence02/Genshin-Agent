# Genshin-Agent Architecture

## Core Idea

Genshin-Agent is moving from a prompt-heavy local LLM planner to an agentic tool-calling architecture.

The LLM is no longer responsible for calculations, inventory analysis, material classification, or resource matching. Its role is limited to NLP routing:

- understand the user's natural-language request;
- identify which Python tool should be called;
- pass structured arguments such as `character_id`, target level, talent count, or weapon id;
- summarize the strict JSON result returned by tools.

All business logic lives in Python tools. This keeps calculations deterministic and avoids local model failures such as wrong multiplications, material hallucinations, and category confusion.

## Data Storage

All persistent project data should be JSON.

Markdown was useful while the LLM consumed the knowledge base directly, but the new architecture is code-first. Python tools need structured fields, not prose sections.

### Knowledge Base

Character and weapon knowledge is stored as JSON:

```text
knowledge_base/
  characters/
    aino.json
    hu-tao.json
  weapons/
    favonius-sword.json
```

Character JSON shape:

```json
{
  "id": "aino",
  "name": "Aino",
  "source_url": "https://genshin-impact.fandom.com/wiki/Aino",
  "profile": {
    "weapon": "Claymore",
    "element": "Electro",
    "rarity": "4★"
  },
  "skills": {
    "elemental_skill": "...",
    "elemental_burst": "..."
  },
  "materials": {
    "ascension": {
      "stones": ["Varunada Lazurite Sliver", "..."],
      "mob_drops": ["Broken Drive Shaft", "..."],
      "special": ["Portable Bearing", "Precision Kuuvahki Stamping Die"]
    },
    "talents": {
      "books": ["Teachings of Elysium", "..."],
      "mob_drops": ["Broken Drive Shaft", "..."],
      "weekly_boss": ["Silken Feather"],
      "crown": "Crown of Insight"
    }
  },
  "standard_costs": {
    "ascension_90": {
      "specialty": 168,
      "boss": 46,
      "stones": {"sliver": 1, "fragment": 9, "chunk": 9, "gemstone": 6},
      "mob_drops": {"low": 18, "mid": 30, "high": 36}
    },
    "talent_10": {
      "books": {"low": 3, "mid": 21, "high": 38},
      "mob_drops": {"low": 6, "mid": 22, "high": 31},
      "weekly_boss": 6,
      "crown": 1
    },
    "three_talents_10": {
      "books": {"low": 9, "mid": 63, "high": 114},
      "mob_drops": {"low": 18, "mid": 66, "high": 93},
      "weekly_boss": 18,
      "crown": 3
    }
  }
}
```

Weapon JSON follows the same principle: profile fields, passive text, categorized ascension materials, and standard weapon costs.

### Inventory

Inventory is read natively from the raw Inventory Camera GOOD JSON file:

```text
data/raw/inventory.json
```

We no longer convert inventory into Markdown for planning. Tools parse the GOOD structure directly and extract resources by `key`, `name`, or any available count fields.

## Tools

Python tools live under:

```text
scripts/tools/
  calculator.py
  inventory_mgr.py
```

Planned responsibilities:

- `calculator.py`: deterministic resource math for character and weapon goals.
- `inventory_mgr.py`: GOOD inventory loading, resource lookup, normalization, and future manual overrides.
- future tools: resin planner, weekly boss planner, domain schedule resolver, artifact evaluator.

Tools must return strict JSON-compatible Python dictionaries. They must not call an LLM.

## Runtime Flow

1. User writes a natural-language request.
2. LLM extracts intent and arguments.
3. Orchestrator calls the appropriate Python tool.
4. Tool reads JSON KB and raw GOOD inventory.
5. Tool returns a strict JSON result with requirements, owned amounts, and missing amounts.
6. LLM formats that result for the user without changing the math.

The architecture goal is simple: language in the model, logic in Python.
