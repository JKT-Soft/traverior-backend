import type { Metadata } from "next";
import { Instrument_Serif, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  display: "swap",
});

const instrument = Instrument_Serif({
  variable: "--font-instrument",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Traverior — Your journey, in flow.",
    template: "%s · Traverior",
  },
  description:
    "Asisten perjalanan AI end-to-end. Satu journey pipeline untuk flight, hotel, itinerary, budget, dan live trip — dari persiapan sampai pulang.",
  keywords: [
    "Traverior",
    "AI travel agent",
    "itinerary planner",
    "journey pipeline",
    "travel app",
  ],
  openGraph: {
    title: "Traverior — Your journey, in flow.",
    description:
      "Bukan sekadar chatbot travel. Traverior adalah journey orchestrator yang menyusun trip-mu jadi pipeline terstruktur.",
    url: "https://traverior.com",
    siteName: "Traverior",
    locale: "id_ID",
    type: "website",
  },
  metadataBase: new URL("https://traverior.com"),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="id"
      className={`${plusJakarta.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-paper font-sans text-ink">
        <div className="grain" aria-hidden />
        {children}
      </body>
    </html>
  );
}
