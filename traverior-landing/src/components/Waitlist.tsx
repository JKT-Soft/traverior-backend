"use client";

import { FormEvent, useState } from "react";
import { Reveal } from "./motion/Reveal";

export function Waitlist() {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email.trim()) return;
    setDone(true);
  }

  return (
    <section id="akses" className="mx-auto max-w-6xl px-5 pb-20 md:pb-28">
      <Reveal variant="unfold">
        <div className="relative overflow-hidden rounded-[2rem] border border-sand bg-cream px-6 py-14 text-center md:px-16">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-teal/15 blur-3xl" />
          <p className="text-xs font-semibold tracking-[0.2em] text-teal-dark uppercase">
            Early access
          </p>
          <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-medium tracking-tight text-ink sm:text-5xl">
            Siap traveling tanpa{" "}
            <span className="font-serif italic flow-text">dua puluh tab browser?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted">
            Traverior sedang dibuka bertahap untuk iOS & Android. Masuk waitlist
            — kami kabari saat undangan early access siap.
          </p>

          {done ? (
            <p className="mx-auto mt-8 flex max-w-md items-start gap-3 rounded-2xl bg-teal/10 px-5 py-4 text-left text-sm font-medium text-teal-dark">
              <svg className="mt-0.5 h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M8 12.5l2.4 2.4L16 9.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="animate-check"
                />
              </svg>
              <span>
                Checkpoint terbuka. Kamu sudah di antrean Traverior — kami tulis ke{" "}
                <span className="font-semibold">{email}</span> saat akses dibuka.
              </span>
            </p>
          ) : (
            <form
              onSubmit={onSubmit}
              className="mx-auto mt-8 flex max-w-lg flex-col gap-3 sm:flex-row"
            >
              <label className="sr-only" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email@kamu.com"
                className="h-12 flex-1 rounded-full border border-sand bg-white px-5 text-sm text-ink outline-none ring-teal/30 placeholder:text-muted transition focus:ring-2"
              />
              <button
                type="submit"
                className="relative h-12 overflow-hidden rounded-full bg-teal px-6 text-sm font-semibold text-white transition hover:bg-teal-dark"
              >
                <span className="pointer-events-none absolute inset-0 shimmer-cta" />
                Gabung waitlist
              </button>
            </form>
          )}
          <p className="mt-4 text-xs text-muted">Tanpa spam. Hanya undangan peluncuran.</p>
        </div>
      </Reveal>
    </section>
  );
}
