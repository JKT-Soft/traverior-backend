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

    const essentials: ChecklistItem[] = [
      { id: "passport", label: "Passport valid 6+ months", done: false, source: "template" },
      { id: "tickets", label: "Flight tickets printed / offline copy", done: false, source: "template" },
      { id: "hotel", label: "Hotel confirmation saved offline", done: false, source: "template" },
      { id: "insurance", label: "Travel insurance", done: false, source: "template" },
      { id: "adapter", label: `Power adapter for ${city}`, done: false, source: "template" },
    ];

    const local = localItemsFor(city, country);

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

function localItemsFor(city: string, countryCode?: string): ChecklistItem[] {
  const key = countryCode ?? inferCountryKey(city);
  const cityLabel = city;
  const common: ChecklistItem[] = [
    {
      id: "transit-card",
      label: transitCardLabel(cityLabel, key),
      done: false,
      source: "template",
    },
    {
      id: "local-sim",
      label: `eSIM / local SIM for ${cityLabel}`,
      done: false,
      source: "template",
    },
    {
      id: "offline-maps",
      label: `Offline maps for ${cityLabel}`,
      done: false,
      source: "template",
    },
    {
      id: "cash-float",
      label: `Small local cash float for ${cityLabel}`,
      done: false,
      source: "template",
    },
    {
      id: "meds",
      label: "Personal medication in carry-on",
      done: false,
      source: "template",
    },
  ];

  const extras: ChecklistItem[] = [];
  switch (key) {
    case "JP":
      extras.push(
        { id: "ic-card", label: "Suica / Pasmo (or welcome IC) topped up", done: false, source: "template" },
        { id: "cashless", label: "Confirm cashless options (many shops prefer IC / card)", done: false, source: "template" },
        { id: "shoes", label: "Easy-on shoes for temple / tatami rules", done: false, source: "template" },
        { id: "pocket-wifi", label: "Pocket Wi‑Fi or eSIM with Japan coverage", done: false, source: "template" },
      );
      break;
    case "KR":
      extras.push(
        { id: "tmoney", label: "T-money / Cashbee card for subway & buses", done: false, source: "template" },
        { id: "papago", label: "Papago / KakaoMap downloaded offline", done: false, source: "template" },
        { id: "outlet", label: "Type C/F adapter (Korea)", done: false, source: "template" },
      );
      break;
    case "TW":
      extras.push(
        { id: "easycard", label: "EasyCard / iPASS for MRT & buses", done: false, source: "template" },
        { id: "night-market", label: "Cash for night markets", done: false, source: "template" },
        { id: "rain", label: "Compact umbrella (frequent showers)", done: false, source: "template" },
      );
      break;
    case "TH":
      extras.push(
        { id: "grab", label: "Grab / Bolt app set up with payment", done: false, source: "template" },
        { id: "bkk-airport", label: "Airport rail / taxi plan from BKK/DMK", done: false, source: "template" },
        { id: "mosquito", label: "Mosquito repellent for evenings", done: false, source: "template" },
      );
      break;
    case "SG":
      extras.push(
        { id: "ezlink", label: "EZ-Link / SimplyGo set up", done: false, source: "template" },
        { id: "chewing", label: "No chewing gum / follow local rules", done: false, source: "template" },
      );
      break;
    case "ID":
      extras.push(
        { id: "gopay", label: "Gojek / Grab ready for rides", done: false, source: "template" },
        { id: "cash-idr", label: "IDR cash for small warungs", done: false, source: "template" },
      );
      break;
    default:
      extras.push(
        {
          id: "attractions",
          label: `Book timed-entry tickets for top sights in ${cityLabel}`,
          done: false,
          source: "template",
        },
        {
          id: "weather-pack",
          label: `Pack for ${cityLabel} weather (layers / rain)`,
          done: false,
          source: "template",
        },
      );
  }

  // De-dupe by id (transit-card vs ic-card etc. can coexist).
  const seen = new Set<string>();
  const merged: ChecklistItem[] = [];
  for (const item of [...common, ...extras]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

function transitCardLabel(city: string, country?: string): string {
  switch (country) {
    case "JP":
      return `Transit card plan for ${city} (Suica / Pasmo)`;
    case "KR":
      return `Transit card plan for ${city} (T-money)`;
    case "TW":
      return `Transit card plan for ${city} (EasyCard)`;
    case "SG":
      return `Transit card plan for ${city} (EZ-Link)`;
    default:
      return `Local transit / day-pass plan for ${city}`;
  }
}

function inferCountryKey(city: string): string | undefined {
  const key = city.toLowerCase().replace(/[^a-z]/g, "");
  const map: Record<string, string> = {
    tokyo: "JP",
    osaka: "JP",
    kyoto: "JP",
    nara: "JP",
    sapporo: "JP",
    fukuoka: "JP",
    okinawa: "JP",
    seoul: "KR",
    busan: "KR",
    jeju: "KR",
    taipei: "TW",
    taipe: "TW",
    kaohsiung: "TW",
    bangkok: "TH",
    chiangmai: "TH",
    phuket: "TH",
    singapore: "SG",
    jakarta: "ID",
    bali: "ID",
    denpasar: "ID",
    bandung: "ID",
    yogyakarta: "ID",
  };
  return map[key];
}

function tipsForDestination(destination: string, countryCode?: string): TravelTip[] {
  const city = destination.trim() || "your destination";
  const country = countryCode ?? inferCountryKey(city);
  const tips: TravelTip[] = [
    {
      id: "getting-around",
      category: "getting_around",
      title: "Getting around",
      body: gettingAroundTip(city, country),
    },
    {
      id: "money",
      category: "money",
      title: "Cash & payments",
      body: moneyTip(city, country),
    },
    {
      id: "connectivity",
      category: "connectivity",
      title: "Stay connected",
      body: `Pick up an eSIM or local SIM for ${city}, and download offline maps plus key booking confirmations before you leave Wi‑Fi.`,
    },
    {
      id: "etiquette",
      category: "etiquette",
      title: "Local etiquette",
      body: etiquetteTip(city, country),
    },
    {
      id: "safety",
      category: "safety",
      title: "Safety basics",
      body: `Share your live location with a companion, keep copies of ID offline, and note the nearest clinic or embassy contact while in ${city}.`,
    },
    {
      id: "packing",
      category: "packing",
      title: "Packing smart",
      body: packingTip(city, country),
    },
  ];
  return tips;
}

function gettingAroundTip(city: string, country?: string): string {
  switch (country) {
    case "JP":
      return `In ${city}, use IC cards on trains and buses. Google Maps / Yahoo! Transit work well — save your hotel pin and learn the nearest station exit.`;
    case "KR":
      return `In ${city}, subway + T-money is usually fastest. KakaoMap is strong for walking directions; keep your hotel address in Korean.`;
    case "TW":
      return `In ${city}, MRT with EasyCard covers most trips. YouBike is handy for short hops; watch peak-hour crowding.`;
    default:
      return `In ${city}, prioritize transit cards or ride-hailing for short hops. Save offline maps and pin your hotel before you leave Wi‑Fi.`;
  }
}

function moneyTip(city: string, country?: string): string {
  switch (country) {
    case "JP":
      return `Keep some yen cash — smaller restaurants and temples may not take cards. Convenience stores are reliable for ATMs.`;
    case "TW":
      return `Cards work widely in ${city}, but night markets and stalls are often cash-only. Withdraw TWD at bank ATMs.`;
    case "KR":
      return `Cards are widely accepted in ${city}; still keep a little KRW for markets and tips-free street food.`;
    default:
      return `Keep a small amount of local cash for markets and transit in ${city}. Cards work in many spots, but smaller shops may be cash-only.`;
  }
}

function etiquetteTip(city: string, country?: string): string {
  switch (country) {
    case "JP":
      return `In ${city}, keep voices low on trains, queue orderly, and check shoe / photo rules at temples and traditional inns.`;
    case "KR":
      return `In ${city}, remove shoes when required, be mindful of dining etiquette, and ask before photographing people.`;
    default:
      return `Learn a few polite phrases for ${city}, check temple or restaurant norms before visiting, and ask before photographing people.`;
  }
}

function packingTip(city: string, country?: string): string {
  switch (country) {
    case "JP":
      return `Pack layers, a compact umbrella, comfortable slip-on shoes, and any medication in carry-on for ${city}.`;
    case "TW":
    case "TH":
    case "SG":
    case "ID":
      return `Pack light breathable clothes, rain protection, mosquito care if needed, and medication in carry-on for ${city}.`;
    default:
      return `Pack layers for weather swings, a compact umbrella, comfortable walking shoes, and any medication in carry-on for ${city}.`;
  }
}
