# Traverior — Database Design (PostgreSQL + Prisma)

> Source of truth: **PostgreSQL**. ORM: **Prisma**.  
> Tidak memakai MongoDB; konten fleksibel per node disimpan sebagai **JSONB**.

---

## 1. Prinsip Desain

1. **Satu tree per trip** — `PipelineNode` self-referential (`parentId`).
2. **Relasional untuk identitas & agregat** — user, trip, biaya, status, lock.
3. **JSONB untuk payload provider** — flight/hotel/place berbeda bentuk tanpa tabel per tipe.
4. **Soft-delete** — node yang dihapus user tidak di-restore otomatis saat AI replan.
5. **Roll-up di aplikasi** — parent `cost` / `duration` dihitung ulang di Node orchestrator (bisa di-cache di kolom parent).
6. **Modular monolith** — satu schema DB; bukan DB per microservice.

---

## 2. ER Diagram (ringkas)

```
┌─────────────┐       ┌──────────────────┐
│    User     │──1:N──│ UserPreference   │
└──────┬──────┘       └──────────────────┘
       │ 1:N
       ▼
┌─────────────┐       ┌──────────────────┐
│    Trip     │──1:N──│  PipelineNode    │◄──┐
└──────┬──────┘       │  (self tree)     │───┘ parentId
       │              └────────┬─────────┘
       │ 1:N                   │ 1:N
       ▼                       ▼
┌─────────────┐       ┌──────────────────┐
│ TripAlert   │       │ PipelineEditLog  │
└─────────────┘       └──────────────────┘

Opsional MVP+ :
┌──────────────────┐
│ ProviderCache    │  ← cache hasil MCP (Places/Routes/Weather)
└──────────────────┘
┌──────────────────┐
│ ExchangeRate     │  ← snapshot kurs untuk budget
└──────────────────┘
```

---

## 3. Tabel Inti

### 3.1 `User`

Sync dari Firebase Auth saat first login.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | Internal ID |
| `firebaseUid` | TEXT UNIQUE | Firebase UID |
| `email` | TEXT | |
| `displayName` | TEXT? | |
| `photoUrl` | TEXT? | |
| `locale` | TEXT | default `id` |
| `homeCurrency` | TEXT | default `IDR` |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | |

### 3.2 `UserPreference`

Preferensi untuk personalisasi AI (1:1 atau 1:N jika multi-profile nanti; MVP: 1:1).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `userId` | UUID (FK → User) UNIQUE | |
| `budgetMax` | DECIMAL? | dalam `homeCurrency` |
| `budgetStyle` | ENUM | `budget` \| `balanced` \| `luxury` |
| `pace` | ENUM | `relaxed` \| `moderate` \| `packed` |
| `dietary` | TEXT[] | mis. `halal`, `vegetarian` |
| `interests` | TEXT[] | mis. `food`, `culture`, `nature` |
| `travelWith` | ENUM? | `solo` \| `couple` \| `family` \| `friends` |
| `avoid` | TEXT[] | |
| `extra` | JSONB | field fleksibel |
| `updatedAt` | TIMESTAMPTZ | |

### 3.3 `Trip`

Root perjalanan (satu JOURNEY).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `userId` | UUID (FK → User) | |
| `title` | TEXT | |
| `status` | ENUM | `draft` \| `planning` \| `ready` \| `active` \| `completed` \| `archived` |
| `originCity` | TEXT | mis. Jakarta |
| `destinationSummary` | TEXT? | mis. "Asia Timur" |
| `startDate` | DATE? | |
| `endDate` | DATE? | |
| `partySize` | INT | default 1 |
| `baseCurrency` | TEXT | default `IDR` |
| `totalCostAmount` | DECIMAL | roll-up cached |
| `totalCostIsEstimate` | BOOLEAN | |
| `totalDurationMinutes` | INT | roll-up cached |
| `rootNodeId` | UUID? | FK → PipelineNode (depth 0) |
| `planningVersion` | INT | naik tiap replan besar |
| `lastPlannedAt` | TIMESTAMPTZ? | |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | |

