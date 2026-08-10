export function whenDocumentReady(fn: () => void) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    window.setTimeout(fn, 0);
    return;
  }

  document.addEventListener("DOMContentLoaded", fn, { once: true });
}

export function startPolling(
  fn: () => void | Promise<void>,
  intervalMs: number,
  options?: { immediate?: boolean },
) {
  if (options?.immediate ?? true) {
    void fn();
  }

  return window.setInterval(() => {
    void fn();
  }, intervalMs);
}
