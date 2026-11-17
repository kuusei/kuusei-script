import { findReceivePrice, parseCnyAmount } from "./price";
import { loadChinaLowest, loadChinaOrderBook, loadCurrencyPerCny } from "./quotes";

type Wallet = {
  wallet_currency?: number | string;
  wallet_market_minimum?: number | string;
  wallet_trade_max_balance?: number | string;
};

type MarketItem = {
  appid?: number | string;
  description?: { market_hash_name?: string; market_name?: string; name?: string };
};

type SteamPage = {
  g_rgWalletInfo?: Wallet;
  SellItemDialog?: {
    m_bInitialized?: boolean;
    m_item?: MarketItem;
    GetPublisherFeeRate?: () => number;
    GetSteamFeeRate?: () => number;
  };
  GetCurrencyCode?: (currencyId: number) => string;
  GetMarketHashName?: (description: NonNullable<MarketItem["description"]>) => string;
  GetTotalWithFees?: (receive: number, publisherRate: number, steamRate: number, wallet: Wallet) => number;
  CalculateFee?: (receive: number, rate: number, wallet: Wallet) => number;
};

const DIALOG = "#market_sell_dialog";
const ROW = "kuusei-market-cn-prices";
const OPTIONS = [
  { offset: 0, label: "最低价" },
  { offset: 1, label: "-0.01" },
  { offset: 10, label: "-0.1" },
];
const boundRows = new WeakMap<Element, () => void>();

function readPage() {
  return (typeof unsafeWindow === "undefined" ? window : unsafeWindow) as unknown as SteamPage;
}

function readItemKey(item: MarketItem) {
  const appid = Number(item.appid);
  const marketHashName = item.description && readPage().GetMarketHashName?.(item.description);
  if (!Number.isSafeInteger(appid) || appid <= 0 || !marketHashName) {
    throw new Error("未读取到物品，请重新打开出售窗口。");
  }
  return { appid, marketHashName };
}

function formatCny(cents: number) {
  return `¥ ${(cents / 100).toFixed(2)}`;
}

function createOrderTable(title: string, levels: Awaited<ReturnType<typeof loadChinaOrderBook>>["buy"]) {
  const table = document.createElement("table");
  table.className = "market_commodity_orders_table";
  table.createCaption().textContent = title;
  const header = table.createTHead().insertRow();
  for (const name of ["价格", "数量"]) {
    const cell = document.createElement("th");
    cell.scope = "col";
    cell.textContent = name;
    header.append(cell);
  }
  const body = table.createTBody();
  for (const { price, quantity } of levels) {
    const row = body.insertRow();
    row.insertCell().textContent = formatCny(price);
    row.insertCell().textContent = quantity.toLocaleString("zh-CN");
  }
  if (!levels.length) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = 2;
    cell.textContent = "暂无挂单";
  }
  return table;
}

function createButton(text: string) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn_grey_white_innerfade btn_small";
  const label = document.createElement("span");
  label.textContent = text;
  button.append(label);
  return { button, label };
}

