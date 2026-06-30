import { gmRequestJson } from "@/shared";

import type { SyncConfig } from "./types";

export async function sendToAria2(
  config: SyncConfig,
  downloadUrl: string,
  saveDir: string,
  fileName: string,
) {
  const rpcData: {
    jsonrpc: string;
    method: string;
    id: string;
    params: Array<string | string[] | Record<string, string>>;
  } = {
    jsonrpc: "2.0",
    method: "aria2.addUri",
    id: `openlist_${Date.now()}`,
    params: [
      [downloadUrl],
      { dir: saveDir, out: fileName, "check-certificate": "false" },
    ],
  };

  if (config.aria2Secret) {
    rpcData.params.unshift(`token:${config.aria2Secret}`);
  }

  try {
    const response = await gmRequestJson<unknown>({
      method: "POST",
      url: config.aria2RpcUrl,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify(rpcData),
    });

    return Boolean(response);
  } catch {
    return false;
  }
}
