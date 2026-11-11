import { domToCanvas } from "modern-screenshot";
import qrcode from "qrcode-generator";
import { loadValue, saveValue } from "@/shared";

export const SCREENSHOT_WIDTHS = { mobile: 480, pc: 1280 } as const;
export const SCREENSHOT_SCALE = 2;
export const JPEG_MAX_HEIGHT = 65000;
const JPEG_QUALITY = 0.86;
const OPTIONS_KEY = "wishlist-screenshot-options-v1";
const PLUGIN_URL = "https://greasyfork.org/zh-CN/scripts/595010";
const EMPTY_IMAGE = "data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='184' height='69'/%3E";
const IMAGE_CONCURRENCY = 16;
const COVER_JPEG_QUALITY = 0.92;
const capsuleCache = new Map<string, Promise<string>>();
const imageQueue: (() => void)[] = [];
let activeImages = 0;

// The export uses this small, fixed subset of CSS; avoid copying hundreds of
// unrelated computed properties for every title, price and badge.
export const SCREENSHOT_STYLE_PROPERTIES = [
  "display", "position", "box-sizing", "min-width", "min-height", "max-width", "max-height",
  "margin", "padding", "border", "border-radius", "background", "color", "opacity", "visibility",
  "font-family", "font-size", "font-weight", "font-style", "line-height", "letter-spacing",
  "text-align", "text-decoration", "text-transform", "white-space", "overflow-wrap", "word-break",
  "overflow", "text-overflow", "object-fit", "box-shadow", "outline", "outline-offset",
  "flex", "flex-direction", "flex-wrap", "align-items", "align-self", "justify-content", "gap", "row-gap", "column-gap",
];

type ExportOptions = {
  layout: keyof typeof SCREENSHOT_WIDTHS;
  includeWishlistQr: boolean;
  includeIntro: boolean;
};
export type ScreenshotProgress = { phase: "covers" | "render" | "encode"; done: number; total: number };
export type ScreenshotSnapshot = {
  steamName: string;
  wishlistUrl: string;
  home: string;
  countries: string[];
  generatedAt: string;
  summary: string;
  listHtml: string;
};

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;")
  .replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const wishlistQrSvg = (url: string) => {
  const code = qrcode(0, "M");
  code.addData(url);
  code.make();
  // The dark card provides the quiet zone for the light modules.
  return code.createSvgTag({ margin: 0, scalable: true })
    .replace("<svg ", '<svg class="wl-shot-qr" width="96" height="96" role="img" aria-label="Steam 愿望单二维码" ')
    .replace('fill="white"', 'fill="none"')
    .replace('fill="black"', 'fill="#e1edf5"');
};

// Keep cards intact and leave enough room for the repeated header and footer.
export const splitScreenshotRows = (heights: number[], availableHeight: number): number[][] => {
  const pages: number[][] = [];
  let page: number[] = [];
  let height = 0;
  for (let index = 0; index < heights.length; index++) {
    const next = Math.ceil(heights[index]);
    if (next > availableHeight) throw new Error("单款游戏内容过长，请选择 PC 版导出");
    if (page.length && height + 8 + next > availableHeight) {
      pages.push(page); page = []; height = 0;
    }
    height += (page.length ? 8 : 0) + next;
    page.push(index);
  }
  if (page.length || pages.length === 0) pages.push(page);
  return pages;
};

export const screenshotHtml = (snapshot: ScreenshotSnapshot, options: ExportOptions) => `
  <header class="wl-shot-heading">
    <div class="wl-shot-heading-main">
      <div class="wl-shot-copy">
        <h1>Steam ${escapeHtml(snapshot.steamName)} 愿望单</h1>
        <div class="wl-shot-regions">
          <span><strong>账户区：</strong>${escapeHtml(snapshot.home)}</span>
          <span><strong>比价区：</strong>${snapshot.countries.map(escapeHtml).join(" / ")}</span>
        </div>
      </div>
      ${options.includeWishlistQr ? wishlistQrSvg(snapshot.wishlistUrl) : ""}
    </div>
    <div class="wl-shot-meta">
      <p>${escapeHtml(snapshot.summary)}</p>
      <p>${escapeHtml(snapshot.generatedAt)}</p>
    </div>
  </header>
  <div class="wl-shot-list">${snapshot.listHtml}</div>
  ${options.includeIntro ? `<footer class="wl-shot-intro">
    <p>Steam 愿望单区域比价 by kuusei</p>
    <a href="${PLUGIN_URL}">${PLUGIN_URL}</a>
  </footer>` : ""}`;

const blobDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result));
  reader.onerror = () => reject(new Error("封面读取失败"));
  reader.readAsDataURL(blob);
});

const copyDecodedImage = (img: HTMLImageElement) => {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  try {
    const context = canvas.getContext("2d");
    if (!context) return "";
    context.drawImage(img, 0, 0);
    const data = canvas.toDataURL("image/jpeg", COVER_JPEG_QUALITY);
    return data.startsWith("data:image/jpeg") ? data : "";
  } catch {
    return "";
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
};

const loadedReportCapsules = (root: HTMLElement) => {
  const capsules = new Map<string, HTMLImageElement>();
  root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    if (!img.complete || !img.naturalWidth || img.closest(".wl-shot-stage")) return;
    const current = img.currentSrc || img.src;
    if (current.startsWith("https://shared.akamai.steamstatic.com/") && !capsules.has(current)) {
      capsules.set(current, img);
    }
  });
  return capsules;
};

const readCapsule = async (url: string, loadedImage?: HTMLImageElement) => {
  if (url.startsWith("data:image/")) return url;
  // Only Steam's fixed asset origin is eligible for privileged image requests.
  if (new URL(url).origin !== "https://shared.akamai.steamstatic.com") return EMPTY_IMAGE;
  const copied = loadedImage && copyDecodedImage(loadedImage);
  if (copied) return copied;
  if (activeImages >= IMAGE_CONCURRENCY) await new Promise<void>((resolve) => imageQueue.push(resolve));
  else activeImages++;
  try {
    let blob: Blob;
    try {
      // Normal image requests share the browser's cache with the visible report.
      const res = await fetch(url, { cache: "force-cache", credentials: "omit", signal: AbortSignal.timeout(5000) });
      if (!res.ok) throw new Error();
      blob = await res.blob();
    } catch {
      if (typeof GM_xmlhttpRequest !== "function") throw new Error();
      blob = await new Promise<Blob>((resolve, reject) => GM_xmlhttpRequest({
        method: "GET", url, responseType: "blob", anonymous: true, timeout: 8000,
        onload: (res) => res.status === 200 && res.response instanceof Blob ? resolve(res.response) : reject(new Error()),
        onerror: () => reject(new Error()), ontimeout: () => reject(new Error()), onabort: () => reject(new Error()),
      }));
    }
    return await blobDataUrl(blob);
  } catch { return EMPTY_IMAGE; }
  finally {
    const next = imageQueue.shift();
    if (next) next(); else activeImages--;
  }
};

const cachedCapsule = (url: string, loadedImage?: HTMLImageElement) => {
  const cached = capsuleCache.get(url);
  if (cached) return cached;
  if (capsuleCache.size >= 1000) capsuleCache.delete(capsuleCache.keys().next().value!);
  const pending = readCapsule(url, loadedImage).then((value) => {
    if (value === EMPTY_IMAGE) capsuleCache.delete(url);
    return value;
  });
  capsuleCache.set(url, pending);
  return pending;
};

const createDocument = (snapshot: ScreenshotSnapshot, options: ExportOptions) => {
  const doc = document.createElement("div");
  doc.className = `wl-shot-document${options.layout === "mobile" ? " is-mobile" : ""}`;
  doc.style.width = `${SCREENSHOT_WIDTHS[options.layout]}px`;
  doc.innerHTML = screenshotHtml(snapshot, options);
  doc.querySelectorAll(".wl-tag-edit").forEach((button) => button.remove());
  // Measure with placeholders so thousands of offscreen covers do not start
  // loading or hold up the renderer's media readiness check.
  doc.querySelectorAll("img").forEach((img) => {
    img.dataset.shotSrc = img.src;
    img.src = EMPTY_IMAGE;
    img.loading = "eager";
    img.removeAttribute("srcset");
  });
  return doc;
};

