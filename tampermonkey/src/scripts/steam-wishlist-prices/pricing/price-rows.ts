import type { CountryColumn } from "../config";
import type { UsdRates } from "./currency-rates";
import { toCny } from "./currency-rates";
import type { SteamDeal } from "./steam-prices";
import type { WishlistGame } from "../steam/steam-wishlist";
import type { ItadDeal, ItadLow } from "./itad-prices";

export type HistoryLow = ItadLow & { cny: number | null; atLow: boolean | null };

export const historyLowFor = (low: ItadLow | undefined, deal: SteamDeal | undefined, rates: UsdRates): HistoryLow | null =>
  low ? {
    ...low,
    cny: toCny(low.amount, low.currency, rates),
    // Historical currencies can differ after a regional currency change. Never use FX to judge a low.
    atLow: deal?.currency === low.currency ? deal.amount <= low.amount + 0.005 : null,
  } : null;

export type RegionPrice = {
  amount: number | null;
  currency: string | null;
  regular: number | null;
  cut: number;
  discountEndsAt: number | null;
  cny: number | null;
  bundle?: { amount: number; currency: string; cny: number | null; name: string };
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
  historyLow?: HistoryLow | null;
  itadNewLow?: boolean;
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
    ...(deal.bundle ? {
      bundle: {
        ...deal.bundle,
        cny: toCny(deal.bundle.amount, deal.bundle.currency, rates),
      },
    } : {}),
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
  historyLows: Map<number, ItadLow> = new Map(),
  itadDeals: Map<number, ItadDeal> = new Map(),
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
        historyLow: null,
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
    const low = historyLows.get(game.appid);
    const referenceDeal = low ? steamDeals.get(low.country)?.get(game.appid) : undefined;
    const itadDeal = itadDeals.get(game.appid);
    const currentDeal = itadDeal ? steamDeals.get(itadDeal.country)?.get(game.appid) : undefined;
    const belowRecordedLow = !!low && referenceDeal?.currency === low.currency &&
      referenceDeal.amount < low.amount;
    // An ITAD flag describes its own quote. A changed price or currency must not inherit it.
    const matchingNewLowQuote = itadDeal?.flag === "N" && currentDeal?.currency === itadDeal.currency &&
      Math.abs(currentDeal.amount - itadDeal.amount) < 0.005;
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
      historyLow: historyLowFor(low, referenceDeal, rates),
      itadNewLow: belowRecordedLow || matchingNewLowQuote,
    };
  });
};
