const CACHE_KEY = "exchangeRatesCache";
const CACHE_DURATION_MS = 12 * 60 * 60 * 1000;
const CACHE_VERSION = "v1";
const PROCESSED_CLASS = "nodeseek-currency-processed";
const API_URL = "https://open.er-api.com/v6/latest/USD";

type CurrencyConfigItem = {
  symbol: string;
  code: string;
  type: "emoji" | "char" | "word";
  prefix: boolean;
};

type ExchangeRateCache = {
  version: string;
  timestamp: number;
  rates: Record<string, number>;
  time_last_update_unix: number;
};

type ExchangeRates = {
  rates: Record<string, number>;
  time_last_update_unix: number;
};

type ExchangeRateResponse = {
  result?: string;
  rates?: Record<string, number>;
  time_last_update_unix?: number;
};

const currencyConfig: CurrencyConfigItem[] = [
  { symbol: "\u{1F52A}", code: "USD", type: "emoji", prefix: false },
  { symbol: "刀", code: "USD", type: "char", prefix: false },
  { symbol: " 刀", code: "USD", type: "word", prefix: false },
  { symbol: "u", code: "USD", type: "char", prefix: false },
  { symbol: "美元", code: "USD", type: "word", prefix: false },
  { symbol: "$", code: "USD", type: "char", prefix: true },
  { symbol: "$", code: "USD", type: "char", prefix: false },
  { symbol: "o", code: "EUR", type: "char", prefix: false },
  { symbol: "czk", code: "CZK", type: "word", prefix: false },
];

const currencyMap = Object.fromEntries(
  currencyConfig.map((item) => [item.symbol.toLowerCase(), item.code]),
);

function escapeRegex(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSingleUnicodeSymbol(str: string) {
  return Array.from(str).length === 1;
}

function buildRegexFromConfig(config: CurrencyConfigItem[]) {
  const prefixChars: string[] = [];
  const suffixChars: string[] = [];
  const suffixWords: string[] = [];

  for (const item of config) {
    const { symbol, type, prefix } = item;
    if (prefix) {
      if (isSingleUnicodeSymbol(symbol)) {
        const cp = symbol.codePointAt(0);
        if (cp !== undefined) {
          prefixChars.push(cp > 0xffff ? `\\u{${cp.toString(16)}}` : escapeRegex(symbol));
        }
      } else {
        console.warn("前置符号应为单个 Unicode 字符:", symbol);
      }
      continue;
    }

    if (type === "word") {
      suffixWords.push(escapeRegex(symbol));
      continue;
    }

    if (isSingleUnicodeSymbol(symbol)) {
      const cp = symbol.codePointAt(0);
      if (cp !== undefined) {
        suffixChars.push(cp > 0xffff ? `\\u{${cp.toString(16)}}` : escapeRegex(symbol));
      }
      continue;
    }

    console.warn("后置符号多字符非word类型:", symbol);
  }

  const prefixPart = prefixChars.length ? `[${prefixChars.join("")}]` : null;
  const suffixCharPart = suffixChars.length ? `[${suffixChars.join("")}]` : null;
  const suffixWordPart = suffixWords.length ? `(?:${suffixWords.join("|")})` : null;

  let pattern = "";
  if (prefixPart && (suffixCharPart || suffixWordPart)) {
    pattern =
      `(?:(${prefixPart})(\\d+(?:\\.\\d+)?))|` +
      `(\\d+(?:\\.\\d+)?)(?:(${suffixCharPart})|(${suffixWordPart}))`;
  } else if (prefixPart) {
    pattern = `(${prefixPart})(\\d+(?:\\.\\d+)?)`;
  } else if (suffixCharPart || suffixWordPart) {
    pattern = `(\\d+(?:\\.\\d+)?)(?:(${suffixCharPart})|(${suffixWordPart}))`;
  } else {
    throw new Error("currencyConfig must contain at least one symbol");
  }

  return new RegExp(pattern, "giu");
}

const regex = buildRegexFromConfig(currencyConfig);

function getCachedRates(): ExchangeRateCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) {
      return null;
    }

    const cache = JSON.parse(raw) as ExchangeRateCache;
    if (cache.version !== CACHE_VERSION) {
      return null;
    }
    if (Date.now() - cache.timestamp > CACHE_DURATION_MS) {
      return null;
    }
    return cache;
  } catch {
    return null;
  }
}

function setCachedRates(rates: Record<string, number>, timeLastUpdateUnix: number) {
  const cache: ExchangeRateCache = {
    version: CACHE_VERSION,
    timestamp: Date.now(),
    rates,
    time_last_update_unix: timeLastUpdateUnix,
  };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

async function fetchExchangeRates(): Promise<ExchangeRates | null> {
  try {
    const res = await fetch(API_URL);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }

    const data = (await res.json()) as ExchangeRateResponse;
    if (data.result === "success" && data.rates && data.time_last_update_unix) {
      return {
        rates: data.rates,
        time_last_update_unix: data.time_last_update_unix,
      };
    }
  } catch (error) {
    console.error("获取汇率失败:", error);
  }

  return null;
}

async function getExchangeRates(): Promise<ExchangeRates | null> {
  const cache = getCachedRates();
  if (cache) {
    return {
      rates: cache.rates,
      time_last_update_unix: cache.time_last_update_unix,
    };
  }

  const fetched = await fetchExchangeRates();
  if (fetched) {
    setCachedRates(fetched.rates, fetched.time_last_update_unix);
  }
  return fetched;
}

function parseMatchSymbolAmount(match: RegExpExecArray) {
  if (match[1] && match[2]) {
    return { symbol: match[1].toLowerCase(), amountStr: match[2] };
  }
  if (match[3]) {
    return { symbol: (match[4] || match[5]).toLowerCase(), amountStr: match[3] };
  }
  return null;
}

