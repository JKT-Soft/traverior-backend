# Traverior — API Docs: Third-Party Providers (via MCP)

> Dokumen ini mendaftar **API provider mana yang dipanggil** dari setiap MCP server.  
> Flutter **tidak** memanggil provider. Node orchestrator + MCP client yang memanggil MCP tools; MCP server yang memanggil HTTP API di bawah.

**Prinsip grounding:** harga, waktu, jarak, ketersediaan hanya dari respons API ini — bukan teks bebas LLM.

---

## Ringkasan mapping

| MCP Server | Provider | MCP Tools (diekspos ke LLM) | API third-party yang dipanggil |
|------------|----------|-----------------------------|-------------------------------|
| `mcp-flights` | Duffel | `search_flights`, `get_offer`, `get_flight_status`* | Offer Requests, Offers, (Airline Initiated Changes / status fase lanjut) |
| `mcp-hotels` | LiteAPI (Nuitee) | `search_hotels`, `get_hotel_detail` | `POST /hotels/rates`, `GET /data/hotel`, `GET /data/hotels` |
| `mcp-places` | Google Places API (New) | `search_restaurants`, `search_pois`, `get_place_detail` | `places:searchText`, `places:searchNearby`, `places/{id}` |
| `mcp-routes` | Google Routes API | `get_route`, `get_distance_matrix` | `computeRoutes`, `computeRouteMatrix` |
| `mcp-weather` | OpenWeather One Call 3.0 | `get_forecast`, `get_weather_alerts` | One Call 3.0 `/data/3.0/onecall` |
| `mcp-events` | Eventbrite + Viator | `search_events`, `search_tours` | Eventbrite Events Search; Viator Products Search |
| `mcp-visa` | Sherpa | `get_visa_requirements` | Trip / requirements endpoints (partner docs) |
| `mcp-checklist` | Internal | `generate_checklist` | *(tanpa third-party; boleh gabung output Sherpa)* |
| *(Node service, bukan MCP)* | ExchangeRate-API | — | `GET /v6/latest/{base}` untuk budget convert |
| *(Node service, bukan MCP)* | Firebase Auth | — | Verify ID token (Admin SDK) |

\* `get_flight_status` = fase monitor/replan; MVP boleh stub.

---

## 1. `mcp-flights` → Duffel

**Base URL:** `https://api.duffel.com`  
**Auth:** `Authorization: Bearer <DUFFEL_ACCESS_TOKEN>` + header `Duffel-Version: v2` (atau versi docs terkini)  
**Docs:** https://duffel.com/docs/api

### MCP Tools

| Tool | Kapan dipanggil | Endpoint Duffel |
|------|-----------------|-----------------|
| `search_flights` | Skeleton butuh LEG flight | `POST /air/offer_requests?return_offers=true` |
| `get_offer` | User pilih / refresh harga offer | `GET /air/offers/{id}` |
| `get_flight_status` | Replan / disruption (fase lanjut) | Airline Initiated Changes / order-related (lihat docs Duffel Orders) |

### `search_flights` — request (MCP → Duffel)

```http
POST https://api.duffel.com/air/offer_requests?return_offers=true
```

Body ringkas:
```json
{
  "data": {
    "slices": [
      {
        "origin": "CGK",
        "destination": "KIX",
        "departure_date": "2026-10-01"
      }
    ],
    "passengers": [{ "type": "adult" }],
    "cabin_class": "economy"
  }
}
```

**Output ke Node (normalized):** daftar offer → `price`, `currency`, `carrier`, `flightNumber`, `departureAt`, `arrivalAt`, `durationMinutes`, `deepLink` / offer id untuk booking redirect.

**MVP:** search + simpan top N offers ke `PipelineNode.content` + deep-link.  
**Out of scope MVP:** create order / payment in-app (`POST /air/orders`).

### Env
```env
DUFFEL_ACCESS_TOKEN=...
```

---

## 2. `mcp-hotels` → LiteAPI (Nuitee)

**Base URL:** `https://api.liteapi.travel/v3.0`  
**Auth:** `X-API-Key: <LITEAPI_KEY>`  
**Docs:** https://docs.liteapi.travel

### MCP Tools

| Tool | Endpoint LiteAPI |
|------|------------------|
| `search_hotels` | `POST /hotels/rates` |
| `get_hotel_detail` | `GET /data/hotel?hotelId=...` (atau include hotel data di rates) |
| *(helper internal)* | `GET /data/hotels` — daftar hotel by city / iata jika perlu hotelIds dulu |

### `search_hotels` — request

```http
POST https://api.liteapi.travel/v3.0/hotels/rates
```

```json
{
  "checkin": "2026-10-01",
  "checkout": "2026-10-04",
  "currency": "IDR",
  "guestNationality": "ID",
  "occupancies": [{ "adults": 2 }],
  "cityName": "Osaka",
  "countryCode": "JP",
  "maxRatesPerHotel": 1,
  "includeHotelData": true
}
```

Alternatif lokasi: `hotelIds`, `placeId`, `iataCode`, `latitude`/`longitude`, atau `aiSearch`.

