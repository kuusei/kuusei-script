import {
  loadConfig,
  saveConfig,
  type SyncConfig,
} from "../model";

export function registerConfigMenu() {
  GM_registerMenuCommand("配置同步参数", () => {
    try {
      const current = loadConfig();
      const next: SyncConfig = {
        openlist: promptRequired("OpenList 地址：", current.openlist).replace(
          /\/$/,
          "",
        ),
        openlistUser: promptRequired("用户名：", current.openlistUser),
        openlistPass: promptRequired("密码：", current.openlistPass),
        openlistBaiduMountPath: normalizeMountPath(
          promptRequired("挂载根路径：", current.openlistBaiduMountPath),
        ),
        aria2RpcUrl: promptRequired("Aria2 RPC：", current.aria2RpcUrl),
        aria2Secret: promptRequired("Aria2 密钥：", current.aria2Secret),
        downloadDir: promptRequired("存储绝对路径：", current.downloadDir),
      };

      saveConfig(next);
      window.location.reload();
    } catch (error) {
      if (error instanceof Error && error.message === "cancelled") {
        return;
      }

      throw error;
    }
  });
}

function promptRequired(label: string, defaultValue: string) {
  const value = window.prompt(label, defaultValue);
  if (value === null) {
    throw new Error("cancelled");
  }
  return value.trim();
}

function normalizeMountPath(value: string) {
  return value.replace(/\/$/, "") || "/";
}
