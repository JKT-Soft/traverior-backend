# Traverior — Backend execution plan (current)

1. ~~Wire LLM di PlannerService — skeleton tree dari prompt (Fase 1)~~ ✅
2. MCP Client di Node — connect ke MCP servers / atau sementara call domain services dengan kontrak tool yang sama
3. Endpoint `POST /v1/trips/:id/plan` — persist nodes ke Postgres
4. Panggil `rollupTrip` + `PolicyService` setelah plan
5. Baru: edit API (lock/delete/update) → hardening/CI/deploy

## Done in step 1

- `POST /v1/planner/skeleton` → `PlannerService.planSkeleton`
- OpenAI client (`LLM_PROVIDER` / `OPENAI_API_KEY`) + heuristic fallback
- Schema validation: `TripSkeleton` (zod)
- Prompt spec: [09-prompt-spec.md](./09-prompt-spec.md)
