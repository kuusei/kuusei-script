type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "HEAD";
  url: string;
  headers?: Record<string, string>;
  data?: string;
};

const hasGmRequest = () => typeof GM_xmlhttpRequest === "function";

export function gmRequest(options: RequestOptions) {
  return new Promise<{ status: number; responseText: string }>((resolve, reject) => {
    GM_xmlhttpRequest({
      ...options,
      onload: resolve,
      onerror: reject,
    });
  });
}

async function fetchRequest(options: RequestOptions) {
  const response = await fetch(options.url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.data,
  });

  const responseText = await response.text();
  return {
    status: response.status,
    responseText,
    ok: response.ok,
  };
}

export async function request(options: RequestOptions) {
  if (hasGmRequest()) {
    return gmRequest(options);
  }

  const response = await fetchRequest(options);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response;
}

export async function requestJson<T>(options: RequestOptions): Promise<T> {
  const response = await request(options);
  return JSON.parse(response.responseText) as T;
}

/** @deprecated Prefer requestJson — kept for existing call sites. */
export const gmRequestJson = requestJson;
