import { injectStyle } from "../dom/style";

const STYLE_ID = "tm-shared-apple-material";

export const APPLE_MATERIAL_CSS = `
:root {
  --tm-apple-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Helvetica Neue", sans-serif;
  --tm-apple-blue: #0a84ff;
  --tm-apple-green: #30d158;
  --tm-apple-red: #ff453a;
  --tm-apple-label: rgba(255, 255, 255, 0.92);
  --tm-apple-secondary-label: #8e8e93;
  --tm-apple-tertiary-label: #aeaeb2;
  --tm-apple-glass-bg: rgba(44, 44, 46, 0.72);
  --tm-apple-glass-bg-strong: rgba(28, 28, 30, 0.75);
  --tm-apple-glass-bg-hover: rgba(58, 58, 60, 0.82);
  --tm-apple-glass-solid: #2c2c2e;
  --tm-apple-hairline: rgba(255, 255, 255, 0.08);
  --tm-apple-highlight: rgba(255, 255, 255, 0.28);
  --tm-apple-ease: cubic-bezier(0.32, 0.72, 0, 1);
  --tm-apple-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
}

.tm-apple-glass {
  background: var(--tm-apple-glass-bg);
  color: var(--tm-apple-label);
  font-family: var(--tm-apple-font);
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    inset 0 0.5px 0 var(--tm-apple-highlight),
    0 10px 30px rgba(0, 0, 0, 0.25);
}

.tm-apple-glass[data-active="true"],
.tm-apple-glass--active {
  background: rgba(10, 132, 255, 0.78);
}

@media (prefers-reduced-transparency: reduce) {
  .tm-apple-glass {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: var(--tm-apple-glass-solid);
  }

  .tm-apple-glass[data-active="true"],
  .tm-apple-glass--active {
    background: var(--tm-apple-blue);
  }
}
`;

export function ensureAppleMaterial() {
  injectStyle(STYLE_ID, APPLE_MATERIAL_CSS);
}
