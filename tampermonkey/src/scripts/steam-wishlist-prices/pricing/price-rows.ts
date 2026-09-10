import type { CountryColumn } from "../config";
import type { UsdRates } from "./currency-rates";
import { toCny } from "./currency-rates";
import type { SteamDeal } from "./steam-prices";
import type { WishlistGame } from "../steam/steam-wishlist";

export type RegionPrice = {
  amount: number | null;
  currency: string | null;
  regular: number | null;
  cut: number;
  discountEndsAt: number | null;
  cny: number | null;
};

export type GameRow = {
  appid: number;
  title: string;
  capsule: string;
  releasedAt: number | null;
  free: boolean;
  comingSoon: boolean;
  delisted: boolean;
  prices: Record<string, RegionPrice>;
  cheapestCode: string | null;
  cheapestCny: number | null;
  vsCn: number | null;
};

const emptyPrice = (): RegionPrice => ({
  amount: null,
  currency: null,
  regular: null,
  cut: 0,
  discountEndsAt: null,
  cny: null,
});

const fromDeal = (deal: SteamDeal | undefined, rates: UsdRates): RegionPrice => {
  if (!deal) {
    return emptyPrice();
  }
  return {
    amount: deal.amount,
    currency: deal.currency,
    regular: deal.regular,
    cut: deal.cut,
    discountEndsAt: deal.cut > 0 ? deal.discountEndsAt ?? null : null,
    cny: toCny(deal.amount, deal.currency, rates),
  };
};

const blankPrices = (countries: CountryColumn[]) => {
  const prices: Record<string, RegionPrice> = {};
  for (const country of countries) {
    prices[country.code] = emptyPrice();
  }
  return prices;
};

export const buildGameRows = (
  games: WishlistGame[],
  steamDeals: Map<string, Map<number, SteamDeal>>,
  countries: CountryColumn[],
  rates: UsdRates,
): GameRow[] => {
  return games.map((game) => {
    if (game.delisted || game.comingSoon || game.free) {
      return {
        appid: game.appid,
        title: game.title,
        capsule: game.capsule,
        releasedAt: game.releasedAt,
        free: game.free,
        comingSoon: game.comingSoon,
        delisted: game.delisted,
        prices: blankPrices(countries),
        cheapestCode: null,
        cheapestCny: null,
        vsCn: null,
      };
    }
    const prices: Record<string, RegionPrice> = {};
    let cheapestCode: string | null = null;
    let cheapestCny: number | null = null;
    for (const country of countries) {
      const price = fromDeal(steamDeals.get(country.code)?.get(game.appid), rates);
      prices[country.code] = price;
      if (price.cny !== null && (cheapestCny === null || price.cny < cheapestCny)) {
        cheapestCode = country.code;
        cheapestCny = price.cny;
      }
    }
    const cn = prices.CN?.cny ?? null;
    const vsCn =
      cn !== null && cheapestCny !== null && cn > 0 ? (cn - cheapestCny) / cn : null;
    return {
      appid: game.appid,
      title: game.title,
      capsule: game.capsule,
      releasedAt: game.releasedAt,
      free: false,
      comingSoon: false,
      delisted: false,
      prices,
      cheapestCode,
      cheapestCny,
      vsCn,
    };
  });
};
