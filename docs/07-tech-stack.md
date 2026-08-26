# Traverior — Tech Stack (Locked)

> Stack resmi proyek. Semua perencanaan teknis mengikuti dokumen ini.

## Stack Resmi

| Layer | Teknologi | Catatan |
|-------|-----------|---------|
| **Mobile frontend** | **Flutter** | Satu codebase Android + iOS |
| **Backend API** | **Node.js + Fastify (modular monolith)** | Satu API entrypoint; modul domain: auth, journey, planner, policy, cost |
| **Tool layer** | **MCP Servers** (connector adapter) | Bisa jalan sebagai proses/sidecar terpisah, tapi tetap bukan microservice bisnis utama |
| **ORM / DB** | **Prisma + PostgreSQL** | Source of truth trip & pipeline tree |
| **Auth** | **Firebase Authentication** | ID token; verifikasi di Node middleware |
| **LLM** | **OpenAI / Claude** | Planning & reasoning via MCP function calling |
| **Infra** | **Docker** + **Linux VPS** | Compose: api + mcp services + postgres |
| **CI/CD** | **Git + GitHub Actions** | Lint/test → build image → deploy VPS |
| **Provider APIs** | Duffel · LiteAPI · Google · OpenWeather · Eventbrite · Viator · Sherpa | Dipanggil dari MCP servers |

## Arsitektur Runtime

```
┌─────────────────────┐
│  Flutter App        │
│  (iOS / Android)    │
└──────────┬──────────┘
           │ HTTPS + Firebase ID Token
           ▼
┌──────────────────────────────────────────┐
│  Node.js API (Modular Monolith)          │
│  ├── Auth module (Firebase Admin)         │
│  ├── Routes (HTTP entrypoint)            │
│  ├── Journey module (pipeline CRUD)     │
│  ├── Planner module (LLM + MCP client)  │
│  ├── Policy module (lock/custom rules)  │
│  └── Cost module (roll-up, snapshot/diff)│
└──────────┬───────────────────────┬──────┘
           │          │
           ▼          ▼
      PostgreSQL   MCP Servers (services/mcp/)
      (Prisma)     ├── mcp-flights   → Duffel
                   ├── mcp-hotels    → LiteAPI
                   ├── mcp-places    → Google Places
                   ├── mcp-routes    → Google Routes
                   ├── mcp-weather   → OpenWeather
                   ├── mcp-events    → Eventbrite + Viator
                   ├── mcp-visa      → Sherpa
                   └── mcp-checklist → Internal
```

## Repo Structure (Target)

```
AI travel agent/
├── apps/
│   └── mobile/                 # Flutter
├── services/
│   ├── api/                    # Node.js + Prisma (orchestrator)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   │   ├── journey/
│   │   │   │   ├── planner/    ← LLM + MCP client
│   │   │   │   └── cost/
│   │   │   └── middleware/
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── Dockerfile
│   │   └── package.json
│   └── mcp/                    # MCP servers (per provider)
│       ├── flights/             ← Duffel
│       ├── hotels/              ← LiteAPI
│       ├── places/              ← Google Places
│       ├── routes/              ← Google Routes
│       ├── weather/             ← OpenWeather
│       ├── events/              ← Eventbrite + Viator
│       ├── visa/                ← Sherpa
│       └── checklist/           ← Internal
├── docker-compose.yml          # api + postgres + mcp services
├── .github/workflows/          # CI/CD
└── docs/
```

## Keputusan Desain Stack

### Backend Node.js + Fastify
- Struktur: Fastify plugins per domain → application services → Prisma / provider adapters.
- HTTP layer memakai **Fastify** (`buildApp`, route plugins, `ok`/`fail` helpers); domain logic tetap framework-agnostic.
- Tetap TypeScript untuk type safety Prisma + API contracts.
- Backend mengikuti pola **modular monolith**: satu aplikasi API yang dideploy, sementara batas modul dipisah per domain (journey/planner/policy/cost) untuk maintainability.

### Auth Firebase
1. Flutter: login → dapat **ID token**.
2. Setiap request API: header `Authorization: Bearer <idToken>`.
3. Node middleware: verifikasi token via Firebase Admin SDK.
4. Sync user ke PostgreSQL (`User.firebaseUid`) saat first login.

### Flutter sebagai satu-satunya client MVP
- Mockup UI diimplementasi sebagai Flutter screens/widgets.
- State management: bebas pilih (Provider / Riverpod / Bloc) — putuskan di Minggu 1.
- Deep-link booking: `url_launcher` ke website provider.

### Docker + VPS
- Local: `docker compose up` (Postgres + API).
- Production: Linux VPS, image dari GHCR/Docker Hub, compose/systemd.
- Secrets: `.env` di server (bukan di git); CI inject via GitHub Secrets.

### GitHub Actions (pipeline tipikal)
1. On push/PR: lint + test API + `flutter analyze` / test
2. On main: build Docker image API → push registry
3. Deploy SSH ke VPS → `docker compose pull && up -d`
4. (Opsional) build Flutter artifact / distribute via Firebase App Distribution

## Environment Variables (contoh)

```env
# Node API
DATABASE_URL=postgresql://...
PORT=3000
FIREBASE_PROJECT_ID=...
GOOGLE_APPLICATION_CREDENTIALS=...

# LLM
OPENAI_API_KEY=...

# MCP server — provider keys
DUFFEL_ACCESS_TOKEN=...
LITEAPI_KEY=...
GOOGLE_MAPS_API_KEY=...
OPENWEATHER_API_KEY=...
EVENTBRITE_TOKEN=...
VIATOR_API_KEY=...
SHERPA_API_KEY=...
```

## Out of Stack (sengaja tidak dipakai MVP)

| Sebelumnya dipertimbangkan | Status |
|----------------------------|--------|
| Next.js / React web | ❌ Bukan client MVP (web bisa fase lanjut) |
| NestJS / Express / FastAPI | ❌ Backend = Node.js + Fastify |
| Clerk / Supabase Auth | ❌ Diganti Firebase |
| Vercel / Railway sebagai host utama | ❌ Diganti Docker + Linux VPS |
| PostGIS | ⏳ Opsional nanti; Postgres biasa dulu |
| Tool Registry manual (internal handler) | ❌ Diganti MCP servers |

## Implikasi ke Roadmap

- Minggu 1–2: scaffold Flutter + Node API + Prisma + Docker Compose + Firebase project.
- Minggu 2–3: scaffold MCP servers (1–2 dulu: mcp-routes + mcp-weather, paling sederhana).
- Minggu 4: MCP flights + hotels terintegrasi ke AI Planner.
- Minggu 5+: MCP places, events, visa.
- Minggu 7–8: CI/CD GitHub Actions + deploy semua services di VPS (docker compose).

Lihat juga: [06-weekly-plan.md](./06-weekly-plan.md) (sudah diselaraskan ke stack ini).
