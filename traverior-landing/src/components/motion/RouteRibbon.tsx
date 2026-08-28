const STOPS = [
  { code: "JKT", city: "Jakarta" },
  { code: "SHA", city: "Shanghai" },
  { code: "OSA", city: "Osaka" },
  { code: "KYO", city: "Kyoto" },
  { code: "TYO", city: "Tokyo" },
  { code: "TPE", city: "Taipei" },
  { code: "JKT", city: "Pulang" },
];

export function RouteRibbon() {
  return (
    <div className="border-y border-sand bg-cream/80 py-5" aria-hidden>
      <div className="mx-auto flex max-w-6xl items-center justify-center gap-0 overflow-x-auto px-5">
        {STOPS.map((stop, i) => (
          <div key={`${stop.code}-${i}`} className="flex items-center">
            <div className="flex min-w-[4.5rem] flex-col items-center">
              <span
                className="seq-node h-2.5 w-2.5 rounded-full bg-teal"
                style={{ animationDelay: `${i * 0.68}s` }}
              />
              <span className="mt-2 text-[11px] font-bold tracking-wider text-ink">
                {stop.code}
              </span>
              <span className="text-[9px] text-muted">{stop.city}</span>
            </div>
            {i < STOPS.length - 1 ? (
              <div className="relative mx-1 mb-5 h-px w-8 overflow-hidden bg-sand sm:w-12 md:w-16">
                <span
                  className="absolute inset-y-0 left-0 w-1/2 bg-teal/70 flow-beam"
                  style={{ animationDelay: `${i * 0.4}s` }}
                />
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
