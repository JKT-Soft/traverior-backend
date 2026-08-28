import Image from "next/image";

export function Footer() {
  return (
    <footer className="border-t border-sand bg-night text-cream">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Image
              src="/brand/mark.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9 rounded-full bg-cream object-contain p-0.5"
            />
            <span>
              <span className="block font-bold">Traverior</span>
              <span className="text-xs text-cream/60">Your journey, in flow.</span>
            </span>
          </div>
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-cream/65">
            AI tour & travel agent dengan journey pipeline rekursif. Dirancang
            untuk traveler yang ingin rencana yang hidup — bukan PDF yang kaku.
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-cream/45 uppercase">
            Produk
          </p>
          <ul className="mt-3 space-y-2 text-sm text-cream/80">
            <li>
              <a href="#fitur" className="hover:text-teal">
                Fitur
              </a>
            </li>
            <li>
              <a href="#cara-kerja" className="hover:text-teal">
                Cara kerja
              </a>
            </li>
            <li>
              <a href="#aplikasi" className="hover:text-teal">
                Aplikasi
              </a>
            </li>
            <li>
              <a href="#akses" className="hover:text-teal">
                Early access
              </a>
            </li>
          </ul>
        </div>
        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-cream/45 uppercase">
            Kontak
          </p>
          <ul className="mt-3 space-y-2 text-sm text-cream/80">
            <li>hello@traverior.com</li>
            <li>traverior.com</li>
            <li>iOS & Android · coming soon</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-5 text-xs text-cream/45 sm:flex-row sm:justify-between">
          <p>© {new Date().getFullYear()} Traverior. All rights reserved.</p>
          <p>Built for curious minds and restless feet.</p>
        </div>
      </div>
    </footer>
  );
}