**Output normalized:** `hotelId`, `name`, `stars`, `address`, `rateAmount`, `currency`, `boardName`, `refundable`, `deepLink` / booking URL.

**MVP:** search rates + deep-link (tanpa `prebook`/`book` in-app).  
**Fase lanjut:** `POST /rates/prebook`, `POST /rates/book` jika booking in-API.

### Env
```env
LITEAPI_KEY=...
```

---

## 3. `mcp-places` → Google Places API (New)

**Base URL:** `https://places.googleapis.com/v1`  
**Auth:** `X-Goog-Api-Key: <GOOGLE_MAPS_API_KEY>` + **FieldMask wajib** (`X-Goog-FieldMask`)  
**Docs:** https://developers.google.com/maps/documentation/places/web-service

### MCP Tools

| Tool | Endpoint Google |
|------|-----------------|
| `search_restaurants` | `POST /places:searchText` (query: restaurant + city) atau `POST /places:searchNearby` (`includedTypes: restaurant`) |
| `search_pois` | `POST /places:searchText` / `searchNearby` (tourist_attraction, shopping_mall, dll.) |
| `get_place_detail` | `GET /places/{placeId}` |

### Contoh `search_restaurants`

```http
POST https://places.googleapis.com/v1/places:searchText
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.priceLevel,places.types
```

```json
{
  "textQuery": "halal restaurants in Osaka",
  "maxResultCount": 8,
  "languageCode": "id"
}
```

**Guardrail biaya:** FieldMask **Pro minimal** — jangan minta `reviews` / atmosphere di MVP (naik ke Enterprise+). Cache hasil di `ProviderCache` (TTL 7–30 hari untuk data relatif statis).

### Env
```env
GOOGLE_MAPS_API_KEY=...
```

---

## 4. `mcp-routes` → Google Routes API

**Base URL:** `https://routes.googleapis.com`  
**Auth:** API key / OAuth sesuai Google Maps Platform  
**Docs:** https://developers.google.com/maps/documentation/routes

> Legacy Directions API masih bisa dipakai, tapi **Routes API** adalah pilihan locked untuk Traverior.

### MCP Tools

| Tool | Endpoint |
|------|----------|
| `get_route` | `POST /directions/v2:computeRoutes` |
| `get_distance_matrix` | `POST /distanceMatrix/v2:computeRouteMatrix` |

### Contoh `get_route`

```http
POST https://routes.googleapis.com/directions/v2:computeRoutes
X-Goog-FieldMask: routes.duration,routes.distanceMeters,routes.legs
```

```json
{
  "origin": { "location": { "latLng": { "latitude": 34.4347, "longitude": 135.244 } } },
  "destination": { "location": { "latLng": { "latitude": 34.6937, "longitude": 135.5023 } } },
  "travelMode": "TRANSIT",
  "languageCode": "id"
}
```

**Output normalized:** `durationMinutes`, `distanceMeters`, `mode`, `stepsSummary[]`.

### Env
```env
GOOGLE_MAPS_API_KEY=...
```
*(satu key Maps Platform bisa enable Places + Routes SKU)*

---

## 5. `mcp-weather` → OpenWeather One Call 3.0

**Base URL:** `https://api.openweathermap.org`  
**Auth:** query `appid=<OPENWEATHER_API_KEY>`  
**Docs:** https://openweathermap.org/api/one-call-3

### MCP Tools

| Tool | Endpoint |
|------|----------|
| `get_forecast` | `GET /data/3.0/onecall?lat=&lon=&exclude=minutely` |
| `get_weather_alerts` | Sama One Call — ambil field `alerts[]` (bisa 1 call untuk keduanya) |

```http
GET https://api.openweathermap.org/data/3.0/onecall?lat=34.69&lon=135.50&units=metric&exclude=minutely&appid=...
```

**Output normalized:** daily forecast, `alerts[]` → bisa jadi `TripAlert`.

### Env
```env
OPENWEATHER_API_KEY=...
```

---

## 6. `mcp-events` → Eventbrite + Viator

Dua provider di satu MCP server; tool memutuskan sumber berdasarkan intent (gratis/komunitas vs tour berbayar).

### 6a. Eventbrite — `search_events`

**Base:** `https://www.eventbriteapi.com/v3`  
**Auth:** `Authorization: Bearer <EVENTBRITE_TOKEN>`  
**Docs:** https://www.eventbrite.com/platform/api

| Tool | Endpoint tipikal |
|------|------------------|
| `search_events` | `GET /events/search/` *(atau endpoint search/location sesuai akses partner terkini)* |

Parameter penting: lokasi / `location.address` / lat-lng, tanggal, keyword.  
Filter produk: **`is_free=true|false`** → pipeline menampilkan event gratis & berbayar.

### 6b. Viator — `search_tours`

**Base:** tergantung partner tier (Affiliate / Merchant), umumnya Viator Partner API  
**Auth:** API key header sesuai partner docs  
**Docs:** Viator Partner / Tripadvisor Experiences API (akses setelah approve)

| Tool | Endpoint tipikal |
|------|------------------|
| `search_tours` | Product search / destinations / products by location |

