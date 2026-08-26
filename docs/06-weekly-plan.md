# Traverior — Reset Planning (8 Minggu)

> Rencana kerja mingguan: **teknikal + non-teknikal**.  
> Mulai: **Minggu 1 (24 Agu 2026)** · Target akhir: **MVP internal demo siap diuji**.  
> Asumsi: 1–2 orang (solo / duo), ~5 hari kerja/minggu. Sesuaikan scope jika kapasitas beda.

**Tech stack locked:** Flutter · Node.js (orchestrator, modular monolith) · **MCP Servers** (per provider) · PostgreSQL + Prisma · Firebase Auth · Docker + Linux VPS · GitHub Actions — lihat [07-tech-stack.md](./07-tech-stack.md).

---

## Ringkasan Eksekutif

| Fase | Minggu | Fokus | Deliverable utama |
|------|--------|-------|-------------------|
| **Foundation** | 1–2 | Setup, keputusan, data model, desain final | Repo hidup + Prisma schema + PRD MVP |
| **Core Build** | 3–5 | Firebase Auth, Flutter pipeline UI, AI planner, API real | Trip bisa di-generate & ditampilkan di app |
| **Customize + Polish** | 6–7 | Custom edit, budget, checklist, deep-link | User bisa edit pipeline + book redirect |
| **Demo Ready** | 8 | Stabilisasi, CI/CD, deploy VPS, demo | Staging di VPS + backlog v1.1 |

**Out of scope 8 minggu pertama:** web client, live monitor/replan penuh, multi-bahasa, affiliate dashboard, payment in-app, store release publik (cukup internal/TestFlight atau APK sideload).

---

## Prinsip Kerja

1. **MVP dulu** — 1 happy path: Jakarta → Jepang (+ transit) → kembali, bukan semua destinasi.
2. **API grounding** — harga/waktu hanya dari tool/API, bukan teks LLM.
3. **Deep-link booking** — tidak bangun checkout sendiri di fase ini.
4. **Custom edit = must-have MVP** — add/edit/delete/lock dasar, bukan nice-to-have.
5. **Setiap Jumat = review** — demo singkat + keputusan go/no-go minggu berikutnya.
6. **Mobile-first** — semua UI MVP di Flutter; API Node sebagai satu-satunya backend.

---

## Minggu 1 — Kickoff & Keputusan (24–30 Agu)

### Tujuan
Semua keputusan besar terkunci agar eksekusi tidak goyah.

### Non-teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Nama produk locked: **Traverior** | Tagline di README | ✅ `traverior.com` |
| Tulis **MVP scope freeze** | 1 halaman: in/out scope | File `docs/08-mvp-scope.md` |
| Buat **user persona** (2–3) | Solo traveler, couple, family ringan | Persona + pain point |
| Buat **user stories MVP** (15–20) | Prioritas P0/P1/P2 | Linked ke acceptance criteria |
| Riset kompetitor singkat | 5 competitor: Klook, TripIt, Wanderlog, ChatGPT travel, lokal | Table fitur vs Traverior |
| Setup tracking kerja | Notion / Linear / GitHub Projects | Board: Backlog → Doing → Done |
| Estimasi budget awal (API + VPS + LLM + Firebase) | Spreadsheet bulanan | Angka kasar bulan 1–3 |
| Buat Firebase project + GitHub repo | Project ID + repo URL | Tercatat di runbook draft |

### Teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Stack sudah locked (+ MCP) | Dokumen `07-tech-stack.md` | ✅ (sudah) |
| Init monorepo | `apps/mobile` + `services/api` + `services/mcp/` | Struktur folder ada |
| Putuskan state management Flutter | Riverpod / Bloc / Provider | Tercatat di tech stack |
| Docker Compose: Postgres + API stub | `docker-compose.yml` | `psql` connect OK |
| Prisma init + schema draft | `User`, `Trip`, `PipelineNode` | `prisma migrate` lokal OK |
| Scaffold 1 MCP server minimal (`mcp-routes`) | MCP stdio/HTTP ping OK | Node bisa call MCP tool |
| `.env.example` + lint | Template env | Tanpa secret di git |
| Design tokens Flutter (ThemeData teal) | App theme | Match mockup warna |

### Checkpoint Jumat W1
- [ ] Scope MVP frozen
- [ ] Flutter + Node + Postgres (Docker) hidup lokal
- [ ] Prisma schema draft reviewed
- [ ] 1 MCP server (`mcp-routes`) bisa dipanggil dari Node

---

## Minggu 2 — Fondasi Produk & Data (31 Agu – 6 Sep)

### Tujuan
Model data & auth siap; Flutter bisa hit API terproteksi.

