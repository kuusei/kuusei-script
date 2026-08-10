import { ensureAppleMaterial, injectStyle } from "@/shared";

const STYLE_ID = "eh-local-highlight-edge-rail-style";

const EDGE_RAIL_STYLE = `
.eh-lh-edge-rail {
  --eh-lh-lift: 0px;
  --eh-lh-press: 1;
  position: fixed;
  top: 50%;
  right: 0;
  z-index: 2147483646;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 16px 8px;
  border: 0;
  border-radius: 12px 0 0 12px;
  background: var(--tm-apple-glass-bg);
  color: var(--tm-apple-label);
  font: 590 11px/1.15 var(--tm-apple-font);
  letter-spacing: 0.04em;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
  box-shadow:
    inset 0 0.5px 0 var(--tm-apple-highlight),
    -1px 0 0 var(--tm-apple-hairline),
    -6px 0 20px rgba(0, 0, 0, 0.22);
  transform: translateY(-50%) translateX(var(--eh-lh-lift)) scale(var(--eh-lh-press));
  transition:
    background 220ms var(--tm-apple-ease),
    color 220ms var(--tm-apple-ease),
    box-shadow 220ms var(--tm-apple-ease),
    transform 220ms var(--tm-apple-ease);
}

.eh-lh-edge-rail:hover {
  --eh-lh-lift: -2px;
  background: var(--tm-apple-glass-bg-hover);
}

.eh-lh-edge-rail:active {
  --eh-lh-press: 0.97;
  --eh-lh-lift: 0px;
  transition-duration: 80ms;
}

.eh-lh-edge-rail__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.28);
  transition: background 220ms var(--tm-apple-ease);
}

.eh-lh-edge-rail__label {
  writing-mode: vertical-rl;
  text-orientation: mixed;
}

.eh-lh-edge-rail[data-active="true"] {
  background: rgba(10, 132, 255, 0.78);
  box-shadow:
    inset 0 0.5px 0 rgba(255, 255, 255, 0.35),
    -1px 0 0 rgba(255, 255, 255, 0.1),
    -8px 0 24px rgba(10, 132, 255, 0.18);
}

.eh-lh-edge-rail[data-active="true"] .eh-lh-edge-rail__dot {
  background: #fff;
}

@media (prefers-reduced-transparency: reduce) {
  .eh-lh-edge-rail,
  .eh-lh-edge-rail[data-active="true"] {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .eh-lh-edge-rail {
    background: var(--tm-apple-glass-solid);
  }

  .eh-lh-edge-rail[data-active="true"] {
    background: var(--tm-apple-blue);
  }
}

@media (prefers-reduced-motion: reduce) {
  .eh-lh-edge-rail,
  .eh-lh-edge-rail__dot {
    transition: none;
  }

  .eh-lh-edge-rail:hover,
  .eh-lh-edge-rail:active {
    --eh-lh-lift: 0px;
    --eh-lh-press: 1;
  }
}
`;

export type EdgeRailToggleOptions = {
  id: string;
  label: string;
  ariaLabel?: string;
  activeTitle: string;
  inactiveTitle: string;
  initialActive?: boolean;
  onChange?: (active: boolean) => void;
};

export class EdgeRailToggle {
  private readonly button: HTMLButtonElement;
  private readonly activeTitle: string;
  private readonly inactiveTitle: string;
  private readonly onChange?: (active: boolean) => void;
  private active: boolean;

  constructor(options: EdgeRailToggleOptions) {
    ensureAppleMaterial();
    injectStyle(STYLE_ID, EDGE_RAIL_STYLE);

    this.active = options.initialActive ?? false;
    this.activeTitle = options.activeTitle;
    this.inactiveTitle = options.inactiveTitle;
    this.onChange = options.onChange;

    this.button = document.createElement("button");
    this.button.id = options.id;
    this.button.type = "button";
    this.button.className = "eh-lh-edge-rail";
    this.button.setAttribute("aria-label", options.ariaLabel ?? options.label);

    const dot = document.createElement("span");
    dot.className = "eh-lh-edge-rail__dot";
    dot.setAttribute("aria-hidden", "true");

    const label = document.createElement("span");
    label.className = "eh-lh-edge-rail__label";
    label.textContent = options.label;

    this.button.append(dot, label);
    this.button.addEventListener("click", () => {
      this.setActive(!this.active);
      this.onChange?.(this.active);
    });

    this.sync();
    document.body.appendChild(this.button);
  }

  get isActive() {
    return this.active;
  }

  setActive(active: boolean) {
    this.active = active;
    this.sync();
  }

  private sync() {
    this.button.dataset.active = this.active ? "true" : "false";
    this.button.setAttribute("aria-pressed", this.active ? "true" : "false");
    this.button.title = this.active ? this.activeTitle : this.inactiveTitle;
  }
}
