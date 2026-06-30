import { injectStyle } from "../dom/style";

const CONTAINER_ID = "sync-pipeline-container";

const HUD_STYLE = `
#sync-pipeline-container {
  position: fixed;
  top: 24px;
  right: 24px;
  z-index: 2147483647;
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
  pointer-events: none;
}

.sync-hud-card {
  background: rgba(28, 28, 30, 0.75);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 14px 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.25);
  color: #e5e5ea;
  font-size: 13px;
  font-weight: 400;
  letter-spacing: -0.1px;
  pointer-events: auto;
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  opacity: 0;
  transform: translateY(-10px) scale(0.98);
}

.sync-hud-card.visible {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.sync-hud-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.sync-hud-title {
  font-weight: 500;
  color: #fff;
}

.sync-hud-status {
  font-size: 11px;
  color: #8e8e93;
  font-variant-numeric: tabular-nums;
}

.sync-hud-body {
  color: #aeaeb2;
  font-size: 12px;
  word-break: break-all;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sync-hud-progress-wrap {
  background: rgba(255, 255, 255, 0.1);
  width: 100%;
  height: 3px;
  border-radius: 1.5px;
  margin-top: 10px;
  overflow: hidden;
  display: none;
}

.sync-hud-progress-bar {
  background: #0a84ff;
  height: 100%;
  width: 0%;
  transition: width 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.sync-hud-card.success {
  border-top: 2px solid #30d158;
}

.sync-hud-card.error {
  border-top: 2px solid #ff453a;
}

.sync-hud-card.success .sync-hud-progress-bar {
  background: #30d158;
}

.sync-hud-card.error .sync-hud-progress-bar {
  background: #ff453a;
}
`;

function ensureContainer() {
  injectStyle("tm-shared-hud-style", HUD_STYLE);

  let container = document.getElementById(CONTAINER_ID) as HTMLDivElement | null;
  if (!container) {
    container = document.createElement("div");
    container.id = CONTAINER_ID;
    document.body.appendChild(container);
  }

  return container;
}

export class HudCard {
  private readonly card: HTMLDivElement;
  private readonly statusEl: HTMLSpanElement;
  private readonly bodyEl: HTMLDivElement;
  private readonly progressWrapEl: HTMLDivElement;
  private readonly progressBarEl: HTMLDivElement;

  constructor(title: string, message: string) {
    const container = ensureContainer();

    this.card = document.createElement("div");
    this.card.className = "sync-hud-card";

    const header = document.createElement("div");
    header.className = "sync-hud-header";

    const titleEl = document.createElement("span");
    titleEl.className = "sync-hud-title";
    titleEl.textContent = title;

    this.statusEl = document.createElement("span");
    this.statusEl.className = "sync-hud-status";
    this.statusEl.textContent = "进行中";

    header.append(titleEl, this.statusEl);

    this.bodyEl = document.createElement("div");
    this.bodyEl.className = "sync-hud-body";
    this.bodyEl.textContent = message;

    this.progressWrapEl = document.createElement("div");
    this.progressWrapEl.className = "sync-hud-progress-wrap";

    this.progressBarEl = document.createElement("div");
    this.progressBarEl.className = "sync-hud-progress-bar";
    this.progressWrapEl.appendChild(this.progressBarEl);

    this.card.append(header, this.bodyEl, this.progressWrapEl);
    container.appendChild(this.card);

    window.requestAnimationFrame(() => {
      this.card.classList.add("visible");
    });
  }

  update(message: string, statusText = "进行中", type: "success" | "error" | "" = "") {
    this.bodyEl.innerText = message;
    this.statusEl.innerText = statusText;

    this.card.classList.remove("success", "error");
    if (type) {
      this.card.classList.add(type);
    }
  }

  setProgress(percent: number) {
    this.progressWrapEl.style.display = "block";
    this.progressBarEl.style.width = `${percent}%`;
  }

  dismiss(delay = 3000) {
    window.setTimeout(() => {
      this.card.style.opacity = "0";
      this.card.style.transform = "translateY(10px) scale(0.95)";
      window.setTimeout(() => this.card.remove(), 400);
    }, delay);
  }
}
