const MARKET = "https://steamcommunity.com/market/priceoverview/";
const RATES = "https://open.er-api.com/v6/latest/CNY";

type ItemKey = { appid: number; marketHashName: string };

function getJson(url: string, label: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: "GET",
      url,
      anonymous: true,
      timeout: 12_000,
      onload(response) {
        if (response.status !== 200) {
          reject(new Error(response.status === 429
            ? `${label}查询过于频繁，请稍后再试。`
            : `${label}查询失败（${response.status}）。`));
          return;
        }
        try {
          resolve(JSON.parse(response.responseText) as unknown);
        } catch {
          reject(new Error(`${label}返回的数据无效。`));
        }
      },
      onerror: () => reject(new Error(`${label}查询失败，请检查网络。`)),
      ontimeout: () => reject(new Error(`${label}查询超时，请重试。`)),
    });
  });
}

export async function loadChinaLowest({ appid, marketHashName }: ItemKey) {
  const url = new URL(MARKET);
  url.search = new URLSearchParams({
    appid: String(appid),
    country: "CN",
    currency: "23",
    market_hash_name: marketHashName,
  }).toString();
  const data = await getJson(url.href, "国区报价") as {
    success?: unknown;
    lowest_price?: unknown;
  } | null;
  if (!data?.success) throw new Error("Steam 未返回国区报价。");
  if (!data.lowest_price) throw new Error("国区暂无在售报价。");
  const match = typeof data.lowest_price === "string"
    && /^[¥￥]\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?$/.exec(data.lowest_price.trim());
  if (!match) throw new Error("Steam 未返回有效的人民币报价。");
  const cents = Number(match[1].replace(/,/g, "")) * 100
    + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Steam 未返回有效的人民币报价。");
  return cents;
}

let cachedRate: { rate: number; expiresAt: number } | undefined;

export async function loadInrPerCny() {
  const now = Date.now();
  if (cachedRate && cachedRate.expiresAt > now) return cachedRate.rate;
  const data = await getJson(RATES, "汇率") as {
    result?: unknown;
    base_code?: unknown;
    rates?: { INR?: unknown };
    time_next_update_unix?: unknown;
  } | null;
  const rate = data?.rates?.INR;
  if (data?.result !== "success" || data.base_code !== "CNY"
    || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) {
    throw new Error("未取得有效的人民币兑卢比汇率。");
  }
  const nextUpdate = Number(data.time_next_update_unix) * 1000;
  cachedRate = { rate, expiresAt: nextUpdate > now ? Math.min(nextUpdate, now + 86_400_000) : now + 3_600_000 };
  return rate;
}
