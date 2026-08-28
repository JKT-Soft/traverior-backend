export function TodayScreen() {
  return (
    <div className="min-h-[520px] bg-slate-50 px-3.5 pb-4 pt-2">
      <p className="text-[10px] font-medium text-muted">Senin, 4 Okt · Osaka</p>
      <p className="mt-0.5 text-[15px] font-bold text-ink">Hari ini</p>

      <div
        className="relative mt-3 overflow-hidden rounded-2xl bg-cover bg-center p-3 text-white"
        style={{
          backgroundImage:
            "linear-gradient(180deg, rgba(12,31,28,.15), rgba(12,31,28,.72)), url(https://images.unsplash.com/photo-1578271887552-5ac3a72752bc?auto=format&fit=crop&w=600&q=70)",
        }}
      >
        <span className="inline-flex items-center gap-1 rounded-full bg-teal px-2 py-0.5 text-[8px] font-bold tracking-wide">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-white" />
          SELANJUTNYA
        </span>
        <p className="mt-6 text-[16px] font-bold leading-tight">Dotonbori dinner</p>
        <p className="mt-0.5 text-[10px] text-white/80">18:00 · Halal-friendly · ~¥2.000</p>
        <div className="mt-3 flex gap-1.5">
          <span className="rounded-lg bg-teal px-2.5 py-1 text-[9px] font-semibold">Navigasi</span>
          <span className="rounded-lg border border-white/40 px-2.5 py-1 text-[9px] font-semibold">
            Detail
          </span>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        {[
          { time: "09:00", title: "Osaka Castle", meta: "Selesai", done: true },
          { time: "14:00", title: "Kuromon Market", meta: "Jalan kaki · 12 mnt", done: true },
          { time: "18:00", title: "Dotonbori", meta: "Sekarang", done: false, active: true },
          { time: "21:00", title: "Hotel Granvia", meta: "Check-in reminder", done: false },
        ].map((item) => (
          <div key={item.time} className="flex items-center gap-2.5">
            <span className="w-8 text-[9px] font-semibold text-muted">{item.time}</span>
            <span
              className={`h-2 w-2 rounded-full ${
                item.done
                  ? "bg-teal"
                  : item.active
                    ? "pulse-dot bg-teal"
                    : "bg-slate-300"
              }`}
            />
            <div className="flex-1 rounded-xl border border-sand bg-white px-2.5 py-1.5">
              <p className="text-[11px] font-bold text-ink">{item.title}</p>
              <p className="text-[8px] text-muted">{item.meta}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5">
        <p className="text-[10px] font-bold text-amber-900">Cuaca · hujan sore</p>
        <p className="mt-0.5 text-[9px] text-amber-800/80">
          Pipeline Osaka disesuaikan. Indoor backup sudah siap.
        </p>
      </div>
    </div>
  );
}
