export type Money = {
  amount: number;
  currency: string;
  isEstimate: boolean;
};

export type ProviderMeta = {
  provider: string;
  providerRef?: string;
  fetchedAt: string;
  deepLinkUrl?: string;
};
