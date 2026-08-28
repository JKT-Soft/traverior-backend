import { Reveal } from "./motion/Reveal";

const STEPS = [
  {
    n: "01",
    title: "Ceritakan trip-mu",
    body: "Satu input. Destinasi, tanggal, budget, pace, preferensi makanan. Traverior mengerti konteks, bukan form 20 kolom.",
  },
  {
    n: "02",
    title: "AI menyusun pipeline",
    body: "LLM merakit journey dari data real-time: Duffel, hotel, Places, rute, cuaca, event, visa. Kamu lihat langkah tool-nya — bukan kotak hitam.",
  },
  {
    n: "03",
    title: "Travel in flow",
    body: "Mode Today menuntun langkah berikutnya. Cuaca berubah? Pipeline menyesuaikan. Mau ganti resto? Kunci, edit, atau hapus nodenya.",
  },
];

export function HowItWorks() {
  return (
    <section id="cara-kerja" className="bg-night text-cream">
      <div className="mx-auto max-w-6xl px-5 py-20 md:py-28">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.2em] text-teal uppercase">
            Cara kerja
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-medium tracking-tight sm:text-4xl">
            Dari kalimat jadi perjalanan yang{" "}
            <span className="font-serif italic text-teal">siap dijalani.</span>
          </h2>
        </Reveal>

        <Reveal variant="unfold" className="mt-16">
          <div className="relative">
            <div className="absolute top-5 right-[16%] left-[16%] hidden h-px bg-white/10 md:block">
              <span className="absolute inset-y-0 w-1/3 bg-teal flow-beam" />
              <span className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-teal shadow-[0_0_0_6px_rgba(13,148,136,0.25)] animate-along-x" />
            </div>
            <div className="absolute top-5 bottom-8 left-[11px] w-px bg-white/10 md:hidden">
              <span className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-teal animate-along-y" />
            </div>

            <div className="grid gap-10 md:grid-cols-3">
              {STEPS.map((step, i) => (
                <article key={step.n} className="relative pl-8 md:pl-0 md:text-center">
                  <div className="mb-4 flex md:justify-center">
                    <span
                      className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full border border-teal/40 bg-night text-sm font-bold text-teal"
                      style={{ animationDelay: `${i * 1.5}s` }}
                    >
                      <span
                        className="seq-node absolute inset-0 rounded-full bg-teal/20"
                        style={{ animationDelay: `${i * 1.5}s` }}
                      />
                      {step.n}
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-cream/70">{step.body}</p>
                </article>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
