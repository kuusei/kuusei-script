import type { ParsedGame, ParsedMonth } from "./types";
import { extractWebpackPage } from "./webpack-page";

type NavbarSection = {
  human_name?: string;
  id?: string;
  delivery_methods?: string[];
  platforms?: string[];
};

type MonthlyPage = {
  navbarOptions?: {
    product_human_name?: string;
    sections?: NavbarSection[];
  };
};

const decodeHtml = (value: string) =>
  value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const gameImage = (html: string, id: string) => {
  const escaped = escapeRegExp(id);
  const logo = html.match(
    new RegExp(
      `id="${escaped}"[\\s\\S]{0,2500}?class="game-logo"[^>]*src="([^"]+)"`,
    ),
  );
  if (logo?.[1]) {
    return decodeHtml(logo[1]);
  }
  const background = html.match(
    new RegExp(`id="${escaped}"[^>]*background-image:url\\(([^)]+)\\)`),
  );
  if (!background?.[1]) {
    return undefined;
  }
  return decodeHtml(background[1].replace(/^['"]|['"]$/g, ""));
};

export const parseMonthlyPage = (
  html: string,
  sourceUrl: string,
): ParsedMonth | null => {
  const page = extractWebpackPage(html) as MonthlyPage | null;
  const sections = page?.navbarOptions?.sections ?? [];
  const games: ParsedGame[] = [];
  for (const section of sections) {
    const id = section.id?.trim();
    const title = section.human_name?.trim();
    if (!id || !title) {
      continue;
    }
    games.push({
      id,
      title,
      image: gameImage(html, id),
      platforms: section.platforms ?? [],
      delivery_methods: section.delivery_methods ?? [],
    });
  }
  if (games.length === 0) {
    return null;
  }
  return {
    sourceUrl,
    title: page?.navbarOptions?.product_human_name?.trim() || "",
    isActive: false,
    usesChoices: false,
    games,
  };
};
