# Traverior — Perancangan & Perencanaan Produk

> **Traverior** — *Your journey, in flow.*  
> AI Tour & Travel Agent berbasis LLM dengan Journey Pipeline rekursif. Domain: `traverior.com`.

## 1. Visi & Value Proposition

**Visi:** Asisten perjalanan end-to-end berbasis AI yang mengubah riset manual menjadi **journey pipeline** terstruktur — dari persiapan hingga kepulangan — dengan data real-time, biaya transparan, dan rekomendasi personal.

| Pain point user | Solusi aplikasi |
|-----------------|-----------------|
| Riset terfragmentasi (flight, hotel, makan, transport terpisah) | Satu pipeline terpadu per checkpoint |
| Tidak tahu urutan optimal antar destinasi | AI menyusun itinerary + waktu/jarak |
| Perubahan mendadak (delay, cuaca, cancel) | Pipeline auto-update & notifikasi |
| Budget tidak jelas | Rincian biaya per segmen + total trip |
| Lupa persiapan | Checklist kontekstual per checkpoint |
| Preferensi di luar rekomendasi AI | Custom edit: add / edit / delete / lock |

**Differentiator:** Bukan sekadar chatbot travel — ini **stateful journey orchestrator** dengan nested pipelines di setiap checkpoint.

## 2. Modul Perencanaan

| # | Modul | Pilihan terbaik (1) | Kenapa | Alternatif / catatan |
|---|-------|---------------------|--------|----------------------|
| 1 | Flight | **Duffel** *(pengganti Amadeus)* | Self-serve + sandbox; Amadeus Self-Service ditutup Jul 2026, Kiwi/Skyscanner partner-only | Deep-link Travelpayouts jika booking in-API belum siap |
| 2 | Accommodation | **LiteAPI (Nuitee)** | Self-serve, inventory global, cocok AI agent; Booking/Expedia/Agoda butuh partnership lama | Agoda nanti jika fokus APAC eksklusif |
| 3 | Restaurant / Food | **Google Places API (New)** | Coverage Jepang/Taiwan/Asia jauh di atas Yelp | Yelp hampir tidak berguna di Asia |
| 4 | Transportation | **Google Directions / Routes API** | Waktu/jarak realtime + transit kota (Osaka–Kyoto, metro) | Rome2Rio hanya untuk *intercity discovery* (fase lanjut) |
| 5 | Events & Activities | **Eventbrite** (gratis + berbayar) + **Viator** (tour berbayar) | Eventbrite native `is_free`; festival, meetup, pameran. Viator untuk attraction/tour berbayar. Filter budget bisa tampilkan yang `cost = 0` | GetYourGuide hanya tour berbayar; Klook kuat Asia tapi API selektif |
| 6 | Checklist | **Internal (template + LLM)** | Tidak ada API packing yang bagus | Visa item diisi dari Sherpa |
| 7 | Recommendations | **Google Places API (New)** | Satu API untuk resto, mall, POI, rating | Jangan dobel Yelp |
| 8 | Visa & Documents | **Sherpa** | Standar industri (IATA), trip-context, eVisa | Curated DB hanya untuk MVP minggu 1–4 |
| 9 | Insurance & Safety | **Internal + FCM/embassy static** | API asuransi jarang self-serve | Partner (SafetyWing/Allianz) fase lanjut |
| 10 | Budget Tracker | **Internal (Prisma)** | Agregasi dari node pipeline | ExchangeRate-API untuk konversi mata uang |
| 11 | Weather & Alerts | **OpenWeather (One Call 3.0)** | Forecast + alerts dalam 1 call, murah, cukup untuk replan | WeatherAPI.com jika mau free tier lebih longgar |

**Events & Activities — aturan produk:** pipeline boleh berisi event **gratis** dan **berbayar**. UI menandai `Gratis` vs harga. Preferensi budget/pace memfilter; user hemat tetap dapat festival, temple visit, walking tour komunitas, dll.

