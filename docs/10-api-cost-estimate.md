# Traverior — Estimasi Biaya Konsumsi API (Berbasis Asumsi Umum)

Dokumen ini berisi estimasi biaya bulanan untuk konsumsi API yang kita rencanakan di MVP/awal produksi. Angka **bukan** quote final—karena:
- biaya provider biasanya mengikuti **jumlah request**, **field/sku yang diminta**, dan **volume**,
- harga provider bisa berubah,
- beberapa provider (contoh: `Sherpa`) tidak selalu mempublikasikan daftar harga lengkap untuk tier startup.

## 1) Model perhitungan

Estimasi total biaya per bulan = jumlah biaya dari:
1. **LLM** (token billing)
2. **Provider APIs** (billed per request/SKU, kecuali beberapa yang “gratis untuk search”)
3. **Infrastructure** (opsional masuk perhitungan infra: VPS + cache)

## 2) Asumsi volume (yang dipakai untuk skenario)

Berikut asumsi industri yang *dipakai* agar bisa dihitung “secara umum”:
- 1 trip punya itinerary multi-checkpoint dan rata-rata memicu sekitar **20–40 calls** ke layanan location/search (untuk fitur restoran/POI/rute/weather, dll).
- Untuk perhitungan konservatif, kita pakai rata-rata **~40 calls/trip** dengan breakdown spesifik:
  - `Places`: 8 calls/trip
  - `Routes`: 5 calls/trip
  - `Weather`: 3 calls/trip
  - sisanya calls/trip dianggap masuk kategori “gratis atau tidak dominan” untuk MVP.

LLM:
- Untuk menjaga biaya, kita asumsikan pakai model murah untuk planning, misalnya **GPT-4o mini**.
- Skeleton planning + ringkasan butuh kira-kira **~2.3k input token + ~1.3k output token / trip** (perkiraan; akan dipastikan lewat token logging saat implementasi).

> Catatan: angka call/tokens ini nanti harus diganti dengan angka real dari telemetry setelah sistem berjalan.

## 3) Skenario skala per bulan

| Skenario | Trip/bulan |
|---|---:|
| `MVP Internal Demo` | 50 |
| `Early Launch` | 500 |
| `Awal Produksi` | 2.000 |

Diasumsikan:
- replan terjadi 1× per trip/bulan (kalau replan lebih sering, biaya LLM naik paling signifikan).

## 4) Breakdown per provider

### A) LLM (OpenAI / Claude)

**Pricing token (contoh OpenAI GPT-4o):**
- `$2.50 / 1M input tokens`
- `$10.00 / 1M output tokens`

Untuk hemat biaya di praktik, kita pakai varian murah (mis. GPT-4o mini) sesuai selera/target kualitas.

Output estimasi (pakai GPT-4o mini):
| Skenario | Biaya LLM/bulan (estimasi) |
|---|---:|
| MVP (50 trips) | ~`$0.07` |
| Early (500 trips) | ~`$0.70` |
| Produksi (2.000 trips) | ~`$2.80` |

**Intinya:** selama pakai model kecil + prompt pendek + 2-phase skeleton, LLM cenderung murah dibanding Google Places.

---

### B) Flights — `Duffel`

- Search: **gratis** (umumnya)
- Biaya biasanya muncul saat **booking confirmed** (per order/ancillary) dan ada model “excess search ratio”.

Karena aplikasi kita melakukan deep-link booking (bukan in-app checkout), untuk estimasi cost operasional API: **anggap $0 untuk tahap search** (biaya terjadi saat order/booking benar-benar dikonfirmasi di flow).

---

### C) Hotels — `LiteAPI (Nuitee)`

- Core booking/search endpoints biasanya **gratis** selama “look-to-book ratio” wajar.
- Endpoints premium (mis. price index / places endpoints tertentu) bisa dikenai tarif per request.

Untuk MVP: asumsikan hanya pakai core booking/rates → **biaya API ~ $0**.

---

### D) Restaurant & POI — `Google Places API (New)`

Model billing mengikuti SKU/FieldMask: yang **paling mahal** bisa “menentukan tier billing” karena billed berdasarkan field tertinggi yang diminta.

Asumsi kalkulasi:
- pakai *Text Search* / fieldmask minimal (essentials/pro level)
- `8 calls/trip`

Asumsi pricing yang dipakai:
- free allowance **5.000 calls/bulan**
- paid: **$32 / 1.000 requests** (Text Search Pro, contoh)

