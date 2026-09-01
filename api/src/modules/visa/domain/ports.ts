export type VisaQuery = {
  passportCountry: string;
  destinationCountry: string;
  travelDate?: string;
};

export type VisaRequirement = {
  provider: string;
  passportCountry: string;
  destinationCountry: string;
  required: boolean;
  summary: string;
  documents: string[];
  eVisaUrl?: string;
  fetchedAt: string;
};

export interface VisaProvider {
  readonly name: string;
  getRequirements(query: VisaQuery): Promise<VisaRequirement>;
}