const downloadBlob = (blob: Blob, name: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name;
  document.body.appendChild(link);
  link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
};

let canvasHeightLimit = 0;
const maxJpegHeight = () => {
  if (canvasHeightLimit) return canvasHeightLimit;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  try {
    for (const height of [JPEG_MAX_HEIGHT, 32760, 16380, 8190]) {
      try {
        canvas.height = height;
        const context = canvas.getContext("2d");
        context?.fillRect(0, height - 1, 1, 1);
        if (context?.getImageData(0, height - 1, 1, 1).data[3] === 255) return canvasHeightLimit = height;
      } catch { /* Try the next supported canvas height. */ }
    }
    throw new Error("浏览器不支持截图导出");
  } finally { canvas.width = 0; canvas.height = 0; }
};

const jpegBlob = (canvas: HTMLCanvasElement) => new Promise<Blob>((resolve, reject) => {
  canvas.toBlob((blob) => {
    if (blob?.type === "image/jpeg") resolve(blob);
    else reject(new Error("JPG 生成失败，请选择手机版或减少游戏数量"));
  }, "image/jpeg", JPEG_QUALITY);
});

export const exportScreenshot = async (
  root: HTMLElement, snapshot: ScreenshotSnapshot, options: ExportOptions,
  onProgress?: (progress: ScreenshotProgress) => void,
) => {
  const start = performance.now();
  const timings = { coversMs: 0, renderMs: 0, encodeMs: 0, totalMs: 0, coverCount: 0, memoryCacheHits: 0, failedCovers: 0, renderPages: 0,
    files: [] as { width: number; height: number; bytes: number }[] };
  const stage = document.createElement("div");
  stage.className = "wl-shot-stage";
  stage.inert = true;
  const doc = createDocument(snapshot, options);
  stage.appendChild(doc); root.appendChild(stage);
  try {
    await document.fonts.ready;
    const list = doc.querySelector<HTMLElement>(".wl-shot-list")!;
    const cards = Array.from(list.children) as HTMLElement[];
    const gameCount = cards.filter((card) => card.classList.contains("wl-row")).length;
    const heights = cards.map((card) => card.getBoundingClientRect().height);
    const overhead = Math.ceil(doc.getBoundingClientRect().height - list.getBoundingClientRect().height) + 2;
    const images = Array.from(doc.querySelectorAll("img[data-shot-src]"));
    const urls = [...new Set(images.map((img) => (img as HTMLImageElement).dataset.shotSrc!))];
    timings.coverCount = urls.length;
    timings.memoryCacheHits = urls.filter((url) => capsuleCache.has(url)).length;
    const coverStart = performance.now();
    const loadedImages = loadedReportCapsules(root);
    const assets = new Map<string, string>();
    let loaded = 0;
    onProgress?.({ phase: "covers", done: 0, total: urls.length });
    // Resolve unique covers before rendering any page, with a shared request limit.
    await Promise.all(urls.map(async (url) => {
      const image = await cachedCapsule(url, loadedImages.get(url));
      if (image === EMPTY_IMAGE) timings.failedCovers++;
      assets.set(url, image);
      onProgress?.({ phase: "covers", done: ++loaded, total: urls.length });
    }));
    for (const image of images) {
      const img = image as HTMLImageElement;
      img.dataset.shotSrc = assets.get(img.dataset.shotSrc!)!;
    }
    timings.coversMs = performance.now() - coverStart;
    const originals = cards.map((card) => card.outerHTML);
    const pixelWidth = SCREENSHOT_WIDTHS[options.layout] * SCREENSHOT_SCALE;
    const heightLimit = maxJpegHeight();
    const pages = splitScreenshotRows(heights, heightLimit / SCREENSHOT_SCALE - overhead - 64);
    const date = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
    const basename = `steam-wishlist-${options.layout}-${date}`;
    let renderedGames = 0;
    for (let page = 0; page < pages.length; page++) {
      const rows = pages[page];
      list.innerHTML = rows.map((row) => originals[row]).join("");
      const height = Math.ceil(doc.getBoundingClientRect().height);
      const pixelHeight = height * SCREENSHOT_SCALE;
      if (pixelHeight > heightLimit) throw new Error("图片过长，请减少游戏数量");
      onProgress?.({ phase: "render", done: renderedGames, total: gameCount });
      const renderStart = performance.now();
      // Render the complete JPG page at its final dimensions. There are no
      // internal tiles, crops or seams; only the JPEG height limit splits files.
      const output = await domToCanvas(doc, {
        width: SCREENSHOT_WIDTHS[options.layout], height, scale: SCREENSHOT_SCALE,
        backgroundColor: "#1b2838", font: false, maximumCanvasSize: heightLimit,
        features: { copyScrollbar: false }, includeStyleProperties: SCREENSHOT_STYLE_PROPERTIES,
        fetchFn: (url) => cachedCapsule(url),
        onCloneEachNode: (cloned) => {
          if (cloned instanceof HTMLElement && cloned.classList.contains("wl-cap")) {
            cloned.style.width = "184px"; cloned.style.height = "69px";
          }
          if (cloned instanceof HTMLImageElement && cloned.dataset.shotSrc) {
            cloned.width = 184; cloned.height = 69;
            cloned.src = cloned.dataset.shotSrc;
            delete cloned.dataset.shotSrc;
          }
        },
      });
      try {
        if (output.width !== pixelWidth || output.height !== pixelHeight) {
          throw new Error("截图尺寸不正确，请重试");
        }
        timings.renderMs += performance.now() - renderStart;
        timings.renderPages++;
        renderedGames += rows.filter((row) => cards[row].classList.contains("wl-row")).length;
        onProgress?.({ phase: "render", done: renderedGames, total: gameCount });
        onProgress?.({ phase: "encode", done: page + 1, total: pages.length });
        const encodeStart = performance.now();
        const blob = await jpegBlob(output);
        timings.encodeMs += performance.now() - encodeStart;
        timings.files.push({ width: pixelWidth, height: pixelHeight, bytes: blob.size });
        const suffix = pages.length === 1 ? "" : `-${String(page + 1).padStart(3, "0")}`;
        downloadBlob(blob, `${basename}${suffix}.jpg`);
      } finally { output.width = 0; output.height = 0; }
    }
    timings.totalMs = performance.now() - start;
    return timings;
  } finally { stage.remove(); }
};