Index: `(userId, status)`, `(userId, updatedAt DESC)`.

### 3.4 `PipelineNode` (inti — tree rekursif)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `tripId` | UUID (FK → Trip) | denormalized untuk query cepat |
| `parentId` | UUID? (FK → self) | `null` = root |
| `depth` | INT | 0 = JOURNEY root |
| `path` | TEXT | materialisasi path, mis. `trip/osaka/day1` |
| `sortOrder` | INT | urutan sibling |
| `type` | ENUM | lihat §4 |
| `checkpointKind` | ENUM? | `ORIGIN` \| `TRANSIT` \| `STAY` \| `DAY_TRIP` \| `RETURN` |
| `title` | TEXT | |
| `subtitle` | TEXT? | |
| `status` | ENUM | `planned` \| `active` \| `completed` \| `disrupted` \| `skipped` |
| `contentType` | TEXT? | mis. `flight`, `hotel`, `place`, `route`, `event`, `checklist` |
| `content` | JSONB | payload typed (lihat §5) |
| `costAmount` | DECIMAL | own atau roll-up |
| `costCurrency` | TEXT | |
| `costIsEstimate` | BOOLEAN | |
| `durationMinutes` | INT | |
| `distanceMeters` | INT? | dari Routes API |
| `scheduleStart` | TIMESTAMPTZ? | |
| `scheduleEnd` | TIMESTAMPTZ? | |
| `locationLat` | DOUBLE? | |
| `locationLng` | DOUBLE? | |
| `locationLabel` | TEXT? | |
| `deepLinkUrl` | TEXT? | booking redirect |
| `provider` | TEXT? | `duffel`, `liteapi`, `google_places`, … |
| `providerRef` | TEXT? | ID eksternal (offer id, place id) |
| `origin` | ENUM | `ai` \| `user` \| `api` |
| `isLocked` | BOOLEAN | AI skip saat replan |
| `isCustom` | BOOLEAN | dibuat/diubah user secara signifikan |
| `userNotes` | TEXT? | |
| `suppressAiRestore` | BOOLEAN | deleted / “jangan tampilkan lagi” |
| `deletedAt` | TIMESTAMPTZ? | soft delete |
| `lastRefreshedAt` | TIMESTAMPTZ? | |
| `version` | INT | optimistic concurrency |
| `createdAt` | TIMESTAMPTZ | |
| `updatedAt` | TIMESTAMPTZ | |

**Index penting:**
- `(tripId, parentId, sortOrder)` — list children
- `(tripId, path)` — lookup by path
- `(tripId, type)` — filter modul
- `(tripId, deletedAt)` — exclude soft-deleted
- GIN pada `content` jika perlu query JSON (fase lanjut)

**Constraint:**
- `CHECK (parentId IS NULL OR tripId konsisten dengan parent)` — enforce di service layer / trigger opsional
- Root: `parentId IS NULL AND depth = 0 AND type = 'JOURNEY'`

### 3.5 `PipelineEditLog`

Audit + undo minimal.

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `tripId` | UUID (FK) | |
| `nodeId` | UUID (FK) | |
| `userId` | UUID (FK) | |
| `action` | ENUM | `add` \| `edit` \| `delete` \| `lock` \| `unlock` \| `reorder` \| `replace` \| `replan` |
| `before` | JSONB? | snapshot ringkas |
| `after` | JSONB? | |
| `createdAt` | TIMESTAMPTZ | |

Index: `(nodeId, createdAt DESC)`, `(tripId, createdAt DESC)`.

### 3.6 `TripAlert`

Cuaca, cancel, disruption (monitor / replan).

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `tripId` | UUID (FK) | |
| `nodeId` | UUID? (FK) | node terdampak |
| `severity` | ENUM | `weather` \| `flight` \| `event_cancel` \| `route` \| `visa` \| `system` |
| `severity` | ENUM | `info` \| `warning` \| `critical` |
| `title` | TEXT | |
| `body` | TEXT | |
| `payload` | JSONB | raw provider |
| `isRead` | BOOLEAN | |
| `createdAt` | TIMESTAMPTZ | |

