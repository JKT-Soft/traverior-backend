import Image from "next/image";

export function Logo({
  withWordmark = true,
  className = "",
}: {
  withWordmark?: boolean;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <Image
        src="/brand/mark.png"
        alt=""
        width={40}
        height={40}
        className="h-10 w-10 rounded-xl bg-cream object-cover"
        priority
      />
      {withWordmark ? (
        <span className="leading-none">
          <span className="block text-[1.15rem] font-bold tracking-tight text-ink">
            Traverior
          </span>
          <span className="mt-0.5 hidden text-[10px] font-medium tracking-[0.14em] text-muted uppercase sm:block">
            Your journey, in flow.
          </span>
        </span>
      ) : null}
    </span>
  );
}
