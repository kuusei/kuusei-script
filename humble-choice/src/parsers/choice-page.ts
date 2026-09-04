import type { ParsedGame, ParsedMonth } from "./types";
import { extractWebpackPage } from "./webpack-page";

const NESTED_KEYS = ["initial-get-all-games", "initial"] as const;

type GameFields = Omit<ParsedGame, "id">;

type NestedBucket = {
  content_choices?: Record<string, GameFields>;
  display_order?: string[];
};

type ChoicePage = {
  contentChoiceOptions?: {
    title?: string;
    isActiveContent?: boolean;
    usesChoices?: boolean;
    contentChoiceData?: {
      display_order?: string[];
      game_data?: Record<string, GameFields>;
      [key: string]: unknown;
    };
  };
};

const asBucket = (value: unknown): NestedBucket | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const bucket = value as NestedBucket;
  if (!bucket.content_choices || typeof bucket.content_choices !== "object") {
    return null;
  }
  return bucket;
};

/** Feb 2022+ uses `game_data`; Dec 2019–Jan 2022 nests games under `content_choices`. */
const flattenGameData = (data: NonNullable<ChoicePage["contentChoiceOptions"]>["contentChoiceData"]) => {
  if (!data) {
    return null;
  }
  if (data.game_data && Object.keys(data.game_data).length > 0) {
    return {
      gameData: data.game_data,
      order: data.display_order ?? Object.keys(data.game_data),
    };
  }
  const nested =
    NESTED_KEYS.map((key) => asBucket(data[key])).find(Boolean) ??
    Object.values(data).map(asBucket).find(Boolean);
  if (!nested?.content_choices) {
    return null;
  }
  return {
    gameData: nested.content_choices,
    order:
      nested.display_order ?? data.display_order ?? Object.keys(nested.content_choices),
  };
};

const toGames = (order: string[], gameData: Record<string, GameFields>) => {
  const games: ParsedGame[] = [];
  for (const id of order) {
    const game = gameData[id];
    const title = game?.title?.trim();
    if (!game || !title) {
      continue;
    }
    games.push({ ...game, id, title });
  }
  return games;
};

export const parseChoicePage = (
  html: string,
  sourceUrl: string,
): ParsedMonth | null => {
  const page = extractWebpackPage(html) as ChoicePage | null;
  const options = page?.contentChoiceOptions;
  const flattened = flattenGameData(options?.contentChoiceData);
  if (!options || !flattened) {
    return null;
  }
  const games = toGames(flattened.order, flattened.gameData);
  if (games.length === 0) {
    return null;
  }
  return {
    sourceUrl,
    title: options.title?.trim() || "",
    isActive: Boolean(options.isActiveContent),
    usesChoices: Boolean(options.usesChoices),
    games,
  };
};
