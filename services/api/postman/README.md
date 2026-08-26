# Postman — Traverior API

## Import

1. Buka Postman → **Import**
2. Pilih:
   - `Traverior-API.postman_collection.json`
   - `Traverior-Local.postman_environment.json`
3. Aktifkan environment **Traverior Local** (pojok kanan atas)

## Variables

| Variable | Default | Keterangan |
|----------|---------|------------|
| `baseUrl` | `http://localhost:3000` | API base |
| `authToken` | `dev:demo-user` | Dev auth (`AUTH_MODE=dev`) → header `Bearer {{authToken}}` |
| `tripId` | (auto) | Diisi setelah **POST /v1/trips** |
| `rootNodeId` | (auto) | Root JOURNEY node UUID |
| `parentId` | (auto) | Default = rootNodeId untuk list/add children |

Firebase mode: ganti `authToken` dengan Firebase ID token.

## Urutan uji yang disarankan

1. `GET /health` — cek server + providers
2. Domain search (flights / hotels / places / …) — tidak wajib auth
3. `GET /v1/auth/me` — cek auth
4. **POST /v1/trips** — butuh Postgres; simpan `tripId` otomatis
5. `GET /v1/trips/:tripId` → `POST .../nodes` → `GET .../nodes`
6. `POST /v1/planner/enrich-city` — orkestrasi multi-provider

## Prasyarat

```bash
# dari services/api
docker compose up -d postgres   # dari repo root jika perlu
npx prisma migrate dev
npm run dev
```
