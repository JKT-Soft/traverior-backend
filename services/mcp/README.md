# Traverior MCP Servers

Per-domain MCP tool servers. Each process is **stateless** and reuses provider adapters from `services/api` (same `PROVIDER_*` env).

```
services/mcp/src/
├── shared/runtime.ts
├── test/helpers.ts
├── flights/{server,main,server.test}.ts
├── hotels/...
├── places/...
├── routes/...
├── weather/...
├── events/...
├── visa/...
└── checklist/...
```

`server.ts` registers tools; `main.ts` is the stdio entrypoint.

The API Planner talks to these tools via `MCP_MODE=stdio` (spawn) or `MCP_MODE=inprocess` (same tool names against domain services). See `services/api/README.md`.

---

## Install

```bash
cd services/mcp
npm install
```

Copy provider env from `services/api/.env` (or export the same vars). Child processes spawned by the API inherit the API process env.

## Run one server (stdio)

```bash
npm run flights
npm run hotels
npm run places
npm run routes
npm run weather
npm run events
npm run visa
npm run checklist
```

These speak **MCP over stdio** — intended for an MCP client (AI Planner in the API, Cursor, Claude Desktop, etc.).

On ready, each server logs to stderr, e.g. `[mcp-flights] MCP server ready (stdio)`.

---

## Tool catalog

| Server | npm script | Tools | Provider env |
|--------|------------|-------|--------------|
| `mcp-flights` | `npm run flights` | `search_flights`, `get_offer` | `PROVIDER_FLIGHTS` (`mock` \| `duffel`) |
| `mcp-hotels` | `npm run hotels` | `search_hotels` | `PROVIDER_HOTELS` (`mock` \| `liteapi`) |
| `mcp-places` | `npm run places` | `search_restaurants`, `search_pois`, `search_places` | `PROVIDER_PLACES` (`mock` \| `google`) |
| `mcp-routes` | `npm run routes` | `get_route` | `PROVIDER_ROUTES` (`mock` \| `google`) |
| `mcp-weather` | `npm run weather` | `get_forecast`, `get_weather_alerts` | `PROVIDER_WEATHER` (`mock` \| `openweather`) |
| `mcp-events` | `npm run events` | `search_events`, `search_tours` | `PROVIDER_EVENTS` (`mock` \| `eventbrite` \| `composite`) |
| `mcp-visa` | `npm run visa` | `get_visa_requirements` | `PROVIDER_VISA` (`static` \| `sherpa`) |
| `mcp-checklist` | `npm run checklist` | `generate_checklist` | Internal template (no third-party) |

### Response envelope

Every tool returns MCP text content with JSON:

**Success**

```json
{
  "ok": true,
  "data": { "provider": "<name>", "...": "..." },
  "fetchedAt": "2026-08-27T00:00:00.000Z"
}
```

**Error**

```json
{
  "ok": false,
  "error": "message"
}
```

(`isError: true` is also set on the MCP result when the handler fails.)

---

### 1. `mcp-flights`

#### `search_flights`

Search flight offers between airports (IATA). Prices come from the configured flight provider.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `origin` | string (3) | yes | IATA, e.g. `CGK` |
| `destination` | string (3) | yes | IATA, e.g. `KIX` |
| `departureDate` | string | yes | `YYYY-MM-DD` |
| `returnDate` | string | no | `YYYY-MM-DD` |
| `adults` | number (int > 0) | no | |
| `cabinClass` | enum | no | `economy` \| `premium_economy` \| `business` \| `first` |

**Data:** `{ provider, offers }`

#### `get_offer`

Get a single flight offer by provider offer id.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `offerId` | string | yes | Provider offer id |

**Data:** `{ provider, offer }`

---

### 2. `mcp-hotels`

#### `search_hotels`

Search hotel rates for a city and stay dates.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `cityName` | string | yes | e.g. `Osaka` |
| `countryCode` | string | no | e.g. `JP` |
| `checkIn` | string | yes | `YYYY-MM-DD` |
| `checkOut` | string | yes | `YYYY-MM-DD` |
| `adults` | number (int > 0) | no | |
| `currency` | string | no | e.g. `IDR` |
| `guestNationality` | string | no | |

**Data:** `{ provider, hotels }`

---

### 3. `mcp-places`

#### `search_restaurants`

Search restaurants / food places in a city.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `city` | string | yes | |
| `dietary` | string[] | no | e.g. `["halal"]` |

**Data:** `{ provider, places }`

#### `search_pois`

Search points of interest / attractions in a city.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `city` | string | yes | |

**Data:** `{ provider, places }`

#### `search_places`

Generic Places text search.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `textQuery` | string | yes | Free-text query |
| `maxResultCount` | number (int > 0) | no | |

**Data:** `{ provider, places }`

---

### 4. `mcp-routes`

#### `get_route`

