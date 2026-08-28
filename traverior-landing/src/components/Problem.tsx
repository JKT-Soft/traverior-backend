import { Reveal } from "./motion/Reveal";

const PAINS = [
  {
    title: "Riset terfragmentasi",
    problem: "Flight, hotel, makan, dan transport dicari di lima tab berbeda.",
    solution: "Satu pipeline terpadu per checkpoint. Semua node punya waktu, jarak, dan biaya.",
  },
  {
    title: "Urutan destinasi kacau",
    problem: "Itinerary cantik di kertas, kacau di lapangan.",
    solution: "AI menyusun urutan optimal plus waktu tempuh realtime antar kota.",
  },
  {
    title: "Budget gelap",
    problem: "Total trip baru kelihatan setelah checkout.",
    solution: "Rincian biaya per segmen, roll-up ke total trip, transparan dari awal.",
  },
  {
    title: "Trip berubah mendadak",
    problem: "Delay, hujan, cancel — rencana lama langsung usang.",
    solution: "Pipeline auto-update. Node yang kamu kunci tetap aman.",
  },
];

export function Problem() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Reveal>
        <p className="text-xs font-semibold tracking-[0.2em] text-teal-dark uppercase">
          Kenapa Traverior
        </p>
        <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
          Bukan chatbot travel.{" "}
          <span className="font-serif italic text-teal-dark">Journey orchestrator.</span>
        </h2>
        <p className="mt-4 max-w-2xl text-muted">
          Stateful, rekursif, dan bisa kamu edit. Nested pipeline di setiap
          checkpoint — progressive disclosure, satu layar satu tujuan.
        </p>
      </Reveal>
      <div className="mt-12 grid gap-4 md:grid-cols-2">
        {PAINS.map((item, i) => (
          <Reveal
            key={item.title}
            variant={i % 2 === 0 ? "left" : "right"}
            delay={i * 80}
          >
            <article className="group node-card rounded-3xl border border-sand bg-cream p-6">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-sand transition group-hover:bg-teal" />
                <h3 className="text-lg font-semibold text-ink">{item.title}</h3>
              </div>
              <p className="mt-2 text-sm text-muted">{item.problem}</p>
              <p className="mt-3 text-[11px] font-semibold tracking-wide text-teal-dark uppercase">
                Buka checkpoint →
              </p>
              <div className="solution-row">
                <p className="overflow-hidden">
                  <span className="mt-3 block border-t border-sand pt-4 text-sm font-medium text-teal-dark">
                    {item.solution}
                  </span>
                </p>
              </div>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
