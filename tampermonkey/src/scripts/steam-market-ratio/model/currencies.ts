// Steam wallet currencies. Comma-decimal currencies display "," as the decimal mark.
const COMMA_DECIMALS = new Set([3, 5, 6, 7, 9, 15, 17, 18, 25, 27, 34, 37, 40, 41]);

export const CURRENCIES: Record<number, string> = {
  1: "USD", 2: "GBP", 3: "EUR", 4: "CHF", 5: "RUB", 6: "PLN", 7: "BRL", 8: "JPY",
  9: "NOK", 10: "IDR", 11: "MYR", 12: "PHP", 13: "SGD", 14: "THB", 15: "VND", 16: "KRW",
  17: "TRY", 18: "UAH", 19: "MXN", 20: "CAD", 21: "AUD", 22: "NZD", 23: "CNY", 24: "INR",
  25: "CLP", 26: "PEN", 27: "COP", 28: "ZAR", 29: "HKD", 30: "TWD", 31: "SAR", 32: "AED",
  33: "SEK", 34: "ARS", 35: "ILS", 36: "BYN", 37: "KZT", 38: "KWD", 39: "QAR", 40: "CRC",
  41: "UYU", 42: "BGN", 43: "HRK", 44: "CZK", 45: "DKK", 46: "HUF", 47: "RON",
};

const SYMBOLS: Record<number, string> = {
  1: "$", 2: "£", 3: "€", 4: "CHF", 5: "руб.", 6: "zł", 7: "R$", 8: "¥",
  9: "kr", 10: "Rp", 11: "RM", 12: "P", 13: "S$", 14: "฿", 15: "₫", 16: "₩",
  17: "TL", 18: "₴", 19: "Mex$", 20: "CDN$", 21: "A$", 22: "NZ$", 23: "¥", 24: "₹",
  25: "CLP$", 26: "S/.", 27: "COL$", 28: "R", 29: "HK$", 30: "NT$", 31: "SR", 32: "AED",
  33: "kr", 34: "ARS$", 35: "₪", 36: "Br", 37: "₸", 38: "KD", 39: "QR", 40: "₡",
  41: "$U", 42: "лв", 43: "kn", 44: "Kč", 45: "kr.", 46: "Ft", 47: "lei",
};

export function formatMoney(amount: number, currency: number) {
  const formatted = (amount / 100).toFixed(2);
  const code = CURRENCIES[currency];
  return code ? `${formatted} ${code}` : `${formatted}（币种 #${currency}）`;
}

export function numberForPrice(price: number, currency: number) {
  const amount = price % 100 === 0 ? String(price / 100) : (price / 100).toFixed(2);
  return COMMA_DECIMALS.has(currency) ? amount.replace(".", ",") : amount;
}

export function priceLabel(price: number, currency: number) {
  const symbol = SYMBOLS[currency] ?? CURRENCIES[currency];
  return `${symbol} ${numberForPrice(price, currency)}`;
}

export function priceTextMatchesCurrency(text: string, currency: number) {
  const symbol = SYMBOLS[currency];
  const code = CURRENCIES[currency];
  return !!symbol && (text.includes(symbol) || (code !== undefined && text.includes(code)));
}

export function parseDisplayedPrice(text: string, currency: number) {
  let amount = text.trim();
  for (const symbol of [CURRENCIES[currency], SYMBOLS[currency]]) {
    if (symbol) amount = amount.replace(symbol, "");
  }
  amount = amount.replace(/[\s\u00a0\u202f]/g, "").replace(/\.--$/, ".00");
  const decimal = COMMA_DECIMALS.has(currency) ? "," : ".";
  const thousands = decimal === "," ? "." : ",";
  amount = amount.split(thousands).join("");
  if (decimal !== ".") amount = amount.replace(decimal, ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) return null;
  const price = Math.round(Number(amount) * 100);
  return Number.isSafeInteger(price) && price > 0 ? price : null;
}
