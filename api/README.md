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
    ├── logging/          # pino file logger (logs/YYYY-MM-DD/app.log)
    └── cache/            # Redis / memory cache-aside for providers
```

**Swap a provider** without touching domain code:

```env
PROVIDER_FLIGHTS=duffel   # or mock | aviasales (TRAVELPAYOUTS_TOKEN) | google (Google Flights scrape)
# Flights offer detail: POST /v1/flights/offers/detail (vendor booking options + itinerary)
# When PROVIDER_FLIGHTS=google, install Chromium once for Playwright booking capture
# (View offer vendors; first call ~15–45s while Chromium warms):
#   npx playwright install chromium
PROVIDER_HOTELS=liteapi   # or mock
PROVIDER_PLACES=google    # or mock
PROVIDER_ROUTES=google    # or mock
PROVIDER_WEATHER=openweather
PROVIDER_EVENTS=mock
PROVIDER_VISA=static
PROVIDER_IMAGES=unsplash   # or mock
```

## Quick start

```bash
# from repo root
docker compose up -d postgres

cd services/api
cp .env.example .env
npm install
npx playwright install chromium   # Google Flights booking options (PROVIDER_FLIGHTS=google)
npx prisma migrate dev --name init
npm run dev
```

Health: `GET http://localhost:3000/health` (liveness + ping singkat ke provider external yang aktif)

Swagger UI: [http://localhost:3000/docs](http://localhost:3000/docs) — OpenAPI JSON at `/docs/json`. The page is gated by **HTTP Basic Auth**; the browser will prompt before the UI loads.

- Username: `traverior`
- Password: `TraveriorDocs2026`

After that, call **Auth → Get a test Bearer token**; the returned `idToken` is set as Bearer automatically. Only `/health` and `POST /v1/auth/test-token` skip Firebase auth. `/docs` skips Firebase but still requires Basic Auth when those env vars are set.

Auth (dev): header `Authorization: Bearer dev:demo-user`

## Logs

Request/error logs go to console and files (JSON lines):

| File | Contents |
|------|----------|
| `logs/YYYY-MM-DD/app.log` | info+ (requests, errors) |
| `logs/YYYY-MM-DD/error.log` | warn+ and errors only |

Folder tanggal memakai zona waktu server (hari berganti = file baru, termasuk jika proses jalan melewati tengah malam).

```env
LOG_DIR=logs
LOG_LEVEL=info
```

## Redis cache (third-party providers + trips)

Flights, hotels, places, routes, weather, events, visa, images, and trip reads (`/v1/trips`) are cached (cache-aside). Trip writes invalidate related keys.

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
CACHE_TTL_IMAGES=604800
```

Without `REDIS_URL`, the API falls back to **in-memory** cache. Set `CACHE_ENABLED=false` to disable.

## Auth

`AUTH_MODE=firebase` (default for local `.env`). The mobile app signs in with **Google via Firebase Auth**, then sends the ID token on every request:

```
Authorization: Bearer <firebase-id-token>
```

Only `GET /health` and `POST /v1/auth/test-token` (dev only) skip Firebase/dev Bearer auth. Swagger (`/docs`) is public to Bearer auth but requires HTTP Basic Auth when `SWAGGER_BASIC_USER` and `SWAGGER_BASIC_PASSWORD` are set. All other `/v1/*` routes return `401` without a valid token.

```env
AUTH_MODE=firebase
FIREBASE_PROJECT_ID=your-firebase-project-id
# optional — service account JSON; verifyIdToken works with project ID
GOOGLE_APPLICATION_CREDENTIALS=./secrets/firebase-admin.json
# Web API key — POST /v1/auth/test-token (not available in production)
FIREBASE_WEB_API_KEY=
FIREBASE_TEST_EMAIL=
FIREBASE_TEST_PASSWORD=
SWAGGER_BASIC_USER=traverior
SWAGGER_BASIC_PASSWORD=TraveriorDocs2026
```

In Swagger, run **Auth → Get a test Bearer token** — `idToken` is applied automatically as the Bearer token for later requests.

```bash
# get a Firebase ID token (no auth header)
curl -X POST http://localhost:3000/v1/auth/test-token \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"your-password"}'
```

## Example calls

```bash
# liveness + ping provider external (no auth)
curl http://localhost:3000/health

# planner skeleton
curl -X POST http://localhost:3000/v1/planner/skeleton \
  -H "authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"prompt":"Liburan ke Jepang peak season budget affordable","preferences":{"originCity":"Jakarta","partySize":2}}'

# location images (Unsplash / mock)
curl -X POST http://localhost:3000/v1/images/location \
  -H "authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"location":"Osaka","perPage":3}'

# flights
curl -X POST http://localhost:3000/v1/flights/search \
  -H "authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"origin":"CGK","destination":"KIX","departureDate":"2026-10-01"}'

# create trip
curl -X POST http://localhost:3000/v1/trips \
  -H "authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"title":"Japan 2026","originCity":"Jakarta","destinationSummary":"Osaka"}'

# plan trip (LLM + MCP + persist pipeline nodes)
curl -X POST http://localhost:3000/v1/trips/<TRIP_ID>/plan \
  -H "authorization: Bearer $FIREBASE_ID_TOKEN" \
  -H "content-type: application/json" \
  -d '{"prompt":"7 hari Jepang budget affordable","preferences":{"originCity":"Jakarta","partySize":2},"context":{"originIata":"CGK","destinationIata":"KIX","departureDate":"2026-10-01","checkIn":"2026-10-01","checkOut":"2026-10-08"}}'
```

### LLM env

```env
LLM_PROVIDER=           # empty = openai if OPENAI_API_KEY set, else heuristic
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o-mini
```

### MCP client (Planner Fase 2)

```env
MCP_MODE=inprocess      # inprocess | stdio
# MCP_SERVERS_DIR=../mcp
```

Test MCP tool call:

```bash
curl http://localhost:3000/v1/planner/tools

curl -X POST http://localhost:3000/v1/planner/tools/call \
  -H "content-type: application/json" \
  -d '{"tool":"search_flights","arguments":{"origin":"CGK","destination":"KIX","departureDate":"2026-10-01"}}'

curl -X POST http://localhost:3000/v1/planner/plan \
  -H "content-type: application/json" \
  -d '{"prompt":"7 hari Jepang","context":{"checkIn":"2026-10-01","checkOut":"2026-10-08","originIata":"CGK","destinationIata":"KIX","departureDate":"2026-10-01"}}'
```

Set `MCP_MODE=stdio` to spawn real MCP server processes under `services/mcp` (requires `npx tsx` on PATH).

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
