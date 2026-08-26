# Traverior — Model Pipeline Rekursif

## Konsep

Setiap titik dalam perjalanan adalah **pipeline**; setiap pipeline bisa dipecah menjadi **sub-pipeline** tanpa batas kedalaman sampai level detail yang user butuhkan.

```
Pipeline (node)
├── metadata (nama, lokasi, waktu, status, cost aggregate)
├── content (flight, hotel, event, checklist, dll.)
└── children[] → Pipeline[]   ← rekursif, depth unlimited
```

## Hierarki Contoh

```
📦 Trip: Asia Timur 2026                          [depth 0]
├── 🛫 Leg: Jakarta → Shanghai                    [depth 1]
├── 📍 Shanghai (Transit)                         [depth 1]
│   ├── 📋 Checklist                              [depth 2]
│   ├── 💡 Recommendations                        [depth 2]
│   │   ├── Restaurant / Food corner / Mall       [depth 3]
│   └── 🚶 Layover Pipeline                       [depth 2]
│       └── Destinations via Bus                  [depth 3+]
├── 📍 Osaka (Stay)                               [depth 1]
│   └── 🏨 Stay Pipeline                          [depth 2]
│       ├── Check-in Hotel                        [depth 3]
│       ├── Day 1 / Day 2 Pipelines               [depth 3]
│       │   └── POI → Food sub-pipeline           [depth 4+]
│       └── Social Event                          [depth 3]
├── Kyoto, Tokyo, Taipei...
└── 📍 Jakarta (Return)
```

## Tipe Node

| Type | Bisa punya children? | Contoh |
|------|----------------------|--------|
| `JOURNEY` | ✅ | Seluruh trip |
| `CHECKPOINT` | ✅ | Osaka, Kyoto |
| `LEG` | ✅ | Flight, Train |
| `ACTIVITY` | ✅ | Day 1, Layover |
| `POI` | ✅ | Dotonbori |
| `BOOKING` | ✅ | Flight NH123, Hotel X |
| `MODULE` | ✅ | Checklist, Recommendations |
| `LEAF` | ❌ | Satu item checklist |

Checkpoint types: `ORIGIN` | `TRANSIT` | `STAY` | `DAY_TRIP` | `RETURN`

## Model Data

```typescript
interface PipelineNode {
  id: string;
  parentId: string | null;
  depth: number;
  path: string; // e.g. "trip/osaka/day1/dotonbori"

  type: PipelineNodeType;
  title: string;
  content?: FlightContent | HotelContent | PlaceContent | ChecklistContent | ...;

  cost: { amount: number; currency: string; isEstimate: boolean };
  duration: { minutes: number };
  schedule: { start?: DateTime; end?: DateTime };
  status: 'planned' | 'active' | 'completed' | 'disrupted' | 'skipped';

  children: PipelineNode[];

  // Custom editing fields
  origin: 'ai' | 'user' | 'api';
  isLocked: boolean;
  isCustom: boolean;
  userNotes?: string;

  source: 'ai' | 'user' | 'api';
  lastRefreshedAt?: DateTime;
  version: number;
}
```

## Operasi Tree

| Operasi | Deskripsi |
|---------|-----------|
| Expand / Collapse | Tampilkan / sembunyikan children |
| Drill-down | Masuk ke sub-pipeline penuh |
| Add / Move / Clone / Prune | CRUD subtree |
| Merge / Split | Gabung atau pecah checkpoint |
| Refresh / Replan subtree | Update hanya branch terdampak |

## Lazy Expansion

| Level | Auto-generate AI? | Trigger |
|-------|-------------------|---------|
| Trip → Checkpoint | ✅ Always | Planning |
| Checkpoint → Day | ✅ Always | Planning |
| Day → POI | ✅ Usually | Planning |
| POI → Restaurant list | ⚡ Lazy | User tap / 24h before |
| Checklist item | 🍃 Leaf | — |

## Aggregate Roll-up

Biaya & waktu parent = sum(children) + own content. Root trip menampilkan total keseluruhan.
