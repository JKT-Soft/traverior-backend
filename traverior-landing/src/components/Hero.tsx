import { FlowPath } from "./motion/FlowPath";
import { PhoneFrame } from "./PhoneFrame";
import { HomeScreen } from "./phones/HomeScreen";
import { PipelineScreen } from "./phones/PipelineScreen";
import { TodayScreen } from "./phones/TodayScreen";

export function Hero() {
  return (
    <section id="atas" className="relative overflow-hidden pt-28 pb-16 md:pt-36 md:pb-24">
      <div className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-teal/20 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-40 h-80 w-80 rounded-full bg-amber-200/40 blur-3xl" />
      <div className="pointer-events-none absolute right-[-8%] top-8 hidden h-[420px] w-[55%] lg:block">
        <FlowPath />
      </div>

      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="hero-copy relative z-10">
          <p className="inline-flex items-center gap-2 rounded-full border border-sand bg-cream px-3 py-1 text-xs font-semibold tracking-wide text-teal-dark uppercase">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-teal" />
            AI tour & travel agent
          </p>
          <h1 className="mt-5 max-w-xl text-5xl font-medium leading-[1.05] tracking-tight text-ink sm:text-6xl lg:text-[4.35rem]">
            Your journey,{" "}
            <em className="font-serif italic flow-text">in flow.</em>
          </h1>
          <p className="mt-5 max-w-lg text-lg leading-relaxed text-muted">
            Traverior mengubah riset manual jadi{" "}
            <strong className="font-semibold text-ink">journey pipeline</strong>{" "}
            terstruktur — flight, hotel, makan, transport, budget, dan live trip
            dalam satu alur. Dari persiapan sampai pulang.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a
              href="#akses"
              className="relative overflow-hidden rounded-full bg-teal px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-teal/25 transition hover:bg-teal-dark"
            >
              <span className="pointer-events-none absolute inset-0 shimmer-cta" />
              Dapatkan early access
            </a>
            <a
              href="#cara-kerja"
              className="rounded-full border border-ink/10 bg-cream px-6 py-3 text-sm font-semibold text-ink transition hover:border-ink/20 hover:translate-x-0.5"
            >
              Lihat cara kerja →
            </a>
          </div>
          <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-sand pt-6">
            {[
              { k: "< 60 dtk", v: "Itinerary pertama" },
              { k: "Real-time", v: "Flight, hotel, cuaca" },
              { k: "Kamu kendali", v: "Edit, ganti, kunci" },
            ].map((item) => (
              <div key={item.v}>
                <dt className="text-sm font-bold text-ink">{item.k}</dt>
                <dd className="mt-0.5 text-xs text-muted">{item.v}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="relative mx-auto h-[560px] w-full max-w-[540px]">
          <div className="hero-phone-left absolute left-0 top-10 hidden scale-90 lg:block">
            <PhoneFrame>
              <HomeScreen />
            </PhoneFrame>
          </div>
          <div className="hero-phone-right absolute right-0 top-16 hidden scale-90 lg:block">
            <PhoneFrame>
              <TodayScreen />
            </PhoneFrame>
          </div>
          <div className="hero-phone-center absolute left-1/2 top-0 z-10">
            <PhoneFrame>
              <PipelineScreen />
            </PhoneFrame>
          </div>
        </div>
      </div>
    </section>
  );
}
