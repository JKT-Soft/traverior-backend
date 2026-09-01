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
| `authToken` | Firebase ID token | Header `Authorization: Bearer {{authToken}}` — dari Google Sign-In di app |
| `tripId` | (auto) | Diisi setelah **POST /v1/trips** |
| `rootNodeId` | (auto) | Root JOURNEY node UUID |
| `parentId` | (auto) | Default = rootNodeId untuk list/add children |

Hanya `GET /health` dan **Get Firebase ID token** yang tanpa auth. Semua `/v1/*` wajib token.

## Ambil token (penting)

Request login ke Google **tidak boleh** membawa `Authorization: Bearer`. Collection Traverior default-nya Bearer, jadi request token harus **Auth = No Auth**.

1. Firebase Console → Authentication → enable Email/Password → buat user tes
2. Project settings → General → copy **Web API key** (bukan OAuth client secret)
3. Environment Traverior Local:
   - `firebaseWebApiKey`
   - `testEmail`
   - `testPassword`
4. Jalankan **Auth → Get Firebase ID token (email/password)**
5. Kalau 200, `idToken` tersimpan otomatis ke `authToken`
6. Baru jalankan `GET /v1/auth/me`

## Urutan uji yang disarankan

1. `GET /health` — cek server + providers
2. **Get Firebase ID token** — No Auth; simpan `authToken`
3. `GET /v1/auth/me` — pastikan token Firebase valid
4. Domain search (flights / hotels / places / …)
5. **POST /v1/trips** — butuh Postgres; simpan `tripId` otomatis
6. `GET /v1/trips/:tripId` → `POST .../nodes` → `GET .../nodes`
7. `POST /v1/planner/enrich-city` — orkestrasi multi-provider

## Prasyarat

```bash
# dari services/api
docker compose up -d postgres   # dari repo root jika perlu
npx prisma migrate dev
npm run dev
```

Isi `FIREBASE_PROJECT_ID` di `.env`. Token: Firebase Console → Authentication, atau ID token dari Google Sign-In di Flutter.
