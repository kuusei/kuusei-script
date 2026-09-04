export type HumbleTpkd = {
  key_type?: string;
  steam_app_id?: number | null;
  "expiration_date|datetime"?: string;
};

export type ParsedGame = {
  id: string;
  title: string;
  image?: string;
  platforms?: string[];
  delivery_methods?: string[];
  developers?: string[];
  genres?: string[];
  tpkds?: HumbleTpkd[];
  "msrp|money"?: { amount?: number; currency?: string };
  user_rating?: { "steam_percent|decimal"?: number };
};

export type ParsedMonth = {
  sourceUrl: string;
  title: string;
  isActive: boolean;
  usesChoices: boolean;
  games: ParsedGame[];
};