function mount(dialog: HTMLElement) {
  const area = dialog.querySelector("#market_sell_dialog_input_area");
  const receive = dialog.querySelector<HTMLInputElement>("#market_sell_currency_input");
  const buyer = dialog.querySelector<HTMLInputElement>("#market_sell_buyercurrency_input");
  if (!area || !receive || !buyer) return;
  const existing = area.querySelector(`#${ROW}`);
  const syncExisting = existing && boundRows.get(existing);
  if (syncExisting) {
    syncExisting();
    return;
  }
  existing?.remove();

  const row = document.createElement("div");
  row.id = ROW;
  row.style.marginTop = "8px";
  row.style.textAlign = "left";
  const group = document.createElement("div");
  group.style.cssText = "display:flex;flex-wrap:wrap;justify-content:center;gap:6px";
  const choices = OPTIONS.map(({ offset, label }) => ({ offset, suffix: label, ...createButton(label) }));
  group.append(...choices.map(({ button }) => button));
  const retry = createButton("重试").button;
  group.append(retry);
  const manual = document.createElement("div");
  manual.style.cssText = `${group.style.cssText};align-items:center;margin-top:8px`;
  const targetLabel = document.createElement("label");
  targetLabel.className = "market_sell_dialog_field_label";
  targetLabel.htmlFor = `${ROW}-custom`;
  targetLabel.textContent = "国区目标价 ¥";
  const customPrice = document.createElement("input");
  customPrice.id = targetLabel.htmlFor;
  customPrice.type = "text";
  customPrice.inputMode = "decimal";
  customPrice.className = receive.className;
  customPrice.style.width = "6em";
  const applyPrice = createButton("换算填入").button;
  manual.append(targetLabel, customPrice, applyPrice);
  const error = document.createElement("div");
  error.setAttribute("role", "alert");
  error.style.color = "#ff8585";
  const quoteError = error.cloneNode() as HTMLDivElement;
  const orderStatus = document.createElement("div");
  orderStatus.setAttribute("role", "status");
  const retryOrders = createButton("重试盘口").button;
  const tables = document.createElement("div");
  tables.className = "market_commodity_orders_table_container";
  row.append(group, quoteError, manual, error, tables, orderStatus, retryOrders);
  const inputs = area.querySelector("#market_sell_dialog_input_boxes");
  if (inputs?.parentNode) inputs.parentNode.insertBefore(row, inputs.nextSibling);
  else area.prepend(row);

  let activeItem: MarketItem | undefined;
  let lowest: number | undefined;
  let quoteState: "idle" | "loading" | "ready" | "error" = "idle";
  let filling = false;
  const isVisible = () => dialog.isConnected && receive.getClientRects().length > 0;
  const canFill = () => isVisible() && !receive.disabled && !buyer.disabled;

  const render = () => {
    group.setAttribute("aria-busy", String(quoteState === "loading" || filling));
    retry.style.display = quoteState === "error" ? "" : "none";
    customPrice.disabled = !activeItem || filling || receive.disabled || buyer.disabled;
    applyPrice.disabled = customPrice.disabled || !customPrice.value.trim();
    for (const { offset, suffix, button, label } of choices) {
      const target = (lowest ?? 0) - offset;
      label.textContent = lowest === undefined
        ? suffix
        : `${target > 0 ? formatCny(target) : "—"} ${suffix}`;
      button.disabled = target <= 0 || receive.disabled || buyer.disabled;
      button.setAttribute("aria-disabled", String(button.disabled || filling));
    }
  };

  let session = 0;
  const isCurrent = (item: MarketItem, token: number) => token === session && isVisible()
    && readPage().SellItemDialog?.m_item === item;

  const loadQuote = async (item: MarketItem) => {
    const token = session;
    quoteState = "loading";
    quoteError.textContent = "";
    render();
    try {
      const price = await loadChinaLowest(readItemKey(item));
      if (!isCurrent(item, token) || quoteState !== "loading") return;
      lowest = price;
      quoteState = "ready";
    } catch (failure) {
      if (!isCurrent(item, token) || quoteState !== "loading") return;
      quoteState = "error";
      quoteError.textContent = failure instanceof Error ? failure.message : "国区报价查询失败。";
    }
    render();
  };

  const loadOrderBook = async (item: MarketItem) => {
    const token = session;
    retryOrders.hidden = true;
    orderStatus.textContent = "正在查询国区买卖价…";
    try {
      const { buy, sell } = await loadChinaOrderBook(readItemKey(item));
      if (!isCurrent(item, token)) return;
      tables.replaceChildren(createOrderTable("国区在售", sell), createOrderTable("国区求购", buy));
      tables.hidden = false;
      orderStatus.textContent = "";
      lowest = sell[0]?.price;
      quoteState = "ready";
      quoteError.textContent = "";
      render();
    } catch (failure) {
      if (!isCurrent(item, token)) return;
      orderStatus.textContent = failure instanceof Error ? failure.message : "国区盘口查询失败。";
      retryOrders.hidden = false;
      if (lowest === undefined && quoteState !== "loading") void loadQuote(item);
    }
  };

  const sync = () => {
    const item = isVisible() ? readPage().SellItemDialog?.m_item : undefined;
    if (item === activeItem) return;
    activeItem = item;
    session++;
    lowest = undefined;
    customPrice.value = "";
    filling = false;
    quoteState = "idle";
    error.textContent = "";
    quoteError.textContent = "";
    tables.hidden = true;
    tables.replaceChildren();
    orderStatus.textContent = "";
    retryOrders.hidden = true;
    render();
    if (item) void loadOrderBook(item);
  };

  const observer = new MutationObserver(() => { sync(); render(); });
  observer.observe(dialog, { attributes: true, attributeFilter: ["open", "style"] });
  for (const field of [receive, buyer]) {
    observer.observe(field, { attributes: true, attributeFilter: ["disabled"] });
  }
  boundRows.set(row, sync);
  render();
  sync();
  retry.addEventListener("click", () => {
    if (activeItem && quoteState === "error" && canFill()) void loadQuote(activeItem);
  });
  retryOrders.addEventListener("click", () => {
    if (activeItem && !retryOrders.hidden && canFill()) void loadOrderBook(activeItem);
  });

  const fill = async (target: number) => {
    if (filling || target <= 0 || !canFill()) return;
    const page = readPage();
    const steamDialog = page.SellItemDialog;
    const item = steamDialog?.m_item;
    const wallet = page.g_rgWalletInfo;
    const getTotal = page.GetTotalWithFees;
    const getFee = page.CalculateFee;
    const currency = page.GetCurrencyCode?.(Number(wallet?.wallet_currency));
    if (!item || item !== activeItem) return;
    if (!steamDialog?.m_bInitialized || !wallet || !getTotal || !currency
      || (currency === "INR" && !getFee)
      || !steamDialog.GetPublisherFeeRate || !steamDialog.GetSteamFeeRate) {
      error.textContent = "未读取到物品或手续费，请重新打开出售窗口。";
      return;
    }
    if (currency !== "INR" && currency !== "UAH") {
      error.textContent = "此脚本支持印度卢比和乌克兰格里夫纳钱包。";
      return;
    }

    const token = session;
    const previousReceive = receive.value;
    const previousBuyer = buyer.value;
    filling = true;
    error.textContent = "";
    render();
    const canApply = () => isCurrent(item, token) && canFill() && page.g_rgWalletInfo === wallet
      && page.GetCurrencyCode?.(Number(wallet.wallet_currency)) === currency
      && receive.value === previousReceive && buyer.value === previousBuyer;

    try {
      const rate = await loadCurrencyPerCny(currency);
      if (!canApply()) return;

      const publisherFee = steamDialog.GetPublisherFeeRate();
      const steamFee = steamDialog.GetSteamFeeRate();
      if (![publisherFee, steamFee].every((fee) => Number.isFinite(fee) && fee >= 0)) {
        throw new Error("Steam 手续费参数无效。");
      }
      const amount = findReceivePrice(
        target,
        rate,
        Number(wallet.wallet_market_minimum ?? 1),
        Number(wallet.wallet_trade_max_balance),
        (value) => getTotal(value, publisherFee, steamFee, wallet),
        currency === "INR" && getFee
          ? (value) => getFee(value, publisherFee, wallet) + getFee(value, steamFee, wallet)
          : undefined,
      );
      if (amount === null) throw new Error("目标售价低于 Steam 最低售价。");

      receive.value = (amount / 100).toFixed(2);
      // The native keyup handler fills the buyer field and updates the total.
      receive.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    } catch (failure) {
      if (canApply()) error.textContent = failure instanceof Error ? failure.message : "填价失败，请重试。";
    } finally {
      if (token === session) {
        filling = false;
        render();
      }
    }
  };
  for (const { button, offset } of choices) {
    button.addEventListener("click", () => void fill((lowest ?? 0) - offset));
  }
  const fillCustomPrice = () => {
    const target = parseCnyAmount(customPrice.value);
    if (target === null) error.textContent = "请输入大于零且最多两位小数的国区价格。";
    else void fill(target);
  };
  customPrice.addEventListener("input", render);
  customPrice.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.isComposing && !applyPrice.disabled) fillCustomPrice();
  });
  applyPrice.addEventListener("click", fillCustomPrice);
}

