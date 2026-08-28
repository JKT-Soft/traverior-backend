const PATH =
  "M -20 210 C 80 40, 220 320, 360 140 S 560 40, 640 180";

export function FlowPath() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full overflow-visible opacity-70"
      viewBox="0 0 640 360"
      fill="none"
      aria-hidden
    >
      <path d={PATH} stroke="#d7cfc0" strokeWidth="1.5" />
      <path
        className="route-dash"
        d={PATH}
        stroke="#0d9488"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle
        r="5"
        fill="#0d9488"
        className="traveler"
        style={{ offsetPath: `path('${PATH}')` }}
      />
      <circle cx="360" cy="140" r="4" fill="#0d9488" className="seq-node" />
      <circle
        cx="80"
        cy="90"
        r="3.5"
        fill="#0d9488"
        className="seq-node"
        style={{ animationDelay: "1.2s" }}
      />
      <circle
        cx="560"
        cy="70"
        r="3.5"
        fill="#0d9488"
        className="seq-node"
        style={{ animationDelay: "2.4s" }}
      />
    </svg>
  );
}
