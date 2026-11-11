import { findReceivePrice } from "./price";
import { loadChinaLowest, loadInrPerCny } from "./quotes";

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
  GetMarketHashName?: (description: NonNullable<MarketItem["description"]>) => string;
  GetTotalWithFees?: (receive: number, publisherRate: number, steamRate: number, wallet: Wallet) => number;
  CalculateFee?: (receive: number, rate: number, wallet: Wallet) => number;
};

const DIALOG = "#market_sell_dialog";
const ROW = "kuusei-market-inr-prices";
const INR = 24;
const OPTIONS = [
  { offset: 0, label: "最低价" },
  { offset: 1, label: "-0.01" },
  { offset: 10, label: "-0.1" },
];
const boundRows = new WeakMap<Element, () => void>();

function readPage() {
  return (typeof unsafeWindow === "undefined" ? window : unsafeWindow) as unknown as SteamPage;
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
  const error = document.createElement("div");
  error.setAttribute("role", "alert");
  error.style.color = "#ff8585";
  row.append(group, error);
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
    for (const { offset, suffix, button, label } of choices) {
      const target = (lowest ?? 0) - offset;
      label.textContent = lowest === undefined
        ? suffix
        : `${target > 0 ? `￥${(target / 100).toFixed(2)}` : "—"}(${suffix})`;
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
    error.textContent = "";
    render();
    try {
      const appid = Number(item.appid);
      const marketHashName = item.description && readPage().GetMarketHashName?.(item.description);
      if (!Number.isSafeInteger(appid) || appid <= 0 || !marketHashName) {
        throw new Error("未读取到物品，请重新打开出售窗口。");
      }
      const price = await loadChinaLowest({ appid, marketHashName });
      if (!isCurrent(item, token)) return;
      lowest = price;
      quoteState = "ready";
    } catch (failure) {
      if (!isCurrent(item, token)) return;
      quoteState = "error";
      error.textContent = failure instanceof Error ? failure.message : "国区报价查询失败。";
    }
    render();
  };

  const sync = () => {
    const item = isVisible() ? readPage().SellItemDialog?.m_item : undefined;
    if (item === activeItem) return;
    activeItem = item;
    session++;
    lowest = undefined;
    filling = false;
    quoteState = "idle";
    error.textContent = "";
    if (item) void loadQuote(item);
    else render();
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

  const fill = async (offset: number) => {
    const target = (lowest ?? 0) - offset;
    if (filling || target <= 0 || !canFill()) return;
    const page = readPage();
    const steamDialog = page.SellItemDialog;
    const item = steamDialog?.m_item;
    const wallet = page.g_rgWalletInfo;
    const getTotal = page.GetTotalWithFees;
    const getFee = page.CalculateFee;
    if (!item || item !== activeItem) return;
    if (!steamDialog?.m_bInitialized || !wallet || !getTotal || !getFee
      || !steamDialog.GetPublisherFeeRate || !steamDialog.GetSteamFeeRate) {
      error.textContent = "未读取到物品或手续费，请重新打开出售窗口。";
      return;
    }
    if (Number(wallet.wallet_currency) !== INR) {
      error.textContent = "此脚本仅支持印度卢比钱包。";
      return;
    }

    const token = session;
    const previousReceive = receive.value;
    const previousBuyer = buyer.value;
    filling = true;
    error.textContent = "";
    render();
    const canApply = () => isCurrent(item, token) && canFill() && page.g_rgWalletInfo === wallet
      && receive.value === previousReceive && buyer.value === previousBuyer;

    try {
      const rate = await loadInrPerCny();
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
        (value) => getFee(value, publisherFee, wallet) + getFee(value, steamFee, wallet),
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
    button.addEventListener("click", () => void fill(offset));
  }
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
  style.textContent = "#market_sell_dialog:has(#kuusei-market-inr-prices) #kuusei-market-cn-sell{display:none}";
  document.head.append(style);
  mountSellDialogs();
  new MutationObserver(mountSellDialogs).observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
}
