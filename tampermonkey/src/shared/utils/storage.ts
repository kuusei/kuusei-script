export function loadValue<T>(key: string, fallback: T): T {
  return GM_getValue<T>(key, fallback);
}

export function saveValue<T>(key: string, value: T) {
  GM_setValue(key, value);
}