### 3.7 `ProviderCache` (opsional, hemat biaya API)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `id` | UUID (PK) | |
| `cacheKey` | TEXT UNIQUE | hash query (city+date+tool) |
| `provider` | TEXT | |
| `toolName` | TEXT | |
| `request` | JSONB | |
| `response` | JSONB | |
| `expiresAt` | TIMESTAMPTZ | |
| `createdAt` | TIMESTAMPTZ | |

Index: `(expiresAt)` untuk purge job.

### 3.8 `ExchangeRate` (opsional budget)

| Kolom | Tipe | Keterangan |
|-------|------|------------|
| `base` | TEXT | |
| `quote` | TEXT | |
| `rate` | DECIMAL | |
| `fetchedAt` | TIMESTAMPTZ | |
| PK | `(base, quote)` | |

---

## 4. Enum Node Type

Selaras [02-pipeline-model.md](./02-pipeline-model.md):

| `type` | Anak? | `contentType` tipikal |
|--------|-------|------------------------|
| `JOURNEY` | ✅ | — |
| `CHECKPOINT` | ✅ | — (+ `checkpointKind`) |
| `LEG` | ✅ | `flight`, `route` |
| `ACTIVITY` | ✅ | `day`, `layover` |
| `POI` | ✅ | `place` |
| `BOOKING` | ✅ | `flight`, `hotel`, `tour` |
| `MODULE` | ✅ | `checklist`, `recommendations`, `weather` |
| `LEAF` | ❌ | `checklist_item`, `note` |

---

## 5. Bentuk `content` (JSONB) — kontrak

Validasi di service layer (Zod/TypeBox), bukan constraint DB ketat.

### Flight
```json
{
  "contentType": "flight",
  "carrier": "ANA",
  "flightNumber": "NH856",
  "origin": "CGK",
  "destination": "KIX",
  "departureAt": "...",
  "arrivalAt": "...",
  "cabin": "economy",
  "offerId": "duffel_...",
  "deepLink": "https://..."
}
```

### Hotel
```json
{
  "contentType": "hotel",
  "name": "...",
  "checkIn": "2026-10-01",
  "checkOut": "2026-10-04",
  "stars": 4,
  "address": "...",
  "hotelId": "liteapi_...",
  "deepLink": "https://..."
}
```

### Place / Restaurant / POI
```json
{
  "contentType": "place",
  "placeId": "ChIJ...",
  "name": "...",
  "rating": 4.5,
  "priceLevel": 2,
  "types": ["restaurant"],
  "isFree": false
}
```

### Route / Transport
```json
{
  "contentType": "route",
  "mode": "transit",
  "from": "...",
  "to": "...",
  "durationMinutes": 42,
  "distanceMeters": 8500,
  "stepsSummary": ["Walk", "Metro Midosuji"]
}
```

### Event (gratis / berbayar)
```json
{
  "contentType": "event",
  "name": "...",
  "isFree": true,
  "price": 0,
  "currency": "JPY",
  "startsAt": "...",
  "source": "eventbrite",
  "externalId": "...",
  "deepLink": "https://..."
}
```

### Checklist
```json
{
  "contentType": "checklist",
  "items": [
    { "id": "...", "label": "eVisa", "done": false, "source": "sherpa" }
  ]
}
```

---

## 6. Prisma Schema Draft

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum TripStatus {
  draft
  planning
  ready
  active
  completed
  archived
}

enum NodeType {
  JOURNEY
  CHECKPOINT
  LEG
  ACTIVITY
  POI
  BOOKING
  MODULE
  LEAF
}

enum CheckpointKind {
  ORIGIN
  TRANSIT
  STAY
  DAY_TRIP
  RETURN
}

enum NodeStatus {
  planned
  active
  completed
  disrupted
  skipped
}

enum NodeOrigin {
  ai
  user
  api
}

enum BudgetStyle {
  budget
  balanced
  luxury
}

enum Pace {
  relaxed
  moderate
  packed
}

enum TravelWith {
  solo
  couple
  family
  friends
}

