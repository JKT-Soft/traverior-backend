"use client";

import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const LINKS = [
  { href: "#fitur", label: "Fitur" },
  { href: "#cara-kerja", label: "Cara kerja" },
  { href: "#aplikasi", label: "Aplikasi" },
  { href: "#akses", label: "Early access" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState("");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const ids = LINKS.map((l) => l.href.slice(1));
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(entry.target.id);
        });
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: 0 },
    );
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-40 transition-all duration-300 ${
        scrolled || open
          ? "border-b border-sand/80 bg-paper/85 backdrop-blur-xl"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between px-5">
        <a href="#atas" aria-label="Traverior">
          <Logo />
        </a>
        <nav className="hidden items-center gap-7 text-sm font-medium text-muted md:flex">
          {LINKS.map((link) => {
            const on = active === link.href.slice(1);
            return (
              <a
                key={link.href}
                href={link.href}
                className={`relative py-1 transition ${on ? "text-ink" : "hover:text-ink"}`}
              >
                {link.label}
                <span
                  className={`absolute inset-x-0 -bottom-0.5 mx-auto h-px bg-teal transition-all duration-500 ${
                    on ? "w-full opacity-100" : "w-0 opacity-0"
                  }`}
                />
              </a>
            );
          })}
        </nav>
        <a
          href="#akses"
          className="relative hidden overflow-hidden rounded-full bg-teal px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-dark md:inline-flex"
        >
          <span className="pointer-events-none absolute inset-0 shimmer-cta" />
          Daftar waitlist
        </a>
        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-sand bg-cream md:hidden"
          aria-label={open ? "Tutup menu" : "Buka menu"}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="sr-only">Menu</span>
          <span className="flex flex-col gap-1.5">
            <span className={`h-px w-4 bg-ink transition duration-300 ${open ? "translate-y-[3.5px] rotate-45" : ""}`} />
            <span className={`h-px w-4 bg-ink transition duration-300 ${open ? "-translate-y-[3.5px] -rotate-45" : ""}`} />
          </span>
        </button>
      </div>
      {open ? (
        <nav className="border-t border-sand bg-paper px-5 py-4 md:hidden">
          <div className="flex flex-col gap-3 text-sm font-medium">
            {LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-xl px-2 py-2 hover:bg-sand/60"
              >
                {link.label}
              </a>
            ))}
            <a
              href="#akses"
              onClick={() => setOpen(false)}
              className="rounded-full bg-teal px-4 py-2.5 text-center font-semibold text-white"
            >
              Daftar waitlist
            </a>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
