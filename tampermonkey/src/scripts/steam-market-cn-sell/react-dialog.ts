import { totalWithFees, validPrice, type FeeRule } from "../steam-market-ratio/model/fees";

export type Wallet = {
  wallet_currency?: number | string;
  wallet_market_minimum?: number | string;
  wallet_currency_increment?: number | string;
  wallet_trade_max_balance?: number | string;
  wallet_publisher_fee_percent_default?: number | string;
  wallet_fee_percent?: number | string;
};

export type MarketItem = {
  appid?: number | string;
  contextid?: number | string;
  assetid?: number | string;
  description?: { market_hash_name?: string; market_name?: string; name?: string };
};

type Currency = { eCurrency: number; bWholeUnitsOnly: boolean };
type Prices = {
  currency: number;
  sellerPrice?: number;
  buyerPrice?: number;
  sellerInputRef: object;
  onSellerPriceChange?: (price: number) => void;
};
type NativeSale = { item: MarketItem; walletInfo: Wallet; newFeeRates: boolean };
type FeeEntry = { ecurrency?: number; fee_rate?: number; fee_cap?: number | string };
type NativeFees = { steam_fee?: FeeEntry; publisher_fee?: FeeEntry };
type QueryClient = { getQueryData: (key: unknown[]) => NativeFees | undefined };
type Fiber = {
  memoizedProps?: Record<string, unknown>;
  return?: Fiber;
  child?: Fiber;
  stateNode?: HTMLElement & { current?: Fiber };
  alternate?: Fiber;
  sibling?: Fiber;
};

export type ReactSale = NativeSale & {
  input: HTMLInputElement;
  prices: Prices;
  currency: Currency;
  root: HTMLElement;
  fees?: NativeFees;
};

function supported(currency: unknown) {
  return Number(currency) === 24 || Number(currency) === 18;
}

function committedAncestry(fiber: Fiber | undefined): Fiber[] {
  const original: Fiber[] = [];
  const candidates = new Set<Fiber>();
  for (let node = fiber; node; node = node.return) {
    original.push(node);
    candidates.add(node);
    if (node.alternate) candidates.add(node.alternate);
  }
  let current = original[original.length - 1]?.stateNode?.current;
  if (!current) return original;
  const committed: Fiber[] = [];
  while (current) {
    committed.push(current);
    if (current === fiber || current === fiber?.alternate) return committed.reverse();
    let child: Fiber | undefined = current.child;
    while (child && !candidates.has(child)) child = child.sibling;
    current = child;
  }
  return original;
}

export function readReactSale(input: HTMLInputElement, sellerOnly = true): ReactSale | undefined {
  const key = Object.keys(input).find((name) => name.startsWith("__reactFiber$"));
  let inputFiber = key ? (input as unknown as Record<string, Fiber>)[key] : undefined;
  const propsKey = Object.keys(input).find((name) => name.startsWith("__reactProps$"));
  const currentProps = propsKey ? (input as unknown as Record<string, unknown>)[propsKey] : undefined;
  if (currentProps && inputFiber?.alternate?.memoizedProps === currentProps) inputFiber = inputFiber.alternate;
  let prices: Prices | undefined;
  let sale: NativeSale | undefined;
  let currency: Currency | undefined;
  let inputRef: unknown;
  let root: HTMLElement | undefined;
  let client: QueryClient | undefined;
  for (const fiber of committedAncestry(inputFiber)) {
    const props = fiber.memoizedProps;
    if (!props) continue;
    if (!currency && props.currency && typeof props.currency === "object") {
      currency = props.currency as Currency;
      inputRef = props.inputRef;
    }
    if ("sellerPrice" in props && "buyerPrice" in props && "sellerInputRef" in props) {
      prices = props as unknown as Prices;
      let host: Fiber | undefined = fiber.child;
      while (host && !host.stateNode?.tagName) host = host.child;
      root = host?.stateNode;
    }
    if (props.item && props.walletInfo) sale = props as unknown as NativeSale;
    if (props.client && typeof (props.client as QueryClient).getQueryData === "function") {
      client = props.client as QueryClient;
    }
  }
  if (!sale || !prices || !currency || !root || (sellerOnly && (!inputRef || inputRef !== prices.sellerInputRef))
    || !supported(prices.currency) || Number(sale.walletInfo.wallet_currency) !== prices.currency
    || currency.eCurrency !== prices.currency) return;
  return {
    ...sale, input, prices, currency, root,
    fees: client?.getQueryData(["inventory", "sellfees", sale.item.appid, sale.newFeeRates]),
  };
}

export function reactSales(doc: Document) {
  return Array.from(doc.querySelectorAll<HTMLInputElement>('input[type="text"]'))
    .flatMap((input) => {
      const sale = readReactSale(input);
      return sale ? [sale] : [];
    });
}

