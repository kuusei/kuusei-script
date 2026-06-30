import { handleSyncPipeline } from "../model";

type TransferItem = {
  to: string;
};

type TransferResponse = {
  errno?: number;
  extra?: {
    list?: TransferItem[];
  };
};

export function registerTransferListener() {
  const originalOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function open(
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ) {
    this.addEventListener("load", () => {
      const requestUrl = typeof url === "string" ? url : url.toString();
      if (
        !requestUrl.includes("/api/transfer") &&
        !requestUrl.includes("/share/transfer")
      ) {
        return;
      }

      try {
        const response = JSON.parse(this.responseText) as TransferResponse;
        if (response.errno !== 0 || !response.extra?.list?.length) {
          return;
        }

        for (const item of response.extra.list) {
          const pathParts = item.to.split("/");
          const targetName = pathParts.pop();
          if (!targetName) {
            continue;
          }

          const panParentPath = pathParts.join("/") || "/";
          void handleSyncPipeline(panParentPath, targetName);
        }
      } catch {
        // Ignore unrelated responses.
      }
    });

    return originalOpen.call(
      this,
      method,
      url,
      async ?? true,
      username ?? undefined,
      password ?? undefined,
    );
  };
}