### Non-teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Tulis **PRD singkat MVP** | Masalah, solusi, flows, metrics | `docs/09-prd-mvp.md` |
| Finalisasi flow utama (happy path) | Diagram 5 langkah | Home → Plan → Review → Journey → Edit |
| Content & copy UI (Bahasa Indonesia) | ARB / string keys Flutter | Home, Planning, Empty states |
| Kebijakan data & privacy draft | Apa yang disimpan (Firebase + Postgres) | 1 halaman |
| Daftar akun API yang perlu didaftar | Amadeus, Google Maps, OpenAI/Claude, OpenWeather | Checklist status apply |
| Legal note deep-link / affiliate | ToS provider ringkas | Catatan risiko |

### Teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Prisma migrate final v1 | Migration applied | CRUD Trip & Node via API |
| Firebase Auth di Flutter | Login/signup (email dulu) | ID token didapat |
| Node middleware: verify Firebase ID token | Protected routes | Request tanpa token = 401 |
| Sync user Postgres on first login | `User.firebaseUid` | Row user tercipta otomatis |
| API routes: `trips`, `pipeline-nodes` (CRUD tree) | REST JSON | Create/read/update/delete node |
| Aggregate cost & duration roll-up | Service di Node | Parent update saat child berubah |
| Flutter: API client + auth interceptor | Dio/http + Bearer token | Hit `/trips` sukses |
| Scaffold screens: Home, Journey, Checkpoint | Routes/nav | Navigasi antar screen |

### Checkpoint Jumat W2
- [ ] Login Firebase → create trip → simpan node di Postgres
- [ ] PRD MVP approved (oleh Anda)
- [ ] Minimal 2 API provider sudah punya akun/sandbox

---

## Minggu 3 — Pipeline UI + Preferensi (7–13 Sep)

### Tujuan
User bisa melihat & menyimpan journey tree (masih mock/AI stub).

### Non-teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Preference questionnaire final | Budget, style, dietary, pace, halal | Form copy siap |
| Onboarding copy (3 layar max) | Welcome → Preferensi → CTA plan | Teks final |
| Siapkan **sample trip** konten | Asia Timur 10 hari (seperti mockup) | Seed data untuk demo |
| Buat kriteria usability test | 5 task skenario | Script wawancara 15 menit |

### Teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| UI Journey Pipeline (spine vertical) | Match mockup view mode | Checkpoint tap → detail |
| UI Checkpoint Detail + breadcrumb | Segments list | Drill-down 1 level |
| Preferences screen + save ke DB | Profile JSON | Dipakai planner nanti |
| Seed sample pipeline (Asia Timur) | Script seed | Demo tanpa AI dulu |
| Bottom nav 4 tabs | Home / Journey / Today(stub) / Profile | Routing stabil |
| State: draft vs active trip | Enum status | Status di UI |

### Checkpoint Jumat W3
- [ ] Demo manual: buka trip sample → drill Osaka → lihat segments
- [ ] Preferensi tersimpan per user

---

## Minggu 4 — AI Planner + Tool Registry (14–20 Sep)

### Tujuan
Dari natural language → skeleton pipeline (dengan grounding API awal).

### Non-teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Prompt design v1 | System + planner prompt | Dokumen `docs/09-prompt-spec.md` |
| Definisi “good itinerary” | Rubrik penilaian AI output | Scoring checklist |
| Cost control LLM | Budget token / trip | Cap harian tercatat |
| Komunikasi status ke stakeholder (jika ada) | Update singkat minggu 1–4 | 1 halaman / chat |

### Teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| AI Planner service | Intent → JSON skeleton tree | Structure depth 2–3 |
| MCP Client di Node (LLM function calling via MCP) | LLM pilih tool → MCP call | Tool call round-trip OK |
| `mcp-flights` (Duffel) | search_flights → Flight options | Attach ke LEG nodes |
| `mcp-routes` (Google) | get_route → duration/distance | Attach ke transport segments |
| Planning loader UI Flutter | Step progress seperti mockup | Transparent UX |
| Review & Customize screen | Preview sebelum activate | User confirm |

### Checkpoint Jumat W4
- [ ] Input NL → pipeline draft dengan ≥1 flight real dari API
- [ ] Harga flight bertanda sumber API + timestamp

---

## Minggu 5 — Enrichment: Hotel, Cost, Checklist (21–27 Sep)

### Tujuan
Pipeline lebih “lengkap” untuk 1 happy path.

### Non-teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Template checklist per negara | JP, TW, CN, ID | Items + kategori |
| Affiliate / deep-link strategy | Provider mana dulu | 1–2 partner diprioritaskan |
| Pricing page / positioning draft (opsional) | Free vs later paid | Catatan bisnis |
| Bug triage process | Label severity | Dipakai mulai W5 |

### Teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| `mcp-hotels` (LiteAPI) → STAY nodes | Options + deep-link | User pilih 1 |
| `mcp-weather` (OpenWeather) | Forecast badge + alerts | Tidak blocking |
| `mcp-places` (Google Places) stub | 3–5 POI per city | Tampil di Recs tab |
| Cost aggregator UI (BudgetBar) | Trip + checkpoint subtotal | Multi-currency → IDR |
| Checklist generator (LLM + template) | Per checkpoint | Checklist module di side tab |
| Error handling & empty states | Copy + retry | MCP gagal tidak blank |

### Checkpoint Jumat W5
- [ ] End-to-end: plan → flight + hotel + checklist + budget total
- [ ] Deep-link “Book” membuka provider (meski sandbox/affiliate)

---

## Minggu 6 — Custom Pipeline Editing MVP (28 Sep – 4 Okt)

### Tujuan
User bisa mengkustomisasi hasil AI.

### Non-teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| UX copy Edit Mode | Banner, confirm delete, lock tooltip | String final |
| Aturan AI vs User (policy) | 1 halaman policy | Selaras `05-custom-pipeline-editing.md` |
| Usability test 3–5 orang (internal/teman) | Catatan pain point | ≥3 session |
| Prioritaskan feedback → backlog | P0 fixes | List di board |

### Teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Edit Mode toggle + banner | View ↔ Edit | Match mockup |
| Edit waktu / catatan segment | Persist + recalc | Aggregate update |
| Delete node (+ soft delete flag) | Confirm dialog | Parent recalc |
| Lock / unlock node | `isLocked` | Badge visual |
| Add node (manual + tipe dasar) | Bottom sheet | Node `origin=user` |
| Replace via search (hotel/resto) | Search → swap | Custom badge |
| Conflict warnings (waktu/budget) | Non-blocking alerts | Match validation mockup |
| Undo 1 step | Snapshot ringan | Bisa revert last edit |

### Checkpoint Jumat W6
- [ ] Demo: AI plan → user hapus 1 aktivitas → tambah resto custom → lock hotel → budget update
- [ ] Usability notes documented

---

## Minggu 7 — Today Mode Ringan + Hardening (5–11 Okt)

### Tujuan
Trip aktif terasa “hidup”; kualitas naik sebelum demo.

### Non-teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Demo script (10 menit) | Slide/flow demo | Dipraktikkan 2× |
| Landing page sederhana / waitlist (opsional) | 1 page value prop | Form email |
| Metrics dashboard minimal | Event log: plan created, edit, book click | Spreadsheet atau analytics |
| Risk register update | API cost, LLM hallucination, ToS | Mitigasi written |

### Teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Today screen (next segment hero) | Match mockup dasar | Dari trip `active` |
| Mark segment complete | Status update | Progress bar naik |
| Alert stub (manual/weather simple) | Banner di Today | Bukan full replan dulu |
| `mcp-events` (Eventbrite + Viator) + `mcp-visa` (Sherpa) | Events di pipeline, visa di checklist | Tools callable |
| Performance: cache MCP responses | Redis/TTL di Node | Flight/hotel tidak fetch berulang |
| Logging & observability dasar | Request logs, LLM cost log | Bisa debug 1 trip |
| Security pass ringan | Authz trip milik user | Tidak bisa akses trip orang lain |
| Automated tests kritis | Unit roll-up + API auth + Flutter widget smoke | ≥ smoke suite |
| Draft GitHub Actions CI | Lint/test API + `flutter analyze` | Workflow jalan di PR |

### Checkpoint Jumat W7
- [ ] Happy path stabil tanpa crash
- [ ] Demo script dry-run sukses

---

## Minggu 8 — Demo, Feedback, Reset Backlog (12–18 Okt)

### Tujuan
Tutup siklus 8 minggu dengan keputusan jelas untuk fase berikutnya.

### Non-teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Internal demo / stakeholder demo | Rekaman atau live | Feedback tercatat |
| Survei singkat pengguna uji | 5 pertanyaan | ≥5 respons (target) |
| Retrospective | What went well / bad / next | 1 dokumen |
| Roadmap reset v1.1 | Prioritas 4–8 minggu berikutnya | Update `01` + board |
| Decide: continue solo / cari co-founder / pause | Keputusan tertulis | 1 pilihan |

