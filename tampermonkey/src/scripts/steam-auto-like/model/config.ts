export type Language = "chinese" | "english";
export type Config = {
  isEnable: boolean;
  isShow: boolean;
  isTimedRefresh: boolean;
  refreshTimeout: number;
  thumbUpUserStatus: boolean;
  thumbUpWorkshopItemPublished: boolean;
  thumbUpGamePurchase: boolean;
  thumbUpScreenshot: boolean;
  thumbUpRecommendation: boolean;
  thumbHappyByRecommendation: boolean;
  language: Language;
};

// Retain the original key so existing users keep their choices.
export const CONFIG_KEY = "wt629_com_auto_voteup_config_v2_8";
export const booleanConfigKeys = [
  "isEnable", "isShow", "isTimedRefresh", "thumbUpUserStatus",
  "thumbUpWorkshopItemPublished", "thumbUpGamePurchase", "thumbUpScreenshot",
  "thumbUpRecommendation", "thumbHappyByRecommendation",
] as const;
export type BooleanConfigKey = typeof booleanConfigKeys[number];

export function normalizeTimeout(value: unknown): number {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds >= 10 && seconds <= 3600 ? Math.round(seconds) : 60;
}

export function loadConfig(): Config {
  const config: Config = {
    isEnable: true, isShow: true, isTimedRefresh: false, refreshTimeout: 60,
    thumbUpUserStatus: true, thumbUpWorkshopItemPublished: true,
    thumbUpGamePurchase: true, thumbUpScreenshot: true,
    thumbUpRecommendation: true, thumbHappyByRecommendation: true,
    language: navigator.language.toLowerCase().startsWith("zh") ? "chinese" : "english",
  };
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null");
    if (!saved || typeof saved !== "object" || Array.isArray(saved)) return config;
    const values = saved as Record<string, unknown>;
    for (const key of booleanConfigKeys) {
      if (typeof values[key] === "boolean") config[key] = values[key];
    }
    config.refreshTimeout = normalizeTimeout(values.refreshTimeout);
    if (values.language === "chinese" || values.language === "english") config.language = values.language;
  } catch { /* Use defaults if the old settings cannot be read. */ }
  return config;
}

export function saveConfig(config: Config): void {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}
