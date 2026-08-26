import type {
  ChecklistItem,
  ChecklistProvider,
  ChecklistQuery,
  ChecklistResult,
} from "../domain/ports.js";

export class TemplateChecklistProvider implements ChecklistProvider {
  readonly name = "internal";

  async generate(query: ChecklistQuery): Promise<ChecklistResult> {
    const base: ChecklistItem[] = [
      { id: "passport", label: "Passport valid 6+ months", done: false, source: "template" },
      { id: "tickets", label: "Flight tickets printed / offline copy", done: false, source: "template" },
      { id: "hotel", label: "Hotel confirmation", done: false, source: "template" },
      { id: "insurance", label: "Travel insurance", done: false, source: "template" },
      { id: "adapter", label: `Power adapter for ${query.destination}`, done: false, source: "template" },
    ];

    const visaItems = (query.visaDocuments ?? []).map((label, i) => ({
      id: `visa-${i}`,
      label,
      done: false,
      source: "visa" as const,
    }));

    return {
      contentType: "checklist",
      provider: "internal",
      items: [...visaItems, ...base],
      fetchedAt: new Date().toISOString(),
    };
  }
}
