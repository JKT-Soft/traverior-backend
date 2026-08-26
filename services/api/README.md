# Traverior API — Modular Monolith

Fastify + TypeScript + Prisma + PostgreSQL.

## Architecture

```
src/
├── container.ts          # wires modules + provider selection
├── modules/
│   ├── flights/          # port + Duffel/mock adapters
│   ├── hotels/           # port + LiteAPI/mock
│   ├── places/           # port + Google/mock
│   ├── routes/           # port + Google Routes/mock
│   ├── weather/          # port + OpenWeather/mock
│   ├── events/           # port + Eventbrite+Viator/mock
│   ├── visa/             # port + Sherpa/static
│   ├── checklist/        # internal templates
│   ├── journey/          # trips + pipeline tree (Prisma)
│   ├── planner/          # LLM skeleton + domain enrichment
│   ├── cost/             # roll-up
│   └── policy/           # lock/custom AI rules
└── shared/
    ├── http/             # Fastify app + reply helpers
    ├── logging/          # pino file logger (logs/app.log, logs/error.log)
    └── cache/            # Redis / memory cache-aside for providers
```

**Swap a provider** without touching domain code:

```env
PROVIDER_FLIGHTS=duffel   # or mock
PROVIDER_HOTELS=liteapi   # or mock
PROVIDER_PLACES=google    # or mock
PROVIDER_ROUTES=google    # or mock
PROVIDER_WEATHER=openweather
PROVIDER_EVENTS=mock
PROVIDER_VISA=static
```

## Quick start

```bash
# from repo root
docker compose up -d postgres

cd services/api
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev
```

Health: `GET http://localhost:3000/health`

Auth (dev): header `Authorization: Bearer dev:demo-user`

## Logs

Request/error logs go to console and files (JSON lines):

| File | Contents |
|------|----------|
| `logs/app.log` | info+ (requests, errors) |
| `logs/error.log` | warn+ and errors only |

```env
LOG_DIR=logs
LOG_LEVEL=info
```

## Redis cache (third-party providers + trips)

Flights, hotels, places, routes, weather, events, visa, and trip reads (`/v1/trips`) are cached (cache-aside). Trip writes invalidate related keys.

```bash
# from repo root
docker compose up -d redis
```

```env
CACHE_ENABLED=true
REDIS_URL=redis://localhost:6379
CACHE_TTL_FLIGHTS=900
CACHE_TTL_HOTELS=900
CACHE_TTL_PLACES=86400
CACHE_TTL_ROUTES=3600
CACHE_TTL_WEATHER=1800
CACHE_TTL_EVENTS=1800
CACHE_TTL_VISA=604800
CACHE_TTL_TRIPS=60
```

Without `REDIS_URL`, the API falls back to **in-memory** cache. Set `CACHE_ENABLED=false` to disable.

## Example calls

```bash
# planner skeleton (LLM Fase 1)
curl -X POST http://localhost:3000/v1/planner/skeleton \
  -H "content-type: application/json" \
  -d '{"prompt":"Liburan ke Jepang peak season budget affordable","preferences":{"originCity":"Jakarta","partySize":2}}'

# flights (mock)
curl -X POST http://localhost:3000/v1/flights/search \
  -H "content-type: application/json" \
  -d '{"origin":"CGK","destination":"KIX","departureDate":"2026-10-01"}'

# create trip
curl -X POST http://localhost:3000/v1/trips \
  -H "authorization: Bearer dev:demo-user" \
  -H "content-type: application/json" \
  -d '{"title":"Japan 2026","originCity":"Jakarta","destinationSummary":"Osaka"}'
```

### LLM env

```env
LLM_PROVIDER=           # empty = openai if OPENAI_API_KEY set, else heuristic
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

## Tests

Unit tests are colocated next to source files as `*.test.ts` (for example `env.ts` → `env.test.ts`).

```bash
npm test              # Node.js built-in test runner via tsx
npm run test:coverage # compile + c8 (100% lines/branches/functions/statements)
```

Shared test helpers live in `src/test/helpers.ts` (not covered). Coverage excludes process entry (`src/index.ts`), Prisma singleton, and type-only ports.

## Adding a new provider

1. Implement the module `*Provider` interface in `infra/`.
2. Register it in the module `create*Provider` switch.
3. Set `PROVIDER_*=yourprovider` in env.

MCP sidecars (later) should call the same application services — not duplicate HTTP adapters.
