export type ChecklistQuery = {
  destination: string;
  passportCountry?: string;
  visaDocuments?: string[];
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
