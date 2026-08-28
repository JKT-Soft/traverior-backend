import { Reveal } from "./motion/Reveal";
import { ReplanStrip } from "./motion/ReplanStrip";

export function LiveMode() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-20 md:py-28">
      <Reveal variant="scale">
        <div className="overflow-hidden rounded-[2rem] bg-night text-cream lg:grid lg:grid-cols-2">
          <div className="p-8 md:p-12">
            <p className="text-xs font-semibold tracking-[0.2em] text-teal uppercase">
              Live trip
            </p>
            <h2 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">
              Saat rencana berubah,{" "}
              <span className="font-serif italic text-teal">pipeline ikut bergerak.</span>
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-cream/70">
              Delay penerbangan, hujan di Osaka, event cancel. Traverior memantau
              cuaca dan jadwal, lalu mengusulkan re-plan — dengan menghormati
              node yang kamu kunci.
            </p>
            <ul className="mt-8 space-y-4 text-sm">
              {[
                "Push notification saat ada disruption",
                "Alternatif rute & indoor backup otomatis",
                "Lock policy: custom node tidak ditimpa AI",
                "Budget ikut dihitung ulang, bukan diabaikan",
              ].map((line, i) => (
                <li
                  key={line}
                  className="flex gap-3"
                  style={{ animationDelay: `${i * 0.12}s` }}
                >
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
          <ReplanStrip />
        </div>
      </Reveal>
    </section>
  );
}
