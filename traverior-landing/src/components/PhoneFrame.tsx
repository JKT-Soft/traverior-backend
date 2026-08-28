import type { ReactNode } from "react";

export function PhoneFrame({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`relative w-[270px] shrink-0 rounded-[2.4rem] bg-night p-[7px] phone-shadow ${className}`}
    >
      <div className="absolute left-1/2 top-2 z-20 h-[18px] w-[88px] -translate-x-1/2 rounded-full bg-night" />
      <div className="relative overflow-hidden rounded-[1.95rem] bg-white">
        <div className="flex h-[7px] items-end justify-between px-5 pt-2 text-[9px] font-semibold text-slate-500">
          <span>9:41</span>
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-3.5 rounded-[1px] bg-slate-400" />
            <span className="h-2 w-1 rounded-[1px] bg-slate-400" />
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}
