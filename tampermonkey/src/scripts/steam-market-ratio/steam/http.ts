const TIMEOUT_MS = 20_000;

export async function fetchText(url: string, headers?: Record<string, string>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials: "include",
      cache: "no-store",
      signal: controller.signal,
      headers,
    });
    if (!response.ok) {
      throw new Error(response.status === 429
        ? "Steam 请求过于频繁，请稍后再刷新。"
        : `Steam 请求失败（${response.status}）。`);
    }
    return await response.text();
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Steam 请求超时，请稍后重试。");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
