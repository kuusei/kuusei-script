const injectedStyleIds = new Set<string>();

export function injectStyle(id: string, cssText: string) {
  if (injectedStyleIds.has(id) || document.getElementById(id)) {
    injectedStyleIds.add(id);
    return;
  }

  const style = document.createElement("style");
  style.id = id;
  style.textContent = cssText;
  document.head.appendChild(style);
  injectedStyleIds.add(id);
}
