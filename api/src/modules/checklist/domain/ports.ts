export type ChecklistQuery = {
  destination: string;
  passportCountry?: string;
  visaDocuments?: string[];
  /** Later stops in the same country skip passport, visa, insurance, and similar once-per-country items. */
  omitTripItems?: boolean;
};

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  source: "template" | "visa" | "user";
};

export type TravelTip = {
  id: string;
  category: "getting_around" | "money" | "connectivity" | "etiquette" | "safety" | "packing";
  title: string;
  body: string;
};

export type ChecklistResult = {
  contentType: "checklist";
  provider: "internal";
  items: ChecklistItem[];
  tips: TravelTip[];
  fetchedAt: string;
};

export interface ChecklistProvider {
  readonly name: string;
  generate(query: ChecklistQuery): Promise<ChecklistResult>;
}
