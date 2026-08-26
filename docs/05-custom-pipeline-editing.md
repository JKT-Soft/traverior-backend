# Traverior — Custom Pipeline Editing

## Definisi

User dapat **menambah / mengubah / menghapus / mengunci** bagian pipeline secara custom, mengantisipasi preferensi di luar rekomendasi LLM.

| Aksi | Scope | Contoh |
|------|-------|--------|
| Add | Node/sub-pipeline di level manapun | Tambah resto favorit di Day 2 Osaka |
| Edit | Detail node | Ganti hotel, ubah waktu |
| Delete | Node atau subtree | Skip Dotonbori |
| Reorder | Urutan sibling | Day 2 sebelum Day 1 |
| Lock | AI tidak boleh ubah | Flight sudah dibooking |

## UX: View Mode vs Edit Mode

- **View Mode (default):** tap = drill-down
- **Edit Mode:** tap = action sheet; `[+]` = add; long-press = quick actions

Entry points:
- Tombol **Customize** di Journey / Checkpoint
- Setelah **Review & Customize** dari AI Planning

Visual:
- Banner sticky: `Mode kustomisasi · Perubahan belum disimpan`
- Badge **Custom** / **AI** / lock icon
- Tombol `[+ Tambah]` per level

## AI vs User

| Situasi | Behavior |
|---------|----------|
| Node unlocked + AI replan | AI boleh update + notifikasi diff |
| Node locked | AI skip, replan sekitarnya |
| Node custom (user buat) | AI tidak hapus/ganti tanpa konfirmasi |
| User delete node AI | Tetap deleted — AI tidak restore otomatis |

## Flows

### Add
`[+]` → Bottom sheet tipe (Transport / Restaurant / Activity / Event / Free time / Custom) → Search API atau input manual → Preview → Validasi → Save

### Edit
Tap segment → Action Sheet (Edit / Ganti / Kunci / Hapus) → Recalc cost & time

### Delete
Confirm + opsi "Jangan tampilkan lagi di replan AI"

### Validation (non-blocking)
- Konflik waktu
- Budget overflow
- Rute tidak efisien

## Data Model Extension

```typescript
origin: 'ai' | 'user' | 'api'
isLocked: boolean
isCustom: boolean
userNotes?: string
editHistory?: PipelineEdit[]
```

## Acceptance Criteria

1. Add node di checkpoint / day / POI
2. Edit waktu, durasi, catatan
3. Delete dengan konfirmasi
4. Reorder (fase lanjut: drag)
5. Lock agar AI skip saat replan
6. Visual beda Custom vs AI
7. Budget & waktu auto-recalc
8. Conflict = warning, bukan hard block
9. Undo minimal 1 step
10. AI replan respect locked + custom + deleted
11. Replace via API search
12. Save / discard draft

## Prioritas

| Fase | Scope |
|------|-------|
| MVP | Edit waktu/catatan, Delete, Lock, Recalc |
| v1.1 | Add custom + API search, Replace |
| v1.2 | Drag reorder, Undo/redo |
| v1.3 | AI optimize-around-custom |
