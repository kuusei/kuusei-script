type TimedValue<T> = {
  version: string;
  timestamp: number;
  value: T;
};

const hasGmStorage = () =>
  typeof GM_getValue === "function" && typeof GM_setValue === "function";

export function loadValue<T>(key: string, fallback: T): T {
  if (hasGmStorage()) {
    return GM_getValue<T>(key, fallback);
  }

  try {
    const raw = localStorage.getItem(key);
    if (raw == null) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function saveValue<T>(key: string, value: T) {
  if (hasGmStorage()) {
    GM_setValue(key, value);
    return;
  }

  localStorage.setItem(key, JSON.stringify(value));
}

export function loadTimedValue<T>(
  key: string,
  options: { version: string; ttlMs: number },
): T | null {
  const cached = loadValue<TimedValue<T> | null>(key, null);
  if (!cached) {
    return null;
  }

  if (cached.version !== options.version) {
    return null;
  }

  if (Date.now() - cached.timestamp > options.ttlMs) {
    return null;
  }

  return cached.value;
}

export function saveTimedValue<T>(key: string, value: T, version: string) {
  saveValue<TimedValue<T>>(key, {
    version,
    timestamp: Date.now(),
    value,
  });
}
