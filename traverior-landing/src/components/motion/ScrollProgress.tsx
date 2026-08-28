"use client";

import { useEffect, useState } from "react";

export function ScrollProgress() {
  const [p, setP] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setP(max > 0 ? window.scrollY / max : 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[90] h-[3px] bg-sand/70"
      aria-hidden
    >
      <div
        className="relative h-full bg-teal transition-[width] duration-150 ease-out"
        style={{ width: `${Math.min(p * 100, 100)}%` }}
      >
        <span className="absolute right-0 top-1/2 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-teal shadow-[0_0_0_3px_rgba(13,148,136,0.25)]" />
      </div>
    </div>
  );
}
