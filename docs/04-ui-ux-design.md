# Traverior — UI/UX Design

**Brand:** Traverior · *Your journey, in flow.*  
**Platform MVP:** Flutter (Android & iOS). Mockup PNG di `design/mockups/` (`traverior-ui-*.png`) adalah sumber visual; implementasi sebagai Flutter widgets (bukan web).

## Filosofi

**"Satu layar, satu tujuan. Detail muncul saat dibutuhkan."**

Pipeline rekursif disembunyikan lewat progressive disclosure: satu level per layar + breadcrumb.

## Design System

### Warna
- Primary / Accent: Teal `#0D9488`
- Background: Slate-50 / Slate-950
- Surface: White / Slate-900
- Warning: Amber (alerts, disruption)
- Error: Rose (cancel)

### Typography
- Display 28px — Trip title
- H1 22px — Checkpoint
- Body 15px — Segment details
- Caption 13px — Meta (waktu, harga)
- Font: Inter / Plus Jakarta Sans (via `google_fonts`)

### Spacing
- Base 4px · Card padding 16px · Radius 12px (cards) / 24px (pills)

## Information Architecture

```
Bottom Nav (4 tabs)
├── Home       → Start trip, active trips
├── Journey    → Pipeline spine (macro)
├── Today      → Live mode selama trip
└── Profile    → Preferences

Stack navigation (drill-down)
├── Checkpoint Detail
├── POI Detail
├── Segment Detail + Book CTA
└── Budget Dashboard
```

## Screens

| Screen | Goal |
|--------|------|
| Home | Zero friction start — 1 input + CTA |
| AI Planning | Trust — tampilkan step tool/API |
| Journey Pipeline | Bird-eye view vertical spine |
| Checkpoint Detail | Satu level sub-pipeline |
| Today | Action-first: "Selanjutnya" |
| Preferences | Set once, apply everywhere |
| Edit Mode | Customize pipeline |
| Action Sheet | Edit / Ganti / Kunci / Hapus |
| Add Node | Pilih tipe node baru |
| Validation | Warning konflik waktu/budget |

## Prinsip UX

1. Progressive disclosure
2. Context always visible (breadcrumb, budget, progress)
3. Action-first saat traveling (Today tab)
4. Trust the AI (transparent planning loader)
5. Max 4 bottom tabs

## Mockups

Lihat folder [`../design/mockups/`](../design/mockups/).

## Prototype Interaktif

Sumber canvas: [`../design/travel-agent-ui-ux.canvas.tsx`](../design/travel-agent-ui-ux.canvas.tsx)
