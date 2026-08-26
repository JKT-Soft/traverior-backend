import type { Env } from "../../../config/env.js";
import type { VisaProvider, VisaQuery, VisaRequirement } from "../domain/ports.js";
import { StaticVisaProvider } from "./static-provider.js";

export class SherpaVisaProvider implements VisaProvider {
  readonly name = "sherpa";
  constructor(private readonly apiKey: string) {}

  async getRequirements(query: VisaQuery): Promise<VisaRequirement> {
    // Partner endpoint differs by contract; keep port stable and fail clearly until wired.
    void this.apiKey;
    void query;
    throw new Error(
      "Sherpa adapter not fully wired yet — set PROVIDER_VISA=static for MVP or implement partner endpoint.",
    );
  }
}

export function createVisaProvider(env: Env): VisaProvider {
  switch (env.providers.visa) {
    case "sherpa": {
      const key = env.secrets.sherpaApiKey;
      if (!key) throw new Error("SHERPA_API_KEY required for PROVIDER_VISA=sherpa");
      return new SherpaVisaProvider(key);
    }
    case "static":
      return new StaticVisaProvider();
    default:
      throw new Error(`Unknown PROVIDER_VISA: ${env.providers.visa}`);
  }
}
