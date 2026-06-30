import { gmRequestJson } from "@/shared";

import type {
  OpenlistLoginResponse,
  OpenlistListResponse,
  SyncConfig,
} from "./types";

let cachedToken = "";

export async function ensureOpenlistToken(config: SyncConfig) {
  if (!cachedToken) {
    cachedToken = await openlistLogin(config);
  }

  return cachedToken;
}

export function buildOpenlistPath(config: SyncConfig, panParentPath: string) {
  const mountPoint =
    config.openlistBaiduMountPath === "/"
      ? ""
      : config.openlistBaiduMountPath.startsWith("/")
        ? config.openlistBaiduMountPath
        : `/${config.openlistBaiduMountPath}`;

  let openlistRequestPath = `${mountPoint}${panParentPath}`.replace(/\/+/g, "/");
  if (openlistRequestPath.length > 1 && openlistRequestPath.endsWith("/")) {
    openlistRequestPath = openlistRequestPath.slice(0, -1);
  }
  if (!openlistRequestPath.startsWith("/")) {
    openlistRequestPath = `/${openlistRequestPath}`;
  }

  return openlistRequestPath;
}

export function buildOpenlistDownloadUrl(
  config: SyncConfig,
  filePath: string,
  sign: string,
) {
  const encodedPath = filePath
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");

  return `${config.openlist}/d${encodedPath}?sign=${sign}`;
}

export async function openlistListFiles(
  config: SyncConfig,
  path: string,
  shouldRefresh = false,
) {
  try {
    const response = await gmRequestJson<OpenlistListResponse>({
      method: "POST",
      url: `${config.openlist}/api/fs/list`,
      headers: {
        "Content-Type": "application/json",
        Authorization: cachedToken,
      },
      data: JSON.stringify({
        path,
        page: 1,
        per_page: 100,
        refresh: shouldRefresh,
      }),
    });

    return response.code === 200 ? (response.data?.content ?? []) : null;
  } catch {
    return null;
  }
}

async function openlistLogin(config: SyncConfig) {
  try {
    const response = await gmRequestJson<OpenlistLoginResponse>({
      method: "POST",
      url: `${config.openlist}/api/auth/login`,
      headers: { "Content-Type": "application/json" },
      data: JSON.stringify({
        username: config.openlistUser,
        password: config.openlistPass,
      }),
    });

    return response.code === 200 ? (response.data?.token ?? "") : "";
  } catch {
    return "";
  }
}
