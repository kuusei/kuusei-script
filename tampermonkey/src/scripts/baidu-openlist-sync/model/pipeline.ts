import { HudCard, sleep } from "@/shared";

import { sendToAria2 } from "./aria2";
import { loadConfig } from "./config";
import {
  buildOpenlistDownloadUrl,
  buildOpenlistPath,
  ensureOpenlistToken,
  openlistListFiles,
} from "./openlist";
import type { OpenlistFileItem, SyncCounter, SyncConfig } from "./types";

export async function handleSyncPipeline(
  panParentPath: string,
  targetName: string,
) {
  const hud = new HudCard("同步流水线", "初始化...");
  const config = loadConfig();

  await sleep(2000);

  const token = await ensureOpenlistToken(config);
  if (!token) {
    hud.update("OpenList 登录失败", "错误", "error");
    hud.dismiss(5000);
    return;
  }

  const openlistRequestPath = buildOpenlistPath(config, panParentPath);

  hud.update("更新 OpenList 目录缓存...", "刷新");

  const files = await openlistListFiles(config, openlistRequestPath, true);
  if (!files) {
    hud.update("获取目录树失败", "错误", "error");
    hud.dismiss(5000);
    return;
  }

  const matchedItem = files.find((file) => file.name === targetName);
  if (!matchedItem) {
    hud.update(`未找到目标对象: ${targetName}`, "错误", "error");
    hud.dismiss(5000);
    return;
  }

  const finalOpenlistPath =
    openlistRequestPath === "/"
      ? `/${matchedItem.name}`
      : `${openlistRequestPath}/${matchedItem.name}`;

  if (matchedItem.is_dir) {
    await handleFolderSync(config, finalOpenlistPath, matchedItem.name, hud);
    return;
  }

  await handleFileSync(config, finalOpenlistPath, matchedItem.name, matchedItem.sign, hud);
}

async function handleFolderSync(
  config: SyncConfig,
  finalOpenlistPath: string,
  folderName: string,
  hud: HudCard,
) {
  hud.update("深度扫描文件夹结构...", "扫描");

  const rootItems = await openlistListFiles(config, finalOpenlistPath, false);
  if (!rootItems?.length) {
    hud.update("空文件夹已跳过", "完成", "success");
    hud.dismiss(3000);
    return;
  }

  const counter: SyncCounter = { total: 0, success: 0 };
  await countFolderItems(config, rootItems, finalOpenlistPath, counter);

  hud.update(`向 Aria2 投递 ${counter.total} 个文件...`, "投递");
  hud.setProgress(0);

  await downloadFolderRecursively(
    config,
    finalOpenlistPath,
    `${config.downloadDir}/${folderName}`,
    hud,
    counter,
    rootItems,
  );

  hud.update(
    `已成功推送 ${counter.success}/${counter.total} 个下载任务`,
    "完成",
    "success",
  );
  hud.setProgress(100);
  hud.dismiss(5000);
}

async function handleFileSync(
  config: SyncConfig,
  finalOpenlistPath: string,
  fileName: string,
  sign: string,
  hud: HudCard,
) {
  const fileUrl = buildOpenlistDownloadUrl(config, finalOpenlistPath, sign);
  const result = await sendToAria2(config, fileUrl, config.downloadDir, fileName);

  hud.update(
    result ? `已推送单文件: ${fileName}` : "Aria2 RPC 投递失败",
    result ? "完成" : "错误",
    result ? "success" : "error",
  );
  if (result) {
    hud.setProgress(100);
  }
  hud.dismiss(4000);
}

async function countFolderItems(
  config: SyncConfig,
  currentItems: OpenlistFileItem[],
  currentPath: string,
  counter: SyncCounter,
) {
  for (const item of currentItems) {
    if (item.is_dir) {
      const subPath = `${currentPath}/${item.name}`;
      const subItems = await openlistListFiles(config, subPath, false);
      if (subItems) {
        await countFolderItems(config, subItems, subPath, counter);
      }
      continue;
    }

    counter.total += 1;
  }
}

async function downloadFolderRecursively(
  config: SyncConfig,
  openlistPath: string,
  localSaveDir: string,
  hud: HudCard,
  counter: SyncCounter,
  cachedItems: OpenlistFileItem[] | null = null,
) {
  const items =
    cachedItems ?? (await openlistListFiles(config, openlistPath, false));
  if (!items) {
    return;
  }

  for (const item of items) {
    const currentOpenlistPath = `${openlistPath}/${item.name}`;
    if (item.is_dir) {
      await downloadFolderRecursively(
        config,
        currentOpenlistPath,
        `${localSaveDir}/${item.name}`,
        hud,
        counter,
        null,
      );
      continue;
    }

    const fileUrl = buildOpenlistDownloadUrl(
      config,
      currentOpenlistPath,
      item.sign,
    );
    const isOk = await sendToAria2(config, fileUrl, localSaveDir, item.name);
    if (isOk) {
      counter.success += 1;
    }

    const progressPercent = Math.round((counter.success / counter.total) * 100);
    hud.update(`同步: ${item.name}`, `${counter.success}/${counter.total}`);
    hud.setProgress(progressPercent);
  }
}