### Teknikal
| Task | Output | Done jika |
|------|--------|-----------|
| Bug bash P0/P1 | Fix list | Tidak ada P0 terbuka |
| GitHub Actions: lint/test/build image (api + mcp services) | Workflow YAML | CI hijau di `main` |
| Deploy staging VPS: docker compose (api + mcp + postgres) | API HTTPS | Shareable (IP/domain) |
| Seed demo account | Login siap demo | Credentials di password manager |
| Dokumentasi runbook | Lokal + VPS + env | `docs/10-runbook.md` |
| Freeze tag `v0.1.0-mvp` | Git tag | Release note singkat |

### Checkpoint Jumat W8
- [ ] Staging API di VPS + Flutter build demo OK
- [ ] Tag MVP + retrospektif selesai
- [ ] Backlog v1.1 prioritas jelas
- [ ] CI/CD GitHub Actions hijau
---

## Kalender Ringkas (Mingguan)

| Minggu | Tanggal (approx) | Tema |
|--------|------------------|------|
| 1 | 24–30 Agu | Kickoff & keputusan |
| 2 | 31 Agu – 6 Sep | Fondasi data & PRD |
| 3 | 7–13 Sep | Pipeline UI + preferensi |
| 4 | 14–20 Sep | AI planner + tools |
| 5 | 21–27 Sep | Hotel, cost, checklist |
| 6 | 28 Sep – 4 Okt | Custom editing MVP |
| 7 | 5–11 Okt | Today + hardening |
| 8 | 12–18 Okt | Demo + reset backlog |

---

## RACI Sederhana (Solo / Duo)

| Area | Solo | Duo (Anda + Dev) |
|------|------|------------------|
| Product / scope | Anda | Anda |
| UI/UX & copy | Anda | Anda |
| Backend / AI (Node + Prisma) | Anda | Dev |
| Flutter UI | Anda | Dev / Anda |
| Infra (Docker, VPS, GH Actions) | Anda | Shared |
| API accounts & legal | Anda | Anda |
| Testing | Anda | Shared |

---

## Budget Mingguan (Estimasi Kasar)

| Item | Estimasi / bulan | Catatan |
|------|------------------|---------|
| LLM API | $20–100 | Cap ketat di W4 |
| Google Maps | $0–50 | Free tier dulu |
| Amadeus | $0 | Sandbox dulu |
| VPS Linux (1–2 GB) | $5–12 | DigitalOcean / Contabo / IDCloudHost |
| Docker registry | $0 | GHCR |
| Firebase Auth | $0 | Spark/Blaze sesuai usage |
| Domain (opsional) | ~$12/tahun | Bisa W8 |

**Aturan:** review spend tiap Jumat; pause tool mahal jika belum dipakai.

---

## Definition of Done — Akhir Minggu 8 (MVP)

Trip dianggap MVP siap demo jika:

1. User login & set preferensi  
2. Input natural language → pipeline tree (depth ≥ 2)  
3. Minimal 1 flight + 1 hotel dari API real (sandbox OK)  
4. Budget & waktu tampil di trip + checkpoint  
5. Checklist per checkpoint  
6. User bisa **edit / delete / add / lock** node  
7. Book CTA deep-link ke provider  
8. Today menampilkan next segment untuk trip aktif  
9. API staging di VPS bisa didemo; Flutter connect ke staging tanpa setup rumit  

---

## Backlog Parkir (Setelah Minggu 8)

| Prioritas | Item |
|-----------|------|
| v1.1 | Full restaurant/events API, drag reorder, undo/redo multi |
| v1.2 | Pipeline monitor + auto-replan (respect locks) |
| v1.3 | Push notification, offline cache |
| v2 | Web client (opsional), multi-language, affiliate dashboard |
| Business | Waitlist growth, partner negotiation, pricing |

---

## Ritual Mingguan (Wajib)

| Hari | Aktivitas | Durasi |
|------|-----------|--------|
| Senin | Pilih 3–5 task prioritas minggu | 30 menit |
| Rabu | Mid-week check: blocker? | 15 menit |
| Jumat | Demo 10 menit + update board + spend check | 45–60 menit |

---

## Cara Pakai Dokumen Ini

1. Copy task minggu berjalan ke board (Linear/GitHub/Notion).  
2. Jangan loncat minggu tanpa checkpoint Jumat clear.  
3. Jika telat: **potong scope**, jangan geser semua minggu tanpa keputusan.  
4. Update status di dokumen ini setiap akhir minggu (`[x]` checkpoint).

---

## Referensi

- [01-product-design.md](./01-product-design.md)
- [02-pipeline-model.md](./02-pipeline-model.md)
- [03-architecture-tools.md](./03-architecture-tools.md)
- [04-ui-ux-design.md](./04-ui-ux-design.md)
- [05-custom-pipeline-editing.md](./05-custom-pipeline-editing.md)
- [07-tech-stack.md](./07-tech-stack.md)
- Mockups: [`../design/mockups/`](../design/mockups/)
