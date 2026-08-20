export type ChoiceGame = {
  id: string;
  title: string;
  image: string | null;
  platforms: string[];
  deliveryMethods: string[];
  steamAppIds: number[];
  developers: string[];
  genres: string[];
  msrpUsd: number | null;
  ratingPercent: number | null;
  expiresAt: string | null;
  isExtra: boolean;
};

export type ChoiceMonth = {
  id: string;
  slug: string;
  title: string;
  url: string;
  isActive: boolean;
  usesChoices: boolean;
  scrapedAt: string;
  games: ChoiceGame[];
};

export type ChoiceCatalog = {
  generatedAt: string;
  source: "humblebundle.com";
  months: ChoiceMonth[];
  backfillExhausted?: boolean;
};
