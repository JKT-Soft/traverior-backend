import { Reveal } from "./motion/Reveal";

const FEATURES = [
  {
    title: "Journey pipeline rekursif",
    body: "Setiap checkpoint bisa dipecah jadi sub-pipeline. Osaka bukan cuma pin di peta — itu hari, jam, dan biaya.",
  },
  {
    title: "Data live, bukan tebakan",
    body: "Flight, hotel, resto, rute, cuaca, event, dan visa dari provider nyata. Grounding rate dirancang di atas 95%.",
  },
  {
    title: "Budget per segmen",
    body: "Lihat subtotal Osaka, total trip, dan dampak kalau kamu ganti hotel. Tidak ada kejutan di hari terakhir.",
  },
  {
    title: "Edit, ganti, kunci, hapus",
    body: "AI usul, kamu yang putuskan. Node terkunci tidak diutak-atik saat re-plan otomatis.",
  },
  {
    title: "Today mode",
    body: "Saat traveling: satu aksi berikutnya. Navigasi, detail, dan alert cuaca tanpa menggulir seluruh itinerary.",
  },
  {
    title: "Checklist kontekstual",
    body: "Packing, visa, dan dokumen menyesuaikan rute. Bukan daftar generik yang sama untuk semua orang.",
  },
];

export function Features() {
  return (
    <section id="fitur" className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <Reveal className="max-w-xl">
          <p className="text-xs font-semibold tracking-[0.2em] text-teal-dark uppercase">
            Fitur
          </p>
          <h2 className="mt-3 text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            Semua yang biasanya terpisah,{" "}
            <span className="font-serif italic text-teal-dark">satu alur.</span>
          </h2>
        </Reveal>
        <Reveal variant="left" delay={120} className="max-w-sm">
          <p className="text-sm text-muted">
            Flutter di iOS & Android. Booking lewat deep-link ke provider — kamu
            tetap yang menekan tombol bayar.
          </p>
        </Reveal>
      </div>
      <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map((feature, i) => (
          <Reveal key={feature.title} variant="scale" delay={i * 90}>
            <article className="node-card h-full rounded-3xl border border-sand bg-cream p-6">
              <span className="inline-flex items-center gap-2 font-serif text-2xl italic text-teal">
                <span
                  className="seq-node h-2 w-2 rounded-full bg-teal"
                  style={{ animationDelay: `${i * 0.7}s` }}
                />
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-4 text-lg font-semibold text-ink">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{feature.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
