import reportCss from "./report.generated.css";

import { mountReport } from "./report-client";
import type { ReportPayload } from "./report-html";
import { renderReportShell } from "./report-html";
import { saveItadApiKey } from "../pricing/itad-prices";
import {
  mountSetup,
  renderSetupShell,
  saveRegionSetup,
  saveTagsEnabled,
  type RegionSetup,
} from "./region-settings";

const HOST_ID = "wl-prices-overlay";
const closeIcon = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" /></svg>`;

export const closeReportOverlay = () => {
  document.getElementById(HOST_ID)?.remove();
  document.documentElement.style.removeProperty("overflow");
};

const attachOverlay = (mode: "page" | "dialog") => {
  closeReportOverlay();
  const host = document.createElement("div");
  host.id = HOST_ID;
  const shadow = host.attachShadow({ mode: "open" });
  const style = document.createElement("style");
  style.textContent = reportCss;
  const overlay = document.createElement("div");
  if (mode === "dialog") {
    overlay.className = "wl-overlay fixed inset-0 z-[2147483646] flex items-center justify-center p-4";
    overlay.innerHTML = `<div class="wl-app wl-dialog overflow-auto rounded-xl"></div>`;
  } else {
    overlay.className = "wl-overlay fixed inset-0 z-[2147483646] flex flex-col p-3";
    overlay.innerHTML = `<div class="wl-chrome"><button type="button" class="wl-close" aria-label="关闭">${closeIcon}</button></div><div class="wl-app min-h-0 flex-1 overflow-hidden rounded-xl bg-paper shadow-xl"></div>`;
  }
  shadow.append(style, overlay);
  document.documentElement.style.overflow = "hidden";
  document.body.appendChild(host);
  return {
    overlay,
    app: overlay.querySelector(".wl-app") as HTMLElement,
    closeBtn: overlay.querySelector(".wl-close") as HTMLButtonElement | null,
  };
};

export const openReportOverlay = (
  payload: ReportPayload,
  handlers?: { onRefetch?: () => void; onSetup?: () => void },
) => {
  const { app, closeBtn } = attachOverlay("page");
  closeBtn?.addEventListener("click", closeReportOverlay);
  app.innerHTML = renderReportShell(payload);
  mountReport(app, payload, handlers);
};

export const openRegionSetup = (initial: RegionSetup | null, wishlistCount: number) =>
  new Promise<RegionSetup | null>((resolve) => {
    const { overlay, app } = attachOverlay("dialog");
    let done = false;
    const finish = (value: RegionSetup | null) => {
      if (done) return;
      done = true;
      closeReportOverlay();
      resolve(value);
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish(null);
    });
    app.innerHTML = renderSetupShell(initial);
    app.querySelector("#setup-close")?.addEventListener("click", () => finish(null));
    mountSetup(app, initial, (setup) => {
      saveItadApiKey(setup.itadKey);
      saveTagsEnabled(setup.tagsEnabled);
      saveRegionSetup(setup);
      finish(setup);
    }, wishlistCount);
  });