function convertAmountToCNY(
  amountStr: string,
  symbol: string,
  rates: Record<string, number>,
) {
  if (!rates.CNY) {
    return null;
  }

  const amount = Number.parseFloat(amountStr);
  const currency = currencyMap[symbol];
  if (!currency || !rates[currency]) {
    return null;
  }

  const rate = rates.CNY / rates[currency];
  return { amount, symbol, cnyValue: amount * rate, rate };
}

const tooltip = document.createElement("div");
Object.assign(tooltip.style, {
  position: "fixed",
  background: "rgba(0,0,0,0.75)",
  color: "#fff",
  padding: "6px 10px",
  borderRadius: "4px",
  fontSize: "12px",
  pointerEvents: "none",
  zIndex: "99999",
  transition: "opacity 0.2s",
  opacity: "0",
  maxWidth: "320px",
  whiteSpace: "pre-line",
  wordBreak: "break-word",
});
document.body.appendChild(tooltip);

function formatTimestamp(unixSeconds: number) {
  const date = new Date(unixSeconds * 1000);
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function showTooltip(text: string, x: number, y: number) {
  tooltip.textContent = text;
  const padding = 10;
  let left = x + padding;
  let top = y + padding;

  const rect = tooltip.getBoundingClientRect();
  if (left + rect.width > window.innerWidth) {
    left = x - rect.width - padding;
  }
  if (top + rect.height > window.innerHeight) {
    top = y - rect.height - padding;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
  tooltip.style.opacity = "1";
}

function hideTooltip() {
  tooltip.style.opacity = "0";
}

async function processTextNode(node: Text, cache: ExchangeRates) {
  if (node.parentNode instanceof Element && node.parentNode.classList.contains(PROCESSED_CLASS)) {
    return;
  }

  const text = node.nodeValue;
  if (!text) {
    return;
  }

  regex.lastIndex = 0;
  let lastIndex = 0;
  const fragment = document.createDocumentFragment();
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0];
    const index = match.index;

    if (index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, index)));
    }

    const parsed = parseMatchSymbolAmount(match);
    if (!parsed) {
      fragment.appendChild(document.createTextNode(fullMatch));
      lastIndex = index + fullMatch.length;
      continue;
    }

    const { symbol, amountStr } = parsed;
    const conversion = convertAmountToCNY(amountStr, symbol, cache.rates);
    if (conversion) {
      const span = document.createElement("span");
      span.textContent = fullMatch;
      span.style.cursor = "help";
      span.style.borderBottom = "1px dotted #999";
      span.classList.add(PROCESSED_CLASS);

      span.addEventListener("mousemove", (event) => {
        const rate = conversion.rate.toFixed(6);
        const updateTime = formatTimestamp(cache.time_last_update_unix);
        const tooltipText =
          `≈ ¥${conversion.cnyValue.toFixed(2)}\n` +
          `Rate (${conversion.symbol.toUpperCase()}→CNY): ${rate}\n` +
          `Last update: ${updateTime}`;
        showTooltip(tooltipText, event.clientX, event.clientY);
      });

      span.addEventListener("mouseleave", hideTooltip);
      fragment.appendChild(span);
    } else {
      fragment.appendChild(document.createTextNode(fullMatch));
    }

    lastIndex = index + fullMatch.length;
  }

  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }

  node.parentNode?.replaceChild(fragment, node);
}

async function scanAndProcessAll(cache: ExchangeRates) {
  console.log("[Currency Tooltip] 开始全局扫描...");
  const start = performance.now();

  const treeWalker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodesToProcess: Text[] = [];
  while (treeWalker.nextNode()) {
    const node = treeWalker.currentNode;
    if (!(node instanceof Text) || !node.nodeValue) {
      continue;
    }
    if (node.parentNode instanceof Element && node.parentNode.classList.contains(PROCESSED_CLASS)) {
      continue;
    }

    regex.lastIndex = 0;
    if (regex.test(node.nodeValue)) {
      nodesToProcess.push(node);
    }
  }

  for (const node of nodesToProcess) {
    await processTextNode(node, cache);
  }

  const end = performance.now();
  console.log(
    `[Currency Tooltip] 全局扫描完成，处理节点数：${nodesToProcess.length}，耗时：${(end - start).toFixed(2)}ms`,
  );
}

async function startDomLengthWatcher() {
  const cache = await getExchangeRates();
  if (!cache || !cache.rates) {
    console.warn("[Currency Tooltip] 无法获取汇率，终止处理");
    return;
  }

  await scanAndProcessAll(cache);

  const containers = Array.from(document.querySelectorAll(".post-list, .comments"));
  const lastCounts = new Map<Element, number>();

  containers.forEach((container) => {
    lastCounts.set(container, container.childElementCount);
  });

  window.setInterval(async () => {
    let changed = false;
    for (const container of [...containers]) {
      if (!document.body.contains(container)) {
        containers.splice(containers.indexOf(container), 1);
        lastCounts.delete(container);
        continue;
      }

      const currentCount = container.childElementCount;
      const lastCount = lastCounts.get(container) || 0;
      if (currentCount !== lastCount) {
        console.log(
          `[Currency Tooltip] 检测到容器 ${container.className} 子元素数变化：${lastCount} → ${currentCount}`,
        );
        lastCounts.set(container, currentCount);
        changed = true;
      }
    }

    if (changed) {
      await scanAndProcessAll(cache);
    }
  }, 1500);
}

function onReady(fn: () => void) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    window.setTimeout(fn, 0);
    return;
  }

  document.addEventListener("DOMContentLoaded", fn, { once: true });
}

onReady(() => {
  void startDomLengthWatcher();
});
