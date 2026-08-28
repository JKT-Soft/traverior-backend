import { Destinations } from "@/components/Destinations";
import { Features } from "@/components/Features";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/Hero";
import { HowItWorks } from "@/components/HowItWorks";
import { LiveMode } from "@/components/LiveMode";
import { Navbar } from "@/components/Navbar";
import { Problem } from "@/components/Problem";
import { Showcase } from "@/components/Showcase";
import { Waitlist } from "@/components/Waitlist";
import { RouteRibbon } from "@/components/motion/RouteRibbon";
import { ScrollProgress } from "@/components/motion/ScrollProgress";

export default function Home() {
  return (
    <>
      <ScrollProgress />
      <Navbar />
      <main>
        <Hero />
        <Destinations />
        <Problem />
        <RouteRibbon />
        <HowItWorks />
        <Features />
        <Showcase />
        <LiveMode />
        <Waitlist />
      </main>
      <Footer />
    </>
  );
}