enum EditAction {
  add
  edit
  delete
  lock
  unlock
  reorder
  replace
  replan
}

enum AlertSeverity {
  info
  warning
  critical
}

model User {
  id           String   @id @default(uuid()) @db.Uuid
  firebaseUid  String   @unique
  email        String
  displayName  String?
  photoUrl     String?
  locale       String   @default("id")
  homeCurrency String   @default("IDR")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  preference UserPreference?
  trips      Trip[]
  editLogs   PipelineEditLog[]
}

model UserPreference {
  id          String       @id @default(uuid()) @db.Uuid
  userId      String       @unique @db.Uuid
  budgetMax   Decimal?     @db.Decimal(14, 2)
  budgetStyle BudgetStyle  @default(balanced)
  pace        Pace         @default(moderate)
  dietary     String[]     @default([])
  interests   String[]     @default([])
  travelWith  TravelWith?
  avoid       String[]     @default([])
  extra       Json?
  updatedAt   DateTime     @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Trip {
  id                   String     @id @default(uuid()) @db.Uuid
  userId               String     @db.Uuid
  title                String
  status               TripStatus @default(draft)
  originCity           String?
  destinationSummary   String?
  startDate            DateTime?  @db.Date
  endDate              DateTime?  @db.Date
  partySize            Int        @default(1)
  baseCurrency         String     @default("IDR")
  totalCostAmount      Decimal    @default(0) @db.Decimal(14, 2)
  totalCostIsEstimate  Boolean    @default(true)
  totalDurationMinutes Int        @default(0)
  rootNodeId           String?    @db.Uuid
  planningVersion      Int        @default(0)
  lastPlannedAt        DateTime?
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt

  user     User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  nodes    PipelineNode[]
  alerts   TripAlert[]
  editLogs PipelineEditLog[]

  @@index([userId, status])
  @@index([userId, updatedAt])
}

model PipelineNode {
  id                 String          @id @default(uuid()) @db.Uuid
  tripId             String          @db.Uuid
  parentId           String?         @db.Uuid
  depth              Int
  path               String
  sortOrder          Int             @default(0)
  type               NodeType
  checkpointKind     CheckpointKind?
  title              String
  subtitle           String?
  status             NodeStatus      @default(planned)
  contentType        String?
  content            Json?
  costAmount         Decimal         @default(0) @db.Decimal(14, 2)
  costCurrency       String          @default("IDR")
  costIsEstimate     Boolean         @default(true)
  durationMinutes    Int             @default(0)
  distanceMeters     Int?
  scheduleStart      DateTime?
  scheduleEnd        DateTime?
  locationLat        Float?
  locationLng        Float?
  locationLabel      String?
  deepLinkUrl        String?
  provider           String?
  providerRef        String?
  origin             NodeOrigin      @default(ai)
  isLocked           Boolean         @default(false)
  isCustom           Boolean         @default(false)
  userNotes          String?
  suppressAiRestore  Boolean         @default(false)
  deletedAt          DateTime?
  lastRefreshedAt    DateTime?
  version            Int             @default(1)
  createdAt          DateTime        @default(now())
  updatedAt          DateTime        @updatedAt

  trip     Trip             @relation(fields: [tripId], references: [id], onDelete: Cascade)
  parent   PipelineNode?    @relation("NodeTree", fields: [parentId], references: [id])
  children PipelineNode[]   @relation("NodeTree")
  editLogs PipelineEditLog[]
  alerts   TripAlert[]

  @@index([tripId, parentId, sortOrder])
  @@index([tripId, path])
  @@index([tripId, type])
  @@index([tripId, deletedAt])
}

model PipelineEditLog {
  id        String     @id @default(uuid()) @db.Uuid
  tripId    String     @db.Uuid
  nodeId    String     @db.Uuid
  userId    String     @db.Uuid
  action    EditAction
  before    Json?
  after     Json?
  createdAt DateTime   @default(now())

  trip Trip         @relation(fields: [tripId], references: [id], onDelete: Cascade)
  node PipelineNode @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  user User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tripId, createdAt])
  @@index([nodeId, createdAt])
}

