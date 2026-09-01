import type { VisaProvider, VisaQuery, VisaRequirement } from "../domain/ports.js";

/** Curated static fallback for MVP until Sherpa partner access is live */
export class StaticVisaProvider implements VisaProvider {
  readonly name = "static";

  async getRequirements(query: VisaQuery): Promise<VisaRequirement> {
    const idToJp =
      query.passportCountry.toUpperCase() === "ID" &&
      query.destinationCountry.toUpperCase() === "JP";

    return {
      provider: this.name,
      passportCountry: query.passportCountry.toUpperCase(),
      destinationCountry: query.destinationCountry.toUpperCase(),
      required: true,
      summary: idToJp
        ? "Indonesia passport holders typically need a visa / eVisa for Japan (verify before travel)."
        : "Check official requirements for this passport/destination pair.",
      documents: idToJp
        ? ["Passport 6+ months", "eVisa / visa", "Return ticket", "Hotel booking"]
        : ["Passport", "Visa if required", "Travel insurance (recommended)"],
      eVisaUrl: idToJp ? "https://www.mofa.go.jp/" : undefined,
      fetchedAt: new Date().toISOString(),
    };
  }
}
