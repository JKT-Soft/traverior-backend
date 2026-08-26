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
## Install

```bash
cd services/mcp
npm install
```

Copy provider env from `services/api/.env` (or export the same vars).

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
    "traverior-routes": {
      "command": "npx",
      "args": ["tsx", "src/routes/main.ts"],
      "cwd": "…/services/mcp",
      "env": {
        "PROVIDER_ROUTES": "mock"
      }
    }
  }
}
```

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
