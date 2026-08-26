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

export type ChecklistResult = {
  contentType: "checklist";
  provider: "internal";
  items: ChecklistItem[];
  fetchedAt: string;
};

export interface ChecklistProvider {
  readonly name: string;
  generate(query: ChecklistQuery): Promise<ChecklistResult>;
}
