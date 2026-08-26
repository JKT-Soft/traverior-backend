# Traverior — Indeks Dokumen & Desain

**Brand locked:** Traverior · Domain target: [traverior.com](https://traverior.com)  
**Tagline:** *Your journey, in flow.*

Semua dokumen perencanaan dan aset UI/UX dari sesi perancangan.

## Tech Stack (Locked)

| Layer | Stack |
|-------|--------|
| Mobile | Flutter |
| Backend | Node.js (no framework) |
| DB | PostgreSQL + Prisma |
| Auth | Firebase |
| Infra | Docker + Linux VPS |
| CI/CD | Git + GitHub Actions |

Detail: [docs/07-tech-stack.md](./docs/07-tech-stack.md)

## Dokumen (`docs/`)

| File | Isi |
|------|-----|
| [01-product-design.md](./docs/01-product-design.md) | Visi, modul, arsitektur, roadmap, KPI |
| [02-pipeline-model.md](./docs/02-pipeline-model.md) | Pipeline rekursif & data model |
| [03-architecture-tools.md](./docs/03-architecture-tools.md) | MCP servers, LLM, modular monolith |
| [04-ui-ux-design.md](./docs/04-ui-ux-design.md) | Design system & screen map |
| [05-custom-pipeline-editing.md](./docs/05-custom-pipeline-editing.md) | Add/Edit/Delete/Lock pipeline |
| [06-weekly-plan.md](./docs/06-weekly-plan.md) | Reset planning 8 minggu (teknikal + non-teknikal) |
| [07-tech-stack.md](./docs/07-tech-stack.md) | Tech stack locked (Flutter, Node vanilla, Prisma, Firebase, Docker VPS, GH Actions) |
| [10-api-cost-estimate.md](./docs/10-api-cost-estimate.md) | Estimasi biaya konsumsi API |
| [11-database-design.md](./docs/11-database-design.md) | Database design PostgreSQL + Prisma schema |
| [12-mcp-third-party-apis.md](./docs/12-mcp-third-party-apis.md) | API third-party per MCP server (endpoint + tools) |

## Desain (`design/`)

### Mockups (`design/mockups/`)

| File | Layar |
|------|-------|
| `traverior-ui-home.png` | Home |
| `traverior-ui-planning.png` | AI Planning |
| `traverior-ui-pipeline.png` | Journey Pipeline (view) |
| `traverior-ui-pipeline-edit.png` | Journey Pipeline (edit mode) |
| `traverior-ui-checkpoint.png` | Checkpoint Detail (view) |
| `traverior-ui-checkpoint-edit.png` | Checkpoint Edit Mode |
| `traverior-ui-today.png` | Today Mode |
| `traverior-ui-action-sheet.png` | Action Sheet (Edit/Ganti/Kunci/Hapus) |
| `traverior-ui-add-node.png` | Add Node bottom sheet |
| `traverior-ui-edit-validation.png` | Validasi konflik |
| `traverior-ui-overview.png` | Overview v1 (4 layar) |
| `traverior-ui-overview-v2.png` | Overview v2 (+ custom editing) |

### Referensi (`design/references/`)

| File | Isi |
|------|-----|
| `journey-pipeline-workflow.png` | Diagram workflow pipeline asli (Jakarta → Asia Timur) |

### Prototype

| File | Isi |
|------|-----|
| `design/travel-agent-ui-ux.canvas.tsx` | Prototype interaktif Cursor Canvas |

## Struktur Folder

```
AI travel agent/
├── README.md
├── docker-compose.yml
├── docs/
├── design/
└── services/
    ├── api/                 # Modular monolith (Node + Prisma)
    │   ├── prisma/
    │   ├── src/modules/
    │   └── README.md
    └── mcp/                 # MCP servers per domain (stdio tools)
        ├── src/{flights,hotels,places,routes,weather,events,visa,checklist}/
        └── README.md
```