| Skenario | Calls/bulan | Estimasi biaya |
|---|---:|---:|
| MVP (50 trips) | 400 | $0 |
| Early (500 trips) | 4.000 | $0 |
| Produksi (2.000 trips) | 16.000 | ~`$352` |

**Ini komponen paling berpotensi dominan biaya.**

Mitigasi yang wajib:
- Field masking ketat (jangan minta `reviews/photos/atmosphere` di MVP)
- Cache POI per kota/area dengan TTL (mis. 7–30 hari sesuai kebijakan)
- Batasi “POI enrichment” hanya untuk checkpoint yang aktif/selected.

---

### E) Transportation — `Google Directions / Routes API`

Asumsi kalkulasi:
- `5 calls/trip` (contoh: airport→hotel + antar-kota + hotel→airport, dst)

Pricing yang dipakai (contoh umum):
- free allowance: **10.000 requests/bulan (Essentials)**
- paid: **$5 / 1.000 requests** setelah free tier

| Skenario | Calls/bulan | Estimasi biaya |
|---|---:|---:|
| MVP (50 trips) | 250 | $0 |
| Early (500 trips) | 2.500 | $0 |
| Produksi (2.000 trips) | 10.000 | $0 (tepat di batas) |

Jika kamu pakai Pro/Enterprise SKU, angka free tier dan $/1K bisa berbeda.

---

### F) Weather & Alerts — `OpenWeather (One Call API 3.0)`

Asumsi kalkulasi:
- `3 calls/trip`

Pricing yang dipakai:
- **1.000 calls/hari gratis** untuk One Call 3.0

Dengan volume skenario ini, biaya estimasi **$0**.

---

### G) Events — `Eventbrite`

Untuk estimasi MVP:
- publishing event gratis (untuk free tickets)
- biaya per ticket biasanya ada untuk paid event (model organizer fees).

Tapi biaya API *search* tidak selalu eksplisit publik seperti Google/Firebase. Untuk estimasi awal, kita perlakukan **$0 untuk MVP**, lalu setelah implementasi kita ambil data aktual dari dashboard provider.

---

### H) Tours & Activities — `Viator`

Umumnya modelnya **commission-based** (tanpa setup fee per request).

Untuk aplikasi yang hanya deep-link booking (bukan merchant payment in-app), cost API untuk “search” biasanya dianggap **$0**; pendapatan berasal dari komisi booking.

---

### I) Visa / Documents — `Sherpa`

`Sherpa` tidak selalu mempublikasikan pricing yang mudah dipakai untuk estimasi startup.

Untuk “analisis biaya awal”, kita sarankan:
- MVP: pakai static curated DB (gratis) atau call minimal
- production: minta quote sales / pakai tier trial

Karena tidak ada daftar harga publik yang konsisten, biaya Sherpa di dokumen ini **TBD**.

---

### J) Auth — `Firebase Authentication`

- Umumnya **free** sampai batas MAU tertentu untuk auth methods email/social/anonymous.
- Phone auth dan beberapa fitur enterprise/Identity Platform bisa berbayar.

Untuk estimasi MVP/early: asumsikan user pakai email/social/anonymous dan MAU masih < batas free → **~$0**.

## 5) Estimasi total/bulan (yang bisa dipakai untuk planning awal)

| Komponen | MVP (50) | Early (500) | Produksi (2.000) |
|---|---:|---:|---:|
| LLM | ~`$0.07` | ~`$0.70` | ~`$2.80` |
| Google Places | $0 | $0 | ~`$352` |
| Google Routes | $0 | $0 | $0 |
| OpenWeather | $0 | $0 | $0 |
| Duffel search | $0 | $0 | $0 |
| LiteAPI core | $0 | $0 | $0 |
| Firebase Auth | ~`$0` | ~`$0` | ~`$0` (jika masih dalam kuota free) |
| Sherpa | TBD | TBD | TBD |
| Infra (VPS/cache) | ~`$15–$30` | ~`$15–$30` | ~`$20–$40` |
| **TOTAL** | ~`$15–$35` | ~`$16–$32` | ~`$374–$400` + Sherpa TBD |

## 6) Yang harus dilakukan supaya angka ini akurat

1. Setelah implementasi, pasang telemetry:
   - jumlah request per provider per endpoint,
   - fieldmask/SKU yang dipakai,
   - token input/output per LLM call.
2. Buat “budget guardrail”:
   - limit maksimum POI enrichment per trip,
   - cache TTL untuk Places/Routes,
   - stop replan jika budget token bulanan hampir habis.