function mountSellDialogs() {
  document.querySelectorAll<HTMLElement>(DIALOG).forEach(mount);
}

function isInventoryFrame(url: URL) {
  return /^\/(?:my|id\/[^/]+|profiles\/\d+)\/inventory\/?$/.test(url.pathname)
    && url.searchParams.get("modal") === "1" && url.searchParams.get("market") === "1";
}

// The market's Sell button opens the same inventory dialog in a Steam iframe.
if (window.top === window || isInventoryFrame(new URL(location.href))) {
  // The renamed script can coexist with an earlier install during the update.
  const style = document.createElement("style");
  style.textContent = `
    ${DIALOG}:has(#${ROW}) :is(#kuusei-market-cn-sell, #kuusei-market-inr-prices) { display: none; }
    #${ROW} [hidden] { display: none; }
    #${ROW} .market_commodity_orders_table_container:not([hidden]) {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 8px;
      margin-top: 8px;
    }
    #${ROW} .market_commodity_orders_table { width: 100%; margin: 0; text-align: center; }
    #${ROW} .market_commodity_orders_table :is(th, td) { min-width: 0; padding: 2px 4px; }
    #${ROW} .market_commodity_orders_table tbody tr:nth-child(odd) { background: #1b2939; }
    #${ROW} .market_commodity_orders_table tbody tr:nth-child(even) { background: transparent; }
  `;
  document.head.append(style);
  mountSellDialogs();
  new MutationObserver(mountSellDialogs).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
}
