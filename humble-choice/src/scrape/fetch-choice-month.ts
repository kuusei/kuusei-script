export type HumbleTpkd = {
  key_type?: string;
  steam_app_id?: number | null;
  "expiration_date|datetime"?: string;
};

export type HumbleGameData = {
  title?: string;
  image?: string;
  platforms?: string[];
  delivery_methods?: string[];
  developers?: string[];
  genres?: string[];
  tpkds?: HumbleTpkd[];
  "msrp|money"?: { amount?: number; currency?: string };
  user_rating?: { "steam_percent|decimal"?: number };
};

export type HumbleMonthlyPayload = {
  contentChoiceOptions?: {
    title?: string;
    productUrlPath?: string;
    productMachineName?: string;
    isActiveContent?: boolean;
    usesChoices?: boolean;
    contentChoiceData?: {
      display_order?: string[];
      game_data?: Record<string, HumbleGameData>;
    };
  };
};

export type FetchMonthResult =
  | { ok: true; slug: string; payload: HumbleMonthlyPayload }
  | { ok: false; slug: string; status: number; reason: string };

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const extractMonthlyPayload = (html: string) => {
  const marker =
    '<script id="webpack-monthly-product-data" type="application/json">';
  const start = html.indexOf(marker);
  if (start < 0) {
    return null;
  }
  const jsonStart = start + marker.length;
  const end = html.indexOf("</script>", jsonStart);
  if (end < 0) {
    return null;
  }
  return JSON.parse(html.slice(jsonStart, end).trim()) as HumbleMonthlyPayload;
};

export const fetchChoiceMonth = async (
  slug: string,
): Promise<FetchMonthResult> => {
  const url = `https://www.humblebundle.com/membership/${slug}`;
  let lastError = "unknown error";

  for (let attempt = 0; attempt < 3; attempt += 1) {
    if (attempt > 0) {
      await sleep(750 * attempt);
    }
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
      });
      if (response.status === 404) {
        return { ok: false, slug, status: 404, reason: "not found" };
      }
      if (!response.ok) {
        lastError = `HTTP ${response.status}`;
        continue;
      }
      const html = await response.text();
      const payload = extractMonthlyPayload(html);
      if (!payload?.contentChoiceOptions?.contentChoiceData?.game_data) {
        lastError = "monthly product data missing";
        continue;
      }
      return { ok: true, slug, payload };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return { ok: false, slug, status: 0, reason: lastError };
};
