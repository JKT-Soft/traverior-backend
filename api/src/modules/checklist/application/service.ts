import type { ChecklistProvider, ChecklistQuery } from "../domain/ports.js";

export class ChecklistService {
  constructor(private readonly provider: ChecklistProvider) {}
  generate(query: ChecklistQuery) {
    return this.provider.generate(query);
  }
  get providerName() {
    return this.provider.name;
  }
}
