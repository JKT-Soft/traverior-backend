# Traverior — Prompt Spec (Planner Fase 1)

> Skeleton tree only — **no tool calls**, **no invented prices**.

## Endpoint

`POST /v1/planner/skeleton`

```json
{
  "prompt": "Saya ingin liburan ke tempat terpopuler di Jepang…",
  "preferences": {
    "originCity": "Jakarta",
    "startDate": "2026-10-01",
    "endDate": "2026-10-10",
    "partySize": 2,
    "budgetTone": "budget",
    "pace": "moderate",
    "passportCountry": "ID"
  }
}
```

## System rules (summary)

- Output one JSON object matching `TripSkeleton` (`title`, `checkpoints[]`, …).
- Each checkpoint: `city`, `role` (`STAY`|`TRANSIT`|`DAY_TRIP`), `days`, `needs[]`.
- `needs` values: `flights` | `hotels` | `places` | `routes` | `weather` | `events` | `visa` | `checklist`.
- Do not invent live prices, durations in minutes, or availability.

## Providers

| `LLM_PROVIDER` | Behavior |
|----------------|----------|
| *(empty)* | `openai` if `OPENAI_API_KEY` set, else `heuristic` |
| `openai` | Chat Completions (`OPENAI_MODEL`, default `gpt-4o-mini`) |
| `heuristic` | Deterministic Japan-oriented stub (dev/tests/offline) |

## Next phases (not this doc)

- Fase 2: tool / MCP execution from `needs[]`
- Fase 3: optional narrative enrich
- Persist: `POST /v1/trips/:id/plan`