model TripAlert {
  id        String        @id @default(uuid()) @db.Uuid
  tripId    String        @db.Uuid
  nodeId    String?       @db.Uuid
  kind      String
  severity  AlertSeverity @default(info)
  title     String
  body      String
  payload   Json?
  isRead    Boolean       @default(false)
  createdAt DateTime      @default(now())

  trip Trip          @relation(fields: [tripId], references: [id], onDelete: Cascade)
  node PipelineNode? @relation(fields: [nodeId], references: [id], onDelete: SetNull)

  @@index([tripId, isRead, createdAt])
}

model ProviderCache {
  id        String   @id @default(uuid()) @db.Uuid
  cacheKey  String   @unique
  provider  String
  toolName  String
  request   Json
  response  Json
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@index([expiresAt])
}

model ExchangeRate {
  base      String
  quote     String
  rate      Decimal  @db.Decimal(18, 8)
  fetchedAt DateTime

  @@id([base, quote])
}
```

---

## 7. Query Patterns (penting)

### Ambil children satu level (lazy expand)
```sql
SELECT * FROM "PipelineNode"
WHERE "tripId" = $1 AND "parentId" = $2 AND "deletedAt" IS NULL
ORDER BY "sortOrder";
```

### Ambil subtree (PostgreSQL recursive CTE)
```sql
WITH RECURSIVE subtree AS (
  SELECT * FROM "PipelineNode" WHERE id = $1 AND "deletedAt" IS NULL
  UNION ALL
  SELECT n.* FROM "PipelineNode" n
  JOIN subtree s ON n."parentId" = s.id
  WHERE n."deletedAt" IS NULL
)
SELECT * FROM subtree ORDER BY depth, "sortOrder";
```

### Roll-up biaya parent
1. Sum `costAmount` children (non-deleted) + own content cost.
2. Update parent; naik ke root; sync `Trip.totalCostAmount`.
3. Jalankan di transaction setelah add/edit/delete/reorder.

### AI replan respect policy
- Skip node: `isLocked = true` OR `isCustom = true` (kecuali user confirm) OR `suppressAiRestore = true` OR `deletedAt IS NOT NULL`.

---

## 8. Mapping ke Modul Produk

| Modul | Penyimpanan |
|-------|-------------|
| Flight | `BOOKING` / `LEG` + `content` flight + `deepLinkUrl` |
| Hotel | `BOOKING` + hotel JSON |
| Restaurant / POI | `POI` / `LEAF` + place JSON |
| Transport | `LEG` / `ACTIVITY` + route JSON |
| Events | `ACTIVITY` / `BOOKING` + event JSON (`isFree`) |
| Checklist | `MODULE` + checklist JSON |
| Budget | roll-up kolom + `Trip.total*` + `ExchangeRate` |
| Weather / alerts | `MODULE` weather snippet + `TripAlert` |
| Custom edit | flag di node + `PipelineEditLog` |

---

## 9. MVP vs Fase Lanjut

| Fase | Scope DB |
|------|----------|
| **MVP (M1–2)** | `User`, `UserPreference`, `Trip`, `PipelineNode`, soft-delete, roll-up |
| **MVP (M6)** | `PipelineEditLog` (lock/edit/delete) |
| **M7+** | `TripAlert`, `ProviderCache`, `ExchangeRate` |
| **Out of scope awal** | PostGIS penuh, sharding, read replica, MongoDB |

---

## 10. Catatan Implementasi

- ID: UUID v4 (atau ULID) — Flutter & API aman.
- Money: `Decimal(14,2)` + currency code; konversi ke `homeCurrency` di service.
- Jangan simpan secret API key di DB.
- `version` pada node untuk optimistic lock saat concurrent edit.
- `path` di-update saat move/reorder (atau regenerate dari tree).

Lihat juga: [02-pipeline-model.md](./02-pipeline-model.md) · [05-custom-pipeline-editing.md](./05-custom-pipeline-editing.md) · [07-tech-stack.md](./07-tech-stack.md)
