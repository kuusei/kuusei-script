const TOOLTIP_ID = "kuusei-steam-market-ratio-tooltip";
const TIP_SELECTOR = "[data-kuusei-tip]";

export function mountOrderTooltip() {
  const tooltip = document.createElement("div");
  tooltip.id = TOOLTIP_ID;
  tooltip.setAttribute("role", "tooltip");
  tooltip.hidden = true;
  document.body.appendChild(tooltip);

  let hovered: Element | null = null;
  let focused: Element | null = null;
  let described: Element | null = null;

  const sync = () => {
    const target = hovered?.isConnected ? hovered : focused?.isConnected ? focused : null;
    const content = target?.getAttribute("data-kuusei-tip");
    if (described && described !== target) described.removeAttribute("aria-describedby");
    if (!target || !content) {
      tooltip.hidden = true;
      described?.removeAttribute("aria-describedby");
      described = null;
      return;
    }
    described = target;
    target.setAttribute("aria-describedby", TOOLTIP_ID);
    if (tooltip.textContent !== content) tooltip.textContent = content;
    tooltip.hidden = false;
    const rect = target.getBoundingClientRect();
    const box = tooltip.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.left + (rect.width - box.width) / 2, window.innerWidth - box.width - 8));
    const below = rect.bottom + 6;
    const top = below + box.height <= window.innerHeight - 8 ? below : Math.max(8, rect.top - box.height - 6);
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  };

  const targetOf = (target: EventTarget | null) => (
    target instanceof Element ? target.closest(TIP_SELECTOR) : null
  );

  document.addEventListener("pointerover", (event) => {
    hovered = targetOf(event.target);
    sync();
  });
  document.addEventListener("pointerout", (event) => {
    hovered = targetOf(event.relatedTarget);
    sync();
  });
  document.addEventListener("focusin", (event) => {
    focused = targetOf(event.target);
    sync();
  });
  document.addEventListener("focusout", (event) => {
    focused = targetOf(event.relatedTarget);
    sync();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    hovered = null;
    focused = null;
    sync();
  });
  window.addEventListener("scroll", () => {
    hovered = null;
    focused = null;
    sync();
  }, true);
  window.addEventListener("resize", sync);
  window.addEventListener("blur", () => {
    hovered = null;
    focused = null;
    sync();
  });
  return sync;
}
