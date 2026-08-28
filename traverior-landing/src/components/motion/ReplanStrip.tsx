const NODES = [
  { label: "KIX → Hotel", state: "done" as const },
  { label: "Walking tour outdoor", state: "swap-out" as const },
  { label: "TeamLab indoor backup", state: "swap-in" as const },
  { label: "Dotonbori dinner", state: "next" as const },
];

export function ReplanStrip() {
  return (
    <div className="relative flex h-full min-h-[280px] flex-col justify-end bg-cover bg-center p-8"
      style={{
        backgroundImage:
          "linear-gradient(90deg, #0c1f1c 0%, rgba(12,31,28,.55) 40%, transparent 70%), url(https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?auto=format&fit=crop&w=1400&q=80)",
      }}
    >
      <p className="mb-3 text-[10px] font-semibold tracking-[0.2em] text-teal uppercase">
        Re-plan live · Osaka
      </p>
      <ol className="max-w-xs space-y-0 rounded-2xl border border-white/10 bg-night/70 p-4 backdrop-blur-md">
        {NODES.map((node) => (
          <li
            key={node.label}
            className={`flex items-center gap-3 text-sm ${
              node.state === "swap-out" ? "replan-out" : node.state === "swap-in" ? "replan-in" : ""
            }`}
          >
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                node.state === "done"
                  ? "bg-teal"
                  : node.state === "next"
                    ? "pulse-dot bg-white"
                    : node.state === "swap-out"
                      ? "bg-amber-400"
                      : "bg-teal"
              }`}
            />
            <span
              className={
                node.state === "swap-out"
                  ? "text-amber-200 line-through decoration-amber-400/80"
                  : "text-cream"
              }
            >
              {node.label}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
