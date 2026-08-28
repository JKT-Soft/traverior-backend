const CITIES = [
  "Jakarta",
  "Shanghai",
  "Osaka",
  "Kyoto",
  "Tokyo",
  "Taipei",
  "Seoul",
  "Bangkok",
  "Singapore",
  "Bali",
];

function Row({ reverse = false }: { reverse?: boolean }) {
  const row = [...CITIES, ...CITIES];
  return (
    <div className="overflow-hidden">
      <div
        className={`${reverse ? "animate-marquee-reverse" : "animate-marquee"} flex w-max gap-10 pr-10`}
      >
        {row.map((city, i) => (
          <span
            key={`${city}-${i}`}
            className="flex items-center gap-10 text-sm font-semibold tracking-[0.18em] text-ink/70 uppercase"
          >
            {city}
            <span className="h-1 w-1 rounded-full bg-teal" />
          </span>
        ))}
      </div>
    </div>
  );
}

export function Destinations() {
  return (
    <section className="border-y border-sand bg-cream/70 py-3" aria-hidden>
      <Row />
      <div className="mt-2 opacity-50">
        <Row reverse />
      </div>
    </section>
  );
}
