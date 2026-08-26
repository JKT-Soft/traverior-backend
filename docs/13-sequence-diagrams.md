# Traverior — Sequence Diagrams (Backend)

Diagram urutan untuk alur backend yang sudah diimplementasi (modular monolith API + MCP).  
Render Mermaid di GitHub / VS Code / [mermaid.live](https://mermaid.live).

---

## 0. Ringkasan aktor

| Aktor | Peran |
|--------|--------|
| **Flutter** | Client mobile; HTTPS + Firebase / Dev token |
| **HTTP Server** | Fastify (`shared/http/app`) |
| **Auth** | Dev / Firebase provider |
| **Domain modules** | Flights, Hotels, Places, Routes, Weather, Events, Visa, Checklist, Journey, Planner, Cost, Policy |
| **Prisma / PostgreSQL** | Persistensi trip + pipeline tree |
| **MCP Client** | (Target) AI Planner memanggil tools via MCP |
| **MCP Server** | Connector stdio per domain; reuse API providers |
| **External APIs** | Duffel, LiteAPI, Google, OpenWeather, Eventbrite, Viator, Sherpa, … |

---

## 1. Lifecycle request HTTP (semua `/v1/*`)

```mermaid
sequenceDiagram
  autonumber
  actor Client as Flutter / HTTP Client
  participant S as Fastify App
  participant A as Auth Resolver
  participant H as Route Handler
  participant M as Domain Module

  Client->>S: HTTP request (Authorization?, body?)
  opt auth configured (onRequest hook)
    S->>A: resolve(req.raw)
    A-->>S: user | undefined
  end
  alt no route
    S-->>Client: 404 NOT_FOUND
  else route matched
    S->>H: handler(req, reply)
    H->>M: application service
    M-->>H: result
    H-->>S: ok / AppError
    alt AppError
      S-->>Client: status + { ok:false, error }
    else success
      S-->>Client: 200/201 + { ok:true, data }
    else unexpected
      S-->>Client: 500 INTERNAL_ERROR
    end
  end
```

---

## 2. Auth resolve (Dev vs Firebase)

```mermaid
sequenceDiagram
  autonumber
  participant S as HTTP Server
  participant Auth as AuthService
  participant Dev as DevAuthProvider
  participant FB as FirebaseAuthProvider
  participant Admin as firebase-admin

  S->>Auth: resolve(req)
  alt AUTH_MODE=dev
    Auth->>Dev: resolve(req)
    Dev->>Dev: parse Bearer / Bearer dev:uid
    Dev-->>Auth: { uid, email }
  else AUTH_MODE=firebase
    Auth->>FB: resolve(req)
    FB->>Admin: verifyIdToken(token)
    alt valid
      Admin-->>FB: decoded
      FB-->>Auth: { uid, email }
    else invalid
      FB-->>S: UnauthorizedError 401
    end
  end
  Auth-->>S: user
```

---

## 3. Buat trip + root pipeline node

`POST /v1/trips` — Flutter membuat journey baru.

```mermaid
sequenceDiagram
  autonumber
  actor App as Flutter
  participant S as HTTP Server
  participant Auth as Auth
  participant JR as Journey Routes
  participant JS as JourneyService
  participant DB as PostgreSQL (Prisma)

  App->>S: POST /v1/trips<br/>Authorization: Bearer …<br/>{ title, originCity, … }
  S->>Auth: resolve → user
  S->>JR: handler
  JR->>JR: requireUser(ctx.user)
  JR->>JS: ensureUser(firebaseUid, email)
  JS->>DB: user.upsert
  DB-->>JS: User
  JR->>JS: createTrip(input)
  JS->>DB: BEGIN transaction
  JS->>DB: trip.create (status=draft)
  JS->>DB: pipelineNode.create (type=JOURNEY, path=trip)
  JS->>DB: trip.update(rootNodeId)
  JS->>DB: COMMIT
  DB-->>JS: Trip + nodes
  JS-->>JR: trip
  JR-->>App: 201 { trip }
```

---

## 4. Tambah node kustom ke pipeline

`POST /v1/trips/:tripId/nodes`

```mermaid
sequenceDiagram
  autonumber
  actor App as Flutter
  participant JR as Journey Routes
  participant JS as JourneyService
  participant Pol as PolicyService
  participant DB as PostgreSQL

  App->>JR: POST /trips/:id/nodes<br/>{ parentId, type, title, content, … }
  JR->>JS: ensureUser + addNode
  JS->>DB: getTrip (nodes)
  alt parentId not in trip
    JS-->>App: 400 VALIDATION_ERROR
  else ok
    Note over Pol: AI mutate dicek saat replan<br/>(lock / custom / deleted)
    JS->>DB: pipelineNode.create<br/>(isCustom=true, origin=user)
    DB-->>JS: node
    JS-->>App: 201 { node }
  end
```

---

## 5. Enrich city (Planner MVP — in-process)

`POST /v1/planner/enrich-city`  
Phase 1: Planner memanggil **application services langsung** (bukan MCP). MCP path = target fase berikutnya.

```mermaid
sequenceDiagram
  autonumber
  actor App as Flutter / Debug
  participant PR as Planner Routes
  participant P as PlannerService
  participant H as Hotels
  participant Pl as Places
  participant E as Events
  participant W as Weather
  participant V as Visa
  participant C as Checklist
  participant R as Routes
  participant Prov as Infra Providers
  participant Ext as External APIs

  App->>PR: POST /v1/planner/enrich-city<br/>{ city, checkIn, checkOut, coords? }
  PR->>P: enrichCity(input)

  par Parallel enrichment
    P->>H: search(city, dates)
    H->>Prov: HotelProvider
    Prov->>Ext: LiteAPI / mock
    Ext-->>H: hotels
  and
    P->>Pl: searchRestaurants(city)
    Pl->>Prov: PlaceProvider
    Prov->>Ext: Google / mock
    Ext-->>Pl: places
  and
    P->>E: search(city, free+paid)
    E->>Prov: EventProvider
    Prov->>Ext: Eventbrite+Viator / mock
    Ext-->>E: events
  and
    opt destLat/destLng present
      P->>W: getForecast(lat,lon)
      W->>Prov: WeatherProvider
      Prov->>Ext: OpenWeather / mock
      Ext-->>W: forecast
    end
  and
    P->>V: getRequirements(passport→dest)
    V->>Prov: VisaProvider
    Prov->>Ext: Sherpa / static
    Ext-->>V: requirements
  end

  P->>C: generate(destination, visaDocuments)
  C-->>P: checklist

  opt origin+dest coords present
    P->>R: getRoute(TRANSIT)
    R->>Prov: RouteProvider
    Prov->>Ext: Google Routes / mock
    Ext-->>R: route
  end

  P-->>PR: { hotels, restaurants, events, weather, visa, checklist, route }
  PR-->>App: 200 { data }
```

---

## 6. Search flights via HTTP API

`POST /v1/flights/search`

```mermaid
sequenceDiagram
  autonumber
  actor App as Flutter
  participant FR as Flights Routes
  participant FS as FlightService
  participant Prov as FlightProvider<br/>(mock | duffel)
  participant Ext as Duffel API

  App->>FR: POST /v1/flights/search<br/>{ origin, destination, departureDate, … }
  FR->>FR: zod validate
  alt invalid
    FR-->>App: 400 VALIDATION_ERROR
  else valid
    FR->>FS: search(query)
    FS->>Prov: searchFlights(query)
    alt PROVIDER_FLIGHTS=duffel
      Prov->>Ext: POST offer_requests
      Ext-->>Prov: offers
    else mock
      Prov-->>Prov: synthetic offers
    end
    Prov-->>FS: FlightOffer[]
    FS-->>FR: offers
    FR-->>App: 200 { provider, offers }
  end
```

---

## 7. MCP tool call — search_flights (stdio)

Alur connector: MCP client (Cursor / future AI Planner) → MCP server → API provider module.

```mermaid
sequenceDiagram
  autonumber
  actor Client as MCP Client<br/>(Cursor / AI Planner)
  participant MCP as mcp-flights<br/>(stdio)
  participant RT as runtime.importApi
  participant API as API FlightModule
  participant Prov as Duffel / mock
  participant Ext as External API

  Client->>MCP: tools/call search_flights(args)
  Note over MCP: On process start:<br/>loadEnv + createFlightModule
  MCP->>RT: (already loaded) service.search
  MCP->>API: FlightService.search(args)
  API->>Prov: searchFlights
  Prov->>Ext: provider HTTP (if live)
  Ext-->>Prov: raw offers
  Prov-->>API: FlightOffer[]
  API-->>MCP: offers
  alt success
    MCP-->>Client: jsonResult { provider, offers }
  else error
    MCP-->>Client: errorResult { error }
  end

  Note over MCP,API: MCP tidak menulis PostgreSQL.<br/>Persistensi hanya lewat Journey API.
```

---

## 8. Target end-to-end: AI replan via MCP (fase berikutnya)

Sesuai `docs/03-architecture-tools.md` — Flutter tidak panggil LLM/MCP langsung.

```mermaid
sequenceDiagram
  autonumber
  actor App as Flutter
  participant API as Node API
  participant Plan as AI Planner
  participant LLM as LLM Provider
  participant MC as MCP Client (in Node)
  participant MS as MCP Servers
  participant DB as PostgreSQL
  participant Pol as PolicyService
  participant Cost as CostService

  App->>API: POST /v1/trips/:id/replan<br/>(intent / preferences)
  API->>Plan: start replan(tripId)
  Plan->>DB: load trip + nodes
  Plan->>LLM: skeleton tree (no tools)
  LLM-->>Plan: checkpoints / needs

  loop per tool need
    Plan->>LLM: tool-calling turn
    LLM-->>Plan: tool request
    Plan->>MC: call tool
    MC->>MS: MCP stdio tool
    MS-->>MC: provider data
    MC-->>Plan: tool result
    Plan->>Pol: canAiMutate(node)?
    alt allowed
      Plan->>DB: insert/update pipeline node
    else locked / custom / deleted
      Plan-->>Plan: skip / preserve user edit
    end
  end

  Plan->>Cost: rollupTrip(tripId)
  Cost->>DB: update node + trip totals
  Plan-->>API: replan summary
  API-->>App: 200 updated trip tree
```

---

## 9. Cost roll-up

```mermaid
sequenceDiagram
  autonumber
  participant Orch as Orchestrator / Planner
  participant Cost as CostService
  participant DB as PostgreSQL

  Orch->>Cost: rollupTrip(tripId)
  Cost->>DB: pipelineNode.findMany(tripId)
  loop depth = max → 0
    Cost->>Cost: sum children cost + duration
    Cost->>DB: pipelineNode.update(parent)
  end
  Cost->>DB: trip.update(totalCost, totalDuration)
  Cost-->>Orch: done
```

---

## 10. Peta alur → endpoint / tool

| Sequence | Trigger |
|----------|---------|
| §1 HTTP lifecycle | Semua request |
| §2 Auth | Header `Authorization` |
| §3 Create trip | `POST /v1/trips` |
| §4 Add node | `POST /v1/trips/:id/nodes` |
| §5 Enrich city | `POST /v1/planner/enrich-city` |
| §6 Flight search HTTP | `POST /v1/flights/search` |
| §7 MCP flights | MCP tool `search_flights` |
| §8 AI replan (target) | Belum di-wire LLM |
| §9 Cost roll-up | Dipanggil setelah mutate tree |

Gambar ringkas alur utama (enrich + persist target):  
[`traverior-backend-sequence-overview.png`](./traverior-backend-sequence-overview.png)
