import {
  monthIdFromSlug,
  type MonthSlug,
} from "../calendar/choice-month";
import type { ChoiceGame, ChoiceMonth } from "../types/catalog";
import type { HumbleGameData, HumbleMonthlyPayload } from "./fetch-choice-month";

const uniqueNumbers = (values: Array<number | null | undefined>) =>
  [...new Set(values.filter((value): value is number => Number.isFinite(value)))]
    .sort((left, right) => left - right);

const uniqueStrings = (values: Array<string | undefined>) =>
  [...new Set(values.map((value) => value?.trim()).filter(Boolean))] as string[];

const isExtraGame = (id: string, game: HumbleGameData, steamAppIds: number[]) => {
  const title = game.title ?? "";
  if (/ign\s*plus/i.test(title) || /coupon/i.test(id)) {
    return true;
  }
  const methods = game.delivery_methods ?? [];
  return steamAppIds.length === 0 && !methods.includes("steam");
};

const normalizeGame = (id: string, game: HumbleGameData): ChoiceGame | null => {
  const title = game.title?.trim();
  if (!title) {
    return null;
  }

  const steamAppIds = uniqueNumbers(
    (game.tpkds ?? []).map((item) => item.steam_app_id),
  );
  const expiresAt =
    (game.tpkds ?? []).find((item) => item["expiration_date|datetime"])?.[
      "expiration_date|datetime"
    ] ?? null;

  return {
    id,
    title,
    image: game.image?.trim() || null,
    platforms: uniqueStrings(game.platforms ?? []),
    deliveryMethods: uniqueStrings(game.delivery_methods ?? []),
    steamAppIds,
    developers: uniqueStrings(game.developers ?? []),
    genres: uniqueStrings(game.genres ?? []),
    msrpUsd: game["msrp|money"]?.amount ?? null,
    ratingPercent: game.user_rating?.["steam_percent|decimal"] ?? null,
    expiresAt,
    isExtra: isExtraGame(id, game, steamAppIds),
  };
};

export const normalizeChoiceMonth = (
  slug: MonthSlug,
  payload: HumbleMonthlyPayload,
  scrapedAt = new Date().toISOString(),
): ChoiceMonth | null => {
  const options = payload.contentChoiceOptions;
  const gameData = options?.contentChoiceData?.game_data;
  if (!options || !gameData) {
    return null;
  }

  const order = options.contentChoiceData?.display_order ?? Object.keys(gameData);
  const games = order
    .map((id) => (gameData[id] ? normalizeGame(id, gameData[id]) : null))
    .filter((game): game is ChoiceGame => game !== null);

  if (games.length === 0) {
    return null;
  }

  return {
    id: monthIdFromSlug(slug),
    slug,
    title: options.title?.trim() || slug.replace("-", " "),
    url: `https://www.humblebundle.com/membership/${slug}`,
    isActive: Boolean(options.isActiveContent),
    usesChoices: Boolean(options.usesChoices),
    scrapedAt,
    games,
  };
};