const screenshotSwitch = (id: string, label: string, checked: boolean) => `
  <label class="wl-setup-switch-row">
    <span class="wl-setup-label">${label}</span>
    <input type="checkbox" class="wl-setup-switch-input" id="${id}" ${checked ? "checked" : ""} />
    <span class="wl-setup-switch" aria-hidden="true"></span>
  </label>`;

export const openScreenshotExport = (root: HTMLElement, snapshot: ScreenshotSnapshot, trigger: HTMLElement) => {
  if (root.querySelector(".wl-shot-modal")) return;
  const saved = loadValue<Partial<ExportOptions> | null>(OPTIONS_KEY, null);
  const options: ExportOptions = {
    layout: saved?.layout === "mobile" || saved?.layout === "pc" ? saved.layout : window.innerWidth <= 640 ? "mobile" : "pc",
    includeWishlistQr: saved?.includeWishlistQr !== false,
    includeIntro: saved?.includeIntro !== false,
  };
  const modal = document.createElement("div");
  const template = document.createElement("template");
  template.innerHTML = snapshot.listHtml;
  const gameCount = template.content.querySelectorAll(".wl-row").length;
  modal.className = "wl-shot-modal";
  modal.innerHTML = `<section class="wl-dialog wl-shot-dialog" role="dialog" aria-modal="true" aria-labelledby="wl-shot-title">
    <div class="wl-setup-header"><h2 id="wl-shot-title" class="wl-setup-title">导出截图</h2><button type="button" class="wl-setup-close" data-shot-close aria-label="关闭">×</button></div>
    <fieldset class="wl-shot-presets"><legend>图片宽度</legend>${(["mobile", "pc"] as const).map((layout) => `<label class="wl-setup-chip"><input type="radio" name="wl-shot-layout" value="${layout}" ${layout === options.layout ? "checked" : ""} /><span>${layout === "mobile" ? "手机版" : "PC 版"} · ${SCREENSHOT_WIDTHS[layout] * SCREENSHOT_SCALE}px</span><span class="wl-setup-dot" aria-hidden="true"></span></label>`).join("")}</fieldset>
    ${screenshotSwitch("wl-shot-wishlist-qr", "愿望单二维码", options.includeWishlistQr)}
    ${screenshotSwitch("wl-shot-intro", "附带插件介绍", options.includeIntro)}
    ${gameCount > 50 ? `<p class="wl-shot-note">共 ${gameCount} 款游戏，导出可能需要较长时间。</p>` : ""}
    <p class="wl-shot-error" role="alert"></p><button type="button" class="wl-setup-go" data-shot-save>导出 JPG</button>
  </section>`;
  let busy = false;
  let awaitingConfirmation = false;
  const close = () => { if (!busy) { modal.remove(); trigger.focus(); } };
  modal.querySelector("[data-shot-close]")!.addEventListener("click", close);
  modal.addEventListener("click", (event) => { if (event.target === modal) close(); });
  modal.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { event.stopPropagation(); close(); }
    if (event.key !== "Tab") return;
    const controls = Array.from(modal.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled):not([type="radio"]), input[type="radio"]:checked:not(:disabled)'));
    const scope = root.getRootNode();
    const focused = scope instanceof ShadowRoot ? scope.activeElement : document.activeElement;
    if (!controls.length) event.preventDefault();
    else if (event.shiftKey && focused === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
    else if (!event.shiftKey && focused === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
  });
  const save = modal.querySelector<HTMLButtonElement>("[data-shot-save]")!;
  save.addEventListener("click", async () => {
    if (busy) return;
    const error = modal.querySelector<HTMLElement>(".wl-shot-error")!;
    error.textContent = "";
    if (gameCount > 99 && !awaitingConfirmation) {
      awaitingConfirmation = true;
      save.textContent = `确认导出 ${gameCount} 款游戏`;
      return;
    }
    awaitingConfirmation = false;
    const layout = modal.querySelector<HTMLInputElement>('input[name="wl-shot-layout"]:checked')!.value;
    options.layout = layout === "mobile" ? "mobile" : "pc";
    options.includeWishlistQr = modal.querySelector<HTMLInputElement>("#wl-shot-wishlist-qr")!.checked;
    options.includeIntro = modal.querySelector<HTMLInputElement>("#wl-shot-intro")!.checked;
    busy = true; save.textContent = "导出中…";
    modal.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach((control) => { control.disabled = true; });
    try {
      const timings = await exportScreenshot(root, snapshot, options, ({ phase, done, total }) => {
        save.textContent = phase === "covers" ? `读取封面 ${done}/${total}…`
          : phase === "encode" ? `压缩图片 ${done}/${total}…`
          : total ? `生成图片 ${done}/${total}…` : "生成图片…";
      });
      console.debug("[Steam 愿望单截图耗时]", timings);
      saveValue(OPTIONS_KEY, options);
      busy = false; close();
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : "截图生成失败，请重试";
    } finally {
      busy = false; save.textContent = "导出 JPG";
      modal.querySelectorAll<HTMLInputElement | HTMLButtonElement>("input, button").forEach((control) => { control.disabled = false; });
    }
  });
  root.appendChild(modal);
  modal.querySelector<HTMLInputElement>("input:checked")!.focus();
};