**Output normalized (kedua sumber):**
```json
{
  "name": "...",
  "isFree": false,
  "price": 45,
  "currency": "USD",
  "startsAt": "...",
  "source": "eventbrite|viator",
  "externalId": "...",
  "deepLink": "https://..."
}
```

### Env
```env
EVENTBRITE_TOKEN=...
VIATOR_API_KEY=...
```

**Catatan:** Public `GET /events/search/` di-shutdown Eventbrite (Dec 2019).  
Provider Traverior: coba API search bila partner access ada; jika 404 → **discovery page JSON-LD** (`eventbrite.com/d/{slug}/events/`) untuk event publik per kota. Token tetap wajib untuk mode `eventbrite` (validasi / partner path).

---

## 7. `mcp-visa` → Sherpa

**Provider:** Sherpa (visa / travel requirements)  
**Auth:** API key / partner credentials (sales)  
**Docs:** partner portal Sherpa (bukan selalu public self-serve)

### MCP Tools

| Tool | Perilaku |
|------|----------|
| `get_visa_requirements` | Input: passport country, destination country, travel dates → requirements, eVisa link, docs list |

**MVP minggu 1–4:** boleh **curated static JSON** di Node jika Sherpa belum live; MCP tool tetap ada agar interface tidak berubah.

### Env
```env
SHERPA_API_KEY=...
```

---

## 8. `mcp-checklist` → Internal (bukan third-party)

| Tool | Sumber |
|------|--------|
| `generate_checklist` | Template per destinasi + preferensi user + (opsional) item visa dari hasil `mcp-visa` |

Tidak ada HTTP provider eksternal wajib. Output → `MODULE` node `contentType: checklist`.

---

## 9. Dipakai Node langsung (bukan MCP tool LLM)

### ExchangeRate-API (Budget)
```http
GET https://v6.exchangerate-api.com/v6/<KEY>/latest/IDR
```
Konversi `costAmount` multi-currency → `homeCurrency` user.

### Firebase Admin
Verifikasi `Authorization: Bearer <idToken>` — bukan travel data.

### LLM Provider (OpenAI / Claude)
Dipanggil **AI Planner** di Node (bukan MCP travel server): skeleton tree + (opsional) enrich narasi.

---

## 10. Kontrak MCP tool (bentuk umum)

Setiap tool mengembalikan shape seragam ke orchestrator:

```typescript
type McpToolResult = {
  ok: boolean;
  provider: string;
  tool: string;
  fetchedAt: string; // ISO
  data: unknown;     // normalized per domain
  rawRef?: string;   // id untuk cache / debug
  error?: { code: string; message: string };
};
```

Node yang:
1. Normalize → `PipelineNode.content`
2. Set `costAmount`, `durationMinutes`, `deepLinkUrl`, `provider`, `providerRef`
3. Cache ke `ProviderCache` bila applicable
4. Jangan tulis angka dari LLM jika tool gagal → label estimate + alert

---

## 11. Prioritas implementasi (selaras weekly plan)

| Fase | MCP + API |
|------|-----------|
| W1 | `mcp-routes` → `computeRoutes` (paling sederhana) |
| W3–4 | `mcp-flights` → Duffel offer_requests; `mcp-hotels` → LiteAPI rates |
| W4–5 | `mcp-weather` One Call; `mcp-places` searchText |
| W5–6 | `mcp-events` Eventbrite + Viator; `mcp-visa` (atau static) |
| W6+ | `mcp-checklist`; ExchangeRate di cost service |
| W7+ | Flight status / alerts; prebook optional |

---

## 12. Checklist akun / key yang perlu didaftar

| # | Provider | Key / akses | Status |
|---|----------|-------------|--------|
| 1 | Duffel | Access token (test + live) | ☐ |
| 2 | LiteAPI | `X-API-Key` sandbox | ☐ |
| 3 | Google Cloud | Places API (New) + Routes API enabled | ☐ |
| 4 | OpenWeather | One Call by Call subscription | ☐ |
| 5 | Eventbrite | Private token / app | ☐ |
| 6 | Viator | Partner API approval | ☐ |
| 7 | Sherpa | Partner / sales | ☐ atau static MVP |
| 8 | ExchangeRate-API | API key | ☐ |
| 9 | OpenAI / Claude | LLM key | ☐ |
| 10 | Firebase | Project + Admin credentials | ☐ |

---

## 13. Referensi resmi

| Provider | Link |
|----------|------|
| Duffel | https://duffel.com/docs/api |
| LiteAPI | https://docs.liteapi.travel |
| Google Places (New) | https://developers.google.com/maps/documentation/places/web-service |
| Google Routes | https://developers.google.com/maps/documentation/routes |
| OpenWeather One Call 3.0 | https://openweathermap.org/api/one-call-3 |
| Eventbrite Platform | https://www.eventbrite.com/platform/api |
| Viator Partner | (setelah approve partner) |
| Sherpa | (partner docs) |
| ExchangeRate-API | https://www.exchangerate-api.com/docs |

Lihat juga: [03-architecture-tools.md](./03-architecture-tools.md) · [10-api-cost-estimate.md](./10-api-cost-estimate.md) · [07-tech-stack.md](./07-tech-stack.md)
