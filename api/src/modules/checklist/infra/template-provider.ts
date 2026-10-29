import type {
  ChecklistItem,
  ChecklistProvider,
  ChecklistQuery,
  ChecklistResult,
  TravelTip,
} from "../domain/ports.js";

export class TemplateChecklistProvider implements ChecklistProvider {
  readonly name = "internal";

  async generate(query: ChecklistQuery): Promise<ChecklistResult> {
    const tripItems: ChecklistItem[] = [
      { id: "passport", label: "Passport valid 6+ months", done: false, source: "template" },
      { id: "tickets", label: "Flight tickets printed / offline copy", done: false, source: "template" },
      { id: "insurance", label: "Travel insurance", done: false, source: "template" },
      { id: "adapter", label: `Power adapter for ${query.destination}`, done: false, source: "template" },
    ];
    const stopItems: ChecklistItem[] = [
      { id: "hotel", label: "Hotel confirmation", done: false, source: "template" },
    ];

    const visaItems = query.omitTripItems
      ? []
      : (query.visaDocuments ?? []).map((label, i) => ({
          id: `visa-${i}`,
          label,
          done: false,
          source: "visa" as const,
        }));

    return {
      contentType: "checklist",
      provider: "internal",
      items: [
        ...visaItems,
        ...(query.omitTripItems ? [] : tripItems),
        ...stopItems,
      ],
      tips: tipsForDestination(query.destination),
      fetchedAt: new Date().toISOString(),
    };
  }
}

function tipsForDestination(destination: string): TravelTip[] {
  const city = destination.trim() || "your destination";
  return [
    {
      id: "getting-around",
      category: "getting_around",
      title: "Getting around",
      body: `In ${city}, prioritize transit cards or ride-hailing for short hops. Save offline maps and pin your hotel before you leave Wi‑Fi.`,
    },
    {
      id: "money",
      category: "money",
      title: "Cash & payments",
      body: `Keep a small amount of local cash for markets and transit. Cards work in many spots, but smaller shops may be cash-only.`,
    },
    {
      id: "connectivity",
      category: "connectivity",
      title: "Stay connected",
      body: `Pick up an eSIM or local SIM on arrival, and download offline translations plus key booking confirmations.`,
    },
    {
      id: "etiquette",
      category: "etiquette",
      title: "Local etiquette",
      body: `Learn a few polite phrases, check temple or restaurant norms before visiting, and ask before photographing people.`,
    },
    {
      id: "safety",
      category: "safety",
      title: "Safety basics",
      body: `Share your live location with a companion, keep copies of ID offline, and note the nearest clinic or embassy contact.`,
    },
    {
      id: "packing",
      category: "packing",
      title: "Packing smart",
      body: `Pack layers for weather swings, a compact umbrella, comfortable walking shoes, and any medication in carry-on.`,
    },
  ];
}
