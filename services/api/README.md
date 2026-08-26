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
│   ├── planner/          # orchestrates domain modules
│   ├── cost/             # roll-up
│   └── policy/           # lock/custom AI rules
└── shared/
    ├── http/             # Fastify app + reply helpers
    └── logging/          # pino file logger (logs/app.log, logs/error.log)
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

## Example calls

```bash
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
