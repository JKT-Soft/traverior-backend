import { PhoneFrame } from "./PhoneFrame";
import { Reveal } from "./motion/Reveal";
import { HomeScreen } from "./phones/HomeScreen";
import { PipelineScreen } from "./phones/PipelineScreen";
import { TodayScreen } from "./phones/TodayScreen";

const SCREENS = [
  {
    title: "Mulai dalam satu kalimat",
    body: "Home dirancang zero-friction: ceritakan trip impian, tekan rencanakan. Trip aktif dan inspirasi cepat selalu di depan mata.",
    screen: <HomeScreen />,
    copy: "left" as const,
    phone: "right" as const,
  },
  {
    title: "Lihat seluruh journey",
    body: "Spine vertikal: origin, transit, stay, return. Progress, budget, dan nested checkpoint tanpa kehilangan konteks.",
    screen: <PipelineScreen />,
    copy: "right" as const,
    phone: "left" as const,
  },
  {
    title: "Hidup di hari ini",
    body: "Today mode action-first. Yang berikutnya, timeline hari ini, dan alert cuaca yang bisa memicu re-plan.",
    screen: <TodayScreen />,
    copy: "left" as const,
    phone: "right" as const,
  },
];

export function Showcase() {
  return (
    <section id="aplikasi" className="border-y border-sand bg-cream/50 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-5">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.2em] text-teal-dark uppercase">
            Aplikasi
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-medium tracking-tight text-ink sm:text-4xl">
            Satu layar, satu tujuan.{" "}
            <span className="font-serif italic text-teal-dark">
              Detail muncul saat dibutuhkan.
            </span>
          </h2>
        </Reveal>
        <div className="mt-14 space-y-20">
          {SCREENS.map((item, i) => (
            <article
              key={item.title}
              className={`grid items-center gap-10 lg:grid-cols-2 ${
                i % 2 === 1 ? "lg:[&>*:first-child]:order-2" : ""
              }`}
            >
              <Reveal variant={item.copy}>
                <p className="font-serif text-4xl italic text-teal/50">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="mt-3 text-2xl font-semibold text-ink">{item.title}</h3>
                <p className="mt-3 max-w-md text-muted">{item.body}</p>
              </Reveal>
              <Reveal variant={item.phone} delay={140}>
                <div className="flex justify-center">
                  <div className="phone-tilt">
                    <PhoneFrame>{item.screen}</PhoneFrame>
                  </div>
                </div>
              </Reveal>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