Compute duration/distance between two coordinates.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `originLat` | number | yes | |
| `originLng` | number | yes | |
| `destinationLat` | number | yes | |
| `destinationLng` | number | yes | |
| `mode` | enum | no | `DRIVE` \| `WALK` \| `BICYCLE` \| `TRANSIT` |

**Data:** `{ provider, route }`

---

### 5. `mcp-weather`

#### `get_forecast`

Get weather forecast and alerts for lat/lon.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `lat` | number | yes | |
| `lon` | number | yes | |

**Data:** `{ provider, forecast }`

#### `get_weather_alerts`

Get weather alerts only (same forecast source; returns `alerts` array).

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `lat` | number | yes | |
| `lon` | number | yes | |

**Data:** `{ provider, alerts }`

---

### 6. `mcp-events`

#### `search_events`

Search free and/or paid events in a city (Eventbrite-oriented).

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `city` | string | yes | |
| `startDate` | string | no | |
| `endDate` | string | no | |
| `includeFree` | boolean | no | |
| `includePaid` | boolean | no | |

**Data:** `{ provider, events }`

#### `search_tours`

Search paid tours/activities (Viator-oriented; forces `includeFree=false`, `includePaid=true`).

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `city` | string | yes | |
| `startDate` | string | no | |
| `endDate` | string | no | |

**Data:** `{ provider, events }`

---

### 7. `mcp-visa`

#### `get_visa_requirements`

Get visa / document requirements for a passport → destination pair.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `passportCountry` | string (min 2) | yes | e.g. `ID` |
| `destinationCountry` | string (min 2) | yes | e.g. `JP` |
| `travelDate` | string | no | |

**Data:** `{ provider, requirements }`

---

### 8. `mcp-checklist`

#### `generate_checklist`

Generate packing / preparation checklist for a destination.

| Arg | Type | Required | Notes |
|-----|------|----------|-------|
| `destination` | string | yes | City or country label |
| `passportCountry` | string | no | |
| `visaDocuments` | string[] | no | Merged ahead of template items |

**Data:** `{ provider, checklist }`

---

## Call tools from the API (stdio mode)

```env
# services/api/.env
MCP_MODE=stdio
```

```bash
# list tool names known to the Planner client
curl http://localhost:3000/v1/planner/tools

# invoke one tool (API spawns the matching MCP server on first use)
curl -X POST http://localhost:3000/v1/planner/tools/call \
  -H "content-type: application/json" \
  -d '{"tool":"search_flights","arguments":{"origin":"CGK","destination":"KIX","departureDate":"2026-10-01"}}'
```

---

## Example Cursor MCP config

```json
{
  "mcpServers": {
    "traverior-flights": {
      "command": "npx",
      "args": ["tsx", "src/flights/main.ts"],
      "cwd": "…/services/mcp",
      "env": {
        "PROVIDER_FLIGHTS": "mock"
      }
    },
    "traverior-hotels": {
      "command": "npx",
      "args": ["tsx", "src/hotels/main.ts"],
      "cwd": "…/services/mcp",
      "env": {
        "PROVIDER_HOTELS": "mock"
      }
    },
    "traverior-places": {
      "command": "npx",
      "args": ["tsx", "src/places/main.ts"],
      "cwd": "…/services/mcp",
      "env": {
        "PROVIDER_PLACES": "mock"
      }
    },
    "traverior-routes": {
      "command": "npx",
      "args": ["tsx", "src/routes/main.ts"],
      "cwd": "…/services/mcp",
      "env": {
        "PROVIDER_ROUTES": "mock"
      }
    },
    "traverior-weather": {
      "command": "npx",
      "args": ["tsx", "src/weather/main.ts"],
      "cwd": "…/services/mcp",
      "env": {
        "PROVIDER_WEATHER": "mock"
      }
    },
    "traverior-events": {
      "command": "npx",
      "args": ["tsx", "src/events/main.ts"],
      "cwd": "…/services/mcp",
      "env": {
        "PROVIDER_EVENTS": "mock"
      }
    },
    "traverior-visa": {
      "command": "npx",
      "args": ["tsx", "src/visa/main.ts"],
      "cwd": "…/services/mcp",
      "env": {
        "PROVIDER_VISA": "static"
      }
    },
    "traverior-checklist": {
      "command": "npx",
      "args": ["tsx", "src/checklist/main.ts"],
      "cwd": "…/services/mcp"
    }
  }
}
```

On Windows, prefer `"command": "npx.cmd"` if spawn fails.

---

## Tests

Unit tests are colocated as `*.test.ts` next to each server/runtime file.

```bash
npm test
npm run test:coverage
```

## Design rules

1. MCP servers **do not write to PostgreSQL**.
2. Swap providers with the same env as the API (`PROVIDER_FLIGHTS=duffel`, etc.).
3. AI Planner (Node) should call these tools via MCP client; HTTP `/v1/*` routes remain for Flutter / debugging.
4. Prices, times, and distances must come from tool/provider responses — never invented by the LLM.