## 3. Requirements Inti

1. Setiap checkpoint bisa dipecah menjadi sub-pipeline (rekursif).
2. Data flight, hotel, transport, dll. dari API provider (real & realtime).
3. User bisa order via deep-link ke website/aplikasi provider.
4. Rincian biaya akurat di setiap pipeline (keberangkatan → kepulangan).
5. Waktu & jarak akurat di setiap pipeline.
6. Informasi & rekomendasi sesuai preferensi pengguna.
7. Pipeline diperbarui seiring waktu (cuaca, cancel, ganti jadwal).
8. **User bisa add / edit / delete / lock bagian pipeline secara custom.**
9. Events & activities mencakup **event gratis dan berbayar** (bukan hanya tour berbayar).

## 4. Arsitektur Sistem (Ringkas)

```
Flutter App
  → HTTPS + Firebase ID Token
  → Node.js API (orchestrator)
       ├── Auth middleware (Firebase Admin)
       ├── Journey Orchestrator (pipeline CRUD, lock/custom policy)
       ├── AI Planner
       │     └── LLM ↔ MCP Client → MCP Servers
       ├── Cost / Time / Preference services
       └── Prisma → PostgreSQL

MCP Servers (per domain, stateless):
  mcp-flights (Duffel) · mcp-hotels (LiteAPI) · mcp-places (Google Places)
  mcp-routes (Google) · mcp-weather (OpenWeather) · mcp-events (Eventbrite+Viator)
  mcp-visa (Sherpa) · mcp-checklist (internal)

Infra: Docker Compose (api + mcp services + postgres) on Linux VPS
CI/CD: GitHub Actions
```

Detail stack: [07-tech-stack.md](./07-tech-stack.md)

## 5. Tech Stack (Locked)

| Layer | Teknologi |
|-------|-----------|
| Mobile frontend | Flutter |
| Backend API (orchestrator) | Node.js + Fastify |
| Tool layer (LLM ↔ provider) | **MCP Servers** (per domain, Node.js) |
| Database | PostgreSQL + Prisma |
| Auth | Firebase Authentication |
| LLM | OpenAI / Claude (via MCP function calling) |
| Infra | Docker + Linux VPS |
| CI/CD | Git + GitHub Actions |

## 6. Roadmap

### Fase 0 — Foundation
- Monorepo: Flutter + Node API + Prisma + Docker
- Firebase Auth + sync user ke Postgres
- Data model Journey/Pipeline rekursif

### Fase 1 — MVP (Flutter)
- Macro + minor pipeline UI
- Flight + Hotel search via API
- Cost & time aggregation
- Checklist generator
- Deep-link booking (`url_launcher`)
- Custom edit (add/edit/delete/lock)

### Fase 2 — Live Trip
- Pipeline monitor di VPS (cron/worker)
- Push notifications (FCM)
- Re-plan on disruption (respect locks & custom nodes)
- Today mode penuh

### Fase 3 — Scale
- Events & restaurants full
- Web client (opsional)
- Multi-language
- Affiliate revenue
- Multi-region / scaling VPS

## 7. KPI

| Metrik | Target MVP |
|--------|------------|
| Time to first itinerary | < 60 detik |
| API grounding rate | > 95% |
| User edit rate post-AI | < 40% |
| Re-plan acceptance rate | > 70% |
| NPS post-trip | > 40 |

## Referensi terkait

- [02-pipeline-model.md](./02-pipeline-model.md) — Model pipeline rekursif
- [03-architecture-tools.md](./03-architecture-tools.md) — Tool registry tanpa MCP
- [04-ui-ux-design.md](./04-ui-ux-design.md) — UI/UX
- [05-custom-pipeline-editing.md](./05-custom-pipeline-editing.md) — Custom editing
- [06-weekly-plan.md](./06-weekly-plan.md) — Reset planning 8 minggu
- [07-tech-stack.md](./07-tech-stack.md) — Tech stack locked
