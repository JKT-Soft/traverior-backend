import type { VisaProvider, VisaQuery } from "../domain/ports.js";

export class VisaService {
  constructor(private readonly provider: VisaProvider) {}
  getRequirements(query: VisaQuery) {
    return this.provider.getRequirements(query);
  }
  get providerName() {
    return this.provider.name;
  }
}
