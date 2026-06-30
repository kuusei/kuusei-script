import { loadValue, saveValue } from "@/shared";

import type { SyncConfig } from "./types";

const CONFIG_KEY = "user_config";

export const DEFAULT_CONFIG: SyncConfig = {
  openlist: "",
  openlistUser: "",
  openlistPass: "",
  openlistBaiduMountPath: "/baidu",
  aria2RpcUrl: "",
  aria2Secret: "",
  downloadDir: "/downloads",
};

export function loadConfig() {
  return loadValue<SyncConfig>(CONFIG_KEY, DEFAULT_CONFIG);
}

export function saveConfig(config: SyncConfig) {
  saveValue(CONFIG_KEY, config);
}
