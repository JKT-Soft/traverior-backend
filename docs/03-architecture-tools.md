# Traverior — Arsitektur Tools (MCP)

## Keputusan

**LLM memanggil tool melalui MCP.** Node.js API tetap berperan sebagai **orchestrator & policy engine** (grounding, pipeline tree, lock/custom rules, cost roll-up) dan berjalan sebagai **modular monolith** (modul per domain dipisah di codebase). MCP adalah *transport layer* yang menghubungkan LLM ke connector provider.

---

## Arsitektur Keseluruhan

```
Flutter App
  │ HTTPS + Firebase ID Token
  ▼
Node.js API  ←─────────────────────────────────────────┐
  ├── Auth middleware (Firebase Admin)                   │
  ├── Journey Orchestrator                               │
  │     ├── pipeline tree CRUD (Prisma)                 │
  │     ├── cost/duration roll-up                       │
  │     ├── lock / custom / deleted policy              │
  │     └── snapshot / diff (replan)                    │
  └── AI Planner Service                                │
        │                                               │
        ▼                                               │
      LLM (OpenAI / Claude)                             │
        │  function calling via MCP protocol            │
        ▼                                               │
      MCP Client (di Node)  ──calls──►  MCP Servers ───┘
        │                                merge results
        │                                ke pipeline tree
        │
        ├─► mcp-flights   → Duffel API
        ├─► mcp-hotels    → LiteAPI (Nuitee)
        ├─► mcp-places    → Google Places (New)
        ├─► mcp-routes    → Google Directions / Routes
        ├─► mcp-weather   → OpenWeather (One Call 3.0)
        ├─► mcp-events    → Eventbrite + Viator
        ├─► mcp-visa      → Sherpa
        └─► mcp-checklist → Internal logic + template
```

**Aturan penting:**
- Flutter **tidak** memanggil LLM atau MCP server secara langsung.
- MCP server **tidak** menulis ke database — hanya return data ke Node.
- Node Orchestrator yang memutuskan data mana yang masuk/update pipeline tree.
- Backend tetap 1 HTTP entrypoint (modular monolith); MCP server hanya connector adapter (transport ke provider).

---

## MCP Servers (per domain)

| MCP Server | Provider | Tools yang diekspos |
|------------|----------|---------------------|
| `mcp-flights` | Duffel API | `search_flights`, `get_flight_status` |
| `mcp-hotels` | LiteAPI (Nuitee) | `search_hotels`, `get_hotel_detail` |
| `mcp-places` | Google Places (New) | `search_restaurants`, `search_pois`, `get_place_detail` |
| `mcp-routes` | Google Routes/Directions | `get_route`, `get_distance_matrix` |
| `mcp-weather` | OpenWeather One Call 3.0 | `get_forecast`, `get_weather_alerts` |
| `mcp-events` | Eventbrite + Viator | `search_events` (gratis/berbayar), `search_tours` |
| `mcp-visa` | Sherpa | `get_visa_requirements` |
| `mcp-checklist` | Internal | `generate_checklist` |

---

## Alur LLM Planning (dengan MCP)

### Fase 1 — Skeleton tree (LLM, tanpa tools)
LLM menerima user intent + preferensi, menghasilkan **struktur tree**:

```json
{
  "checkpoints": [
    { "city": "Osaka", "role": "STAY", "days": 3,
      "needs": ["flights", "hotels", "routes", "weather"] },
    { "city": "Kyoto", "role": "STAY", "days": 2,
      "needs": ["routes", "places", "events"] }
  ]
}
```

### Fase 2 — Tool execution (MCP calls, Node Orchestrator)
Node memetakan `needs` → MCP tool calls (paralel):

```
"flights" → mcp-flights.search_flights(CGK → KIX, date, pax)
"hotels"  → mcp-hotels.search_hotels(Osaka, checkIn, checkOut, budget)
"routes"  → mcp-routes.get_route(KIX Airport, Hotel Osaka, transit)
"weather" → mcp-weather.get_forecast(Osaka, 2026-10-01..04)
```

Hasil dikembalikan ke Node, bukan ke LLM secara langsung.

### Fase 3 — Enrich + refine (LLM opsional)
LLM opsional membaca rangkuman hasil tool untuk memberikan narasi/ranking, tanpa mengubah angka raw (tetap dari API).

---

## Guardrails (tidak berubah dari sebelumnya)

- Harga, waktu, jarak **hanya** dari respons MCP tool (API provider).
- LLM **tidak boleh** mengarang angka. Jika tool gagal → tampilkan "estimasi" dengan label jelas + timestamp.
- Node adalah **satu-satunya** layer yang menulis ke Prisma.
- MCP server bersifat **stateless** — hanya menjawab satu tool call, tidak menyimpan state.

---

## Repo Structure (update dengan MCP)

```
AI travel agent/
├── apps/
│   └── mobile/               # Flutter
├── services/
│   ├── api/                  # Node.js + Prisma (orchestrator)
│   │   ├── src/
│   │   │   ├── index.ts
│   │   │   ├── routes/
│   │   │   ├── services/
│   │   │   │   ├── journey/
│   │   │   │   ├── planner/   ← LLM + MCP client
│   │   │   │   └── cost/
│   │   │   └── middleware/
│   │   └── prisma/
│   └── mcp/                  # MCP servers
│       ├── flights/           ← Duffel adapter
│       ├── hotels/            ← LiteAPI adapter
│       ├── places/            ← Google Places adapter
│       ├── routes/            ← Google Routes adapter
│       ├── weather/           ← OpenWeather adapter
│       ├── events/            ← Eventbrite + Viator adapter
│       ├── visa/              ← Sherpa adapter
│       └── checklist/         ← Internal logic
├── docker-compose.yml
├── .github/workflows/
└── docs/
```

Setiap MCP server adalah Node.js process/module kecil mengimplementasi **MCP protocol** (stdio atau HTTP transport).

---

## Environment Variables (update)

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

---

## Pembagian Tanggung Jawab (ringkas)

| Komponen | Tanggung jawab |
|----------|----------------|
| **Flutter** | UI, user input, display pipeline tree |
| **Node API** | Auth, pipeline CRUD, orchestrator, policy (lock/custom/recalc) |
| **LLM** | Reasoning, susun skeleton tree, pilih MCP tools |
| **MCP Client** (di Node) | Menjalankan tool call LLM ke MCP servers |
| **MCP Servers** | Connector ke provider API (stateless) |
| **Prisma / PostgreSQL** | Source of truth trip & pipeline tree |

---

## Kapan MCP tidak dipakai

- **Checklist logic** yang murni berbasis template statis — tetap di Node internal, tidak perlu MCP overhead.
- **Cost roll-up & aggregate** — deterministik, tetap di Node Orchestrator.
- **Auth & user sync** — Firebase Admin di Node, bukan MCP.
