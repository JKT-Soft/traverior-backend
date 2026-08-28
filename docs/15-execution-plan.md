# Traverior — Backend execution plan (current)

1. ~~Wire LLM di PlannerService — skeleton tree dari prompt (Fase 1)~~ ✅
2. ~~MCP Client di Node — connect ke MCP servers / in-process fallback~~ ✅
3. ~~Endpoint `POST /v1/trips/:id/plan` — persist nodes ke Postgres~~ ✅
4. ~~Panggil `rollupTrip` + `PolicyService` setelah plan~~ ✅ (included in step 3)
5. Baru: edit API (lock/delete/update) → hardening/CI/deploy

## Done in step 3

- `POST /v1/trips/:tripId/plan` — auth required
- Flow: `planning` → LLM skeleton → MCP tools → soft-delete replaceable AI nodes → insert checkpoints + tool nodes → `rollupTrip` → `ready`
- Policy: locked / custom / suppressAiRestore AI nodes are preserved
- Optional body: `preferences`, `context`, `executeTools` (default true; set false for skeleton-only persist)
