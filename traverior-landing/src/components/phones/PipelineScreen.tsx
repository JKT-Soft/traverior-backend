const STOPS = [
  { city: "Jakarta", role: "Origin", status: "done", extra: "" },
  { city: "Shanghai", role: "Transit", status: "done", extra: "" },
  { city: "Osaka", role: "Stay", status: "active", extra: "3 malam" },
  { city: "Kyoto", role: "Stay", status: "upcoming", extra: "2 malam" },
  { city: "Tokyo", role: "Stay", status: "upcoming", extra: "3 malam" },
  { city: "Taipei", role: "Transit", status: "upcoming", extra: "" },
  { city: "Jakarta", role: "Return", status: "upcoming", extra: "" },
];

const ROLE: Record<string, string> = {
  Origin: "bg-teal/15 text-teal-dark",
  Transit: "bg-sky-100 text-sky-800",
  Stay: "bg-emerald-100 text-emerald-800",
  Return: "bg-violet-100 text-violet-800",
};

export function PipelineScreen() {
  return (
    <div className="min-h-[520px] bg-white px-3.5 pb-4 pt-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[14px] font-bold leading-tight text-ink">Asia Timur 2026</p>
          <p className="mt-0.5 text-[9px] text-muted">IDR 28.450.000 · 1–12 Okt</p>
        </div>
        <span className="rounded-full bg-teal/10 px-2 py-1 text-[9px] font-semibold text-teal-dark">
          35%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 rounded-xl bg-slate-100 p-0.5 text-[9px] font-semibold">
        <span className="rounded-lg bg-teal py-1.5 text-center text-white">Pipeline</span>
        <span className="py-1.5 text-center text-muted">Map</span>
        <span className="py-1.5 text-center text-muted">Budget</span>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="progress-run h-full rounded-full bg-teal" />
      </div>
      <p className="mt-1 text-[8px] text-muted">Day 4 of 12</p>

      <ol className="mt-3 space-y-0">
        {STOPS.map((stop, i) => (
          <li key={`${stop.city}-${i}`} className="flex gap-2.5">
            <div className="flex flex-col items-center">
              <span
                className={`relative z-10 mt-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 ${
                  stop.status === "done"
                    ? "border-teal bg-teal"
                    : stop.status === "active"
                      ? "border-teal bg-white"
                      : "border-slate-300 bg-white"
                }`}
              >
                        {stop.status === "active" ? (
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-teal" />
                ) : null}
              </span>
              {i < STOPS.length - 1 ? (
                <span
                  className={`w-px flex-1 ${stop.status === "done" ? "bg-teal" : "bg-slate-200"}`}
                />
              ) : null}
            </div>
            <div className="mb-2.5 flex min-w-0 flex-1 items-center justify-between rounded-xl border border-sand bg-slate-50/80 px-2.5 py-1.5">
              <div>
                <p className="text-[11px] font-bold text-ink">{stop.city}</p>
                {stop.extra ? (
                  <p className="text-[8px] text-muted">{stop.extra}</p>
                ) : null}
              </div>
              <span className={`rounded-full px-1.5 py-0.5 text-[8px] font-semibold ${ROLE[stop.role]}`}>
                {stop.role}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
