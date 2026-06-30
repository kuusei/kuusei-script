type GMRequestOptions = Pick<Tampermonkey.Request<unknown>, "method" | "url" | "headers" | "data">;

export function gmRequest(options: GMRequestOptions) {
  return new Promise<{ status: number; responseText: string }>((resolve, reject) => {
    GM_xmlhttpRequest({
      ...options,
      onload: resolve,
      onerror: reject,
    });
  });
}

export async function gmRequestJson<T>(options: GMRequestOptions): Promise<T> {
  const response = await gmRequest(options);
  return JSON.parse(response.responseText) as T;
}
