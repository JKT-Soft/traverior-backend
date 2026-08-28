export function HomeScreen() {
  return (
    <div className="min-h-[520px] bg-slate-50 px-3.5 pb-4 pt-2">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-teal/15 text-[11px] font-bold text-teal-dark">
          T
        </span>
        <div>
          <p className="text-[13px] font-bold leading-none text-ink">Traverior</p>
          <p className="mt-0.5 text-[9px] text-muted">Perjalanan tanpa pusing</p>
        </div>
      </div>

      <div className="rounded-2xl border border-sand bg-white p-3 shadow-sm">
        <div className="min-h-[72px] rounded-xl border border-dashed border-teal/30 bg-teal/[0.04] px-2.5 py-2">
          <p className="text-[10px] leading-relaxed text-muted">
            12 hari Jepang–Taiwan, budget 28jt, pace santai, halal-friendly
            <span className="caret" />
          </p>
        </div>
        <button
          type="button"
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal py-2 text-[11px] font-semibold text-white"
        >
          <Sparkle />
          Rencanakan dengan AI
        </button>
      </div>

      <p className="mb-1.5 mt-4 text-[11px] font-bold text-ink">Trip aktif</p>
      <div className="flex gap-2.5 rounded-2xl border border-sand bg-white p-2.5">
        <div
          className="h-14 w-14 shrink-0 rounded-xl bg-cover bg-center"
          style={{
            backgroundImage:
              "url(https://images.unsplash.com/photo-1490806843957-31f4d9a5b1c7?auto=format&fit=crop&w=200&q=70)",
          }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[12px] font-bold text-ink">Asia Timur 2026</p>
            <span className="rounded-full bg-teal/15 px-1.5 py-0.5 text-[8px] font-semibold text-teal-dark">
              Day 4
            </span>
          </div>
          <p className="mt-0.5 text-[9px] text-muted">1–12 Okt · IDR 28.450.000</p>
          <p className="mt-1 text-[10px] font-semibold text-teal-dark">Lanjutkan journey →</p>
        </div>
      </div>

      <p className="mb-1.5 mt-4 text-[11px] font-bold text-ink">Inspirasi cepat</p>
      <div className="grid grid-cols-3 gap-1.5">
        {["Weekend", "Bulan madu", "Solo"].map((item) => (
          <div
            key={item}
            className="rounded-xl border border-sand bg-white py-2.5 text-center text-[9px] font-medium text-ink"
          >
            {item}
          </div>
        ))}
      </div>

      <nav className="mt-4 grid grid-cols-4 rounded-2xl bg-white px-1 py-2 text-center text-[8px] font-medium text-muted shadow-sm">
        {["Home", "Journey", "Today", "Profil"].map((tab, i) => (
          <span key={tab} className={i === 0 ? "font-semibold text-teal-dark" : ""}>
            {tab}
          </span>
        ))}
      </nav>
    </div>
  );
}

function Sparkle() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3l1.2 5.3L18 9.5l-4.8 1.2L12 16l-1.2-5.3L6 9.5l4.8-1.2L12 3z"
        fill="currentColor"
      />
    </svg>
  );
}
