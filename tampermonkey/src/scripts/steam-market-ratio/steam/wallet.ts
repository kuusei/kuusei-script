import { validateRule, type FeeRule } from "../model/fees";
import { isRecord } from "../model/record";
import { fetchText } from "./http";

export type WalletInfo = {
  wallet_market_minimum?: unknown;
  wallet_fee_minimum?: unknown;
  wallet_currency_increment?: unknown;
  wallet_fee_base?: unknown;
  wallet_fee?: unknown;
  wallet_currency?: unknown;
  wallet_country?: unknown;
};

function feeCap(fees: unknown, name: "steam_fee" | "publisher_fee") {
  if (!isRecord(fees)) return 0;
  const entry = fees[name];
  if (!isRecord(entry)) return 0;
  return Number(entry.fee_cap ?? 0);
}

function feesEnabled(flag: unknown) {
  return flag === undefined || (flag !== false && flag !== 0 && flag !== "0");
}

export function feeRuleFromWallet(wallet: WalletInfo, fees?: unknown): FeeRule {
  const rule: FeeRule = {
    steamRate: 0.05,
    publisherRate: 0.1,
    minimum: Number(wallet.wallet_market_minimum ?? wallet.wallet_fee_minimum ?? 1),
    increment: Number(wallet.wallet_currency_increment ?? 1),
    base: Number(wallet.wallet_fee_base ?? 0),
    steamCap: feeCap(fees, "steam_fee"),
    publisherCap: feeCap(fees, "publisher_fee"),
    enabled: feesEnabled(wallet.wallet_fee),
  };
  validateRule(rule);
  return rule;
}

let walletRequest: Promise<WalletInfo> | null = null;

export function loadWallet() {
  if (!walletRequest) {
    walletRequest = fetchText("/market/userbillinginfo").then((raw) => {
      const parsed: unknown = JSON.parse(raw);
      const wallet = isRecord(parsed) ? parsed.wallet_info : undefined;
      if (!isRecord(wallet) || !Number(wallet.wallet_currency)) {
        throw new Error("请先登录 Steam。");
      }
      return wallet as WalletInfo;
    }).catch((error: unknown) => {
      walletRequest = null;
      throw error;
    });
  }
  return walletRequest;
}
