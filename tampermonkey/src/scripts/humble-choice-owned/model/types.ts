export type ChoiceMonthHit = {
  label: string;
  url: string;
};

export type ChoiceHit = {
  title: string;
  months: ChoiceMonthHit[];
};

export type ChoiceCatalog = {
  generatedAt?: string;
  months: Array<{
    id: string;
    slug: string;
    title?: string;
    url?: string;
    games: Array<{
      title: string;
      steamAppIds?: number[];
      isExtra?: boolean;
    }>;
  }>;
};
