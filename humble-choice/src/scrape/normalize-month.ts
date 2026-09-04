import {
  membershipUrlFromSlug,
  monthIdFromSlug,
  type MonthSlug,
} from "../calendar/choice-month";
import type { ParsedGame, ParsedMonth } from "../parsers/types";
import type { ChoiceGame, ChoiceMonth } from "../types/catalog";

const uniqueNumbers = (values: Array<number | null | undefined>) =>
  [...new Set(values.filter((value): value is number => Number.isFinite(value)))]
    .sort((left, right) => left - right);

const uniqueStrings = (values: Array<string | undefined>) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];

const isExtraGame = (game: ParsedGame, steamAppIds: number[]) => {
  if (/ign\s*plus/i.test(game.title) || /coupon/i.test(game.id)) {
    return true;
  }
  return steamAppIds.length === 0 && !(game.delivery_methods ?? []).includes("steam");
};

const normalizeGame = (game: ParsedGame): ChoiceGame => {
  const steamAppIds = uniqueNumbers(
    (game.tpkds ?? []).map((item) => item.steam_app_id),
  );
  const expiresAt =
    (game.tpkds ?? []).find((item) => item["expiration_date|datetime"])?.[
      "expiration_date|datetime"
    ] ?? null;

  return {
    id: game.id,
    title: game.title,
    image: game.image?.trim() || null,
    platforms: uniqueStrings(game.platforms ?? []),
    deliveryMethods: uniqueStrings(game.delivery_methods ?? []),
    steamAppIds,
    developers: uniqueStrings(game.developers ?? []),
    genres: uniqueStrings(game.genres ?? []),
    msrpUsd: game["msrp|money"]?.amount ?? null,
    ratingPercent: game.user_rating?.["steam_percent|decimal"] ?? null,
    expiresAt,
    isExtra: isExtraGame(game, steamAppIds),
  };
};

export const normalizeMonth = (
  slug: MonthSlug,
  page: ParsedMonth,
  scrapedAt = new Date().toISOString(),
): ChoiceMonth | null => {
  const games = page.games.map(normalizeGame);
  if (games.length === 0) {
    return null;
  }
  return {
    id: monthIdFromSlug(slug),
    slug,
    title: page.title || slug.replace("-", " "),
    url: page.sourceUrl || membershipUrlFromSlug(slug),
    isActive: page.isActive,
    usesChoices: page.usesChoices,
    scrapedAt,
    games,
  };
};