export function reactFeeRule(sale: ReactSale): FeeRule | undefined {
  const { steam_fee: steam, publisher_fee: publisher } = sale.fees ?? {};
  if (!steam || !publisher || ![steam.fee_rate, publisher.fee_rate].every((rate) => typeof rate === "number" && Number.isFinite(rate))) return;
  if ([steam, publisher].some((fee) => fee.ecurrency !== undefined && fee.ecurrency !== sale.prices.currency)) return;
  return {
    steamRate: steam.fee_rate!, publisherRate: publisher.fee_rate!,
    minimum: Number(sale.walletInfo.wallet_market_minimum ?? 1),
    increment: Number(sale.walletInfo.wallet_currency_increment ?? 1),
    steamCap: Number(steam.fee_cap ?? 0), publisherCap: Number(publisher.fee_cap ?? 0),
  };
}

export function reactBuyerTotal(sale: ReactSale, receive: number) {
  const rule = reactFeeRule(sale);
  return rule ? totalWithFees(receive, rule) : NaN;
}

const decimalDrafts = new WeakMap<HTMLInputElement, { text: string; amount: number; start: number | null; end: number | null }>();
const decimalInputs = new WeakSet<HTMLInputElement>();

function refreshReactDecimals(input: HTMLInputElement) {
  const current = readReactSale(input);
  if (current) enableReactDecimals(current);
}

export function setReactReceive(input: HTMLInputElement, amount: number) {
  const current = readReactSale(input);
  if (!current?.prices.onSellerPriceChange) throw new Error("Steam 金额参数无效。");
  decimalDrafts.delete(input);
  enableReactDecimals(current);
  current.prices.onSellerPriceChange(amount);
  // The first fill can change only input properties, with no DOM mutation to wake the observer.
  setTimeout(() => refreshReactDecimals(input), 0);
}

export function enableReactDecimals(sale: ReactSale) {
  // This flag controls parsing and display only. Keep native fee minima and increments intact.
  sale.currency.bWholeUnitsOnly = false;
  sale.input.inputMode = "decimal";
  const input = sale.input;
  if (!decimalInputs.has(input)) {
    decimalInputs.add(input);
    const refresh = () => refreshReactDecimals(input);
    input.addEventListener("input", () => {
      const current = readReactSale(input);
      if (current) current.currency.bWholeUnitsOnly = false;
      decimalDrafts.set(input, {
        text: input.value, amount: Math.round(Number.parseFloat(input.value) * 100),
        start: input.selectionStart, end: input.selectionEnd,
      });
      setTimeout(refresh, 0);
    }, true);
    input.addEventListener("blur", () => {
      decimalDrafts.delete(input);
      setTimeout(refresh, 0);
    }, true);
  }
  // Steam creates fresh currency metadata on render. Keep the DOM text aligned with its exact React state.
  const draft = input.ownerDocument.activeElement === input ? decimalDrafts.get(input) : undefined;
  const text = draft && draft.amount === sale.prices.sellerPrice ? draft.text
    : sale.prices.sellerPrice === undefined ? "" : (sale.prices.sellerPrice / 100).toFixed(2);
  if (input.value !== text) {
    input.value = text;
    if (draft && draft.amount === sale.prices.sellerPrice) input.setSelectionRange(draft.start, draft.end);
  }
}

type SalePrice = Pick<ReactSale, "item" | "walletInfo" | "prices">;

export function exactSellBody(body: URLSearchParams, sale: SalePrice) {
  const { item, prices, walletInfo } = sale;
  if (!supported(walletInfo.wallet_currency)
    || !item.assetid || body.get("appid") !== String(item.appid)
    || body.get("contextid") !== String(item.contextid) || body.get("assetid") !== String(item.assetid)) return;
  const amount = prices.sellerPrice;
  const minimum = Number(walletInfo.wallet_market_minimum ?? 1);
  const increment = Number(walletInfo.wallet_currency_increment ?? 1);
  if (!Number.isSafeInteger(amount) || amount! < minimum || !Number.isSafeInteger(increment) || increment <= 0) {
    throw new Error("Steam 金额参数无效。");
  }
  const rounded = validPrice(amount!, { minimum, increment, publisherRate: 0, steamRate: 0 }, true);
  if (Number(body.get("price")) !== rounded) throw new Error("Steam 金额参数无效。");
  const next = new URLSearchParams(body);
  next.set("price", String(amount));
  return next;
}

export function preserveReactSellPrice(page: Window & typeof globalThis) {
  const nativeFetch = page.fetch;
  const marker = "kuuseiSteamCnExactPrice";
  if ((nativeFetch as unknown as Record<string, unknown>)[marker]) return;
  page.fetch = function (input, init) {
    const url = new URL(typeof input === "string" ? input : "url" in input ? input.url : input.href, page.location.href);
    if (url.origin === page.location.origin && url.pathname === "/market/sellitem/"
      && init?.method?.toUpperCase() === "POST" && init.body) {
      const body = new URLSearchParams(String(init.body));
      for (const sale of reactSales(page.document)) {
        const corrected = exactSellBody(body, sale);
        if (corrected) return nativeFetch.call(page, input, { ...init, body: corrected });
      }
    }
    return nativeFetch.call(page, input, init);
  };
  Object.defineProperty(page.fetch, marker, { value: true });
}
