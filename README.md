# Traverior Backend

API orchestrator dan MCP servers untuk **Traverior** — *Your journey, in flow.*

Repo ini adalah modular monolith: satu Fastify API yang merakit journey pipeline, plus sidecar MCP per domain (flight, hotel, places, dll.).

Domain: [traverior.com](https://traverior.com)

## Stack

| Layer | Teknologi |
|-------|-----------|
| API | Node.js 20+ · Fastify · TypeScript |
| Database | PostgreSQL · Prisma |
| Cache | Redis (opsional; fallback in-memory) |
| Auth | Firebase Authentication |
| Tools | MCP servers (`mcp/`) |
| Infra | Docker Compose · Linux VPS |
| CI/CD | GitHub Actions |

## Struktur

```
.
├── api/                    # Fastify modular monolith
│   ├── prisma/             # schema + migrations
│   ├── src/modules/        # flights, hotels, journey, planner, …
│   ├── Dockerfile
│   └── .env.example
├── mcp/                    # MCP servers (stdio, stateless)
│   └── src/{flights,hotels,places,routes,weather,events,visa,checklist}/
├── docker-compose.yml      # API container
└── .github/workflows/      # CI + deploy VPS
```

Detail modul: [api/README.md](./api/README.md) · katalog tool: [mcp/README.md](./mcp/README.md)

## Jalankan lokal

Prasyarat: **Node.js ≥ 20**, PostgreSQL, Redis (opsional).

```bash
cp api/.env.example api/.env
# isi DATABASE_URL, Firebase, dan provider keys
```

```bash
cd api
npm install
npx prisma generate
npx prisma migrate dev
npm run dev
```

Health: `GET http://localhost:3000/health`

Auth lokal: set `AUTH_MODE=dev` lalu kirim `Authorization: Bearer dev:<firebaseUid>`. Mode default di `.env.example` adalah `firebase` (token ID dari Google Sign-In).

MCP (stdio), dari folder `mcp/`:

```bash
cd mcp
npm install
npm run flights    # atau hotels, places, routes, weather, events, visa, checklist
```

API memakai `MCP_MODE=inprocess` secara default (panggil domain service langsung). Set `MCP_MODE=stdio` untuk spawn proses di `mcp/`.

## Docker

Compose mem-publish API di **host `8002`** → container `3000`. Butuh `api/.env` (tidak di-commit).

```bash
docker compose up -d --build
curl http://localhost:8002/health
```

Migrasi di container:

```bash
docker compose run --rm --no-deps api npx prisma migrate deploy
```

Postgres dan Redis tidak ada di compose ini — jalankan terpisah, lalu arahkan `DATABASE_URL` / `REDIS_URL` di `api/.env`.

## Tes

```bash
# API
cd api && npm test && npm run lint

# MCP
cd mcp && npm test && npm run lint
```

Coverage: `npm run test:coverage` di masing-masing paket (threshold 100%).

## CI/CD

| Workflow | Trigger | Isi |
|----------|---------|-----|
| [CI](./.github/workflows/ci.yml) | PR, push branch, manual | typecheck + test API & MCP, build image Docker |
| [Deploy to VPS](./.github/workflows/deploy.yml) | push `main` / `master`, manual | CI → SSH → `git pull` → migrate → `docker compose up -d` |

Push ke `main` menjalankan CI dulu, baru deploy. Deploy tidak jalan di PR.

### Secrets (repo GitHub)

| Secret | Wajib | Keterangan |
|--------|--------|------------|
| `VPS_HOST` | ya | hostname atau IP |
| `VPS_USER` | ya | user SSH |
| `VPS_SSH_PRIVATE_KEY` | ya | private key user itu |
| `VPS_DEPLOY_PATH` | ya | path absolut clone repo **backend** di VPS |
| `VPS_PORT` | tidak | port SSH, default `22` |
| `GH_PAT` | tidak | PAT untuk repo organisasi yang private |

Di VPS, `api/.env` tetap di server (bukan di git). `VPS_DEPLOY_PATH` harus mengarah ke clone backend, bukan landing page.

## Dokumentasi lain

| File | Isi |
|------|-----|
| [api/README.md](./api/README.md) | Arsitektur modul, env, contoh curl |
| [mcp/README.md](./mcp/README.md) | Tool catalog per server |
| [api/postman/README.md](./api/postman/README.md) | Koleksi Postman |
