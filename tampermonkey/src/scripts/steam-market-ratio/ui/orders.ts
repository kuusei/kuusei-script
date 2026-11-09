import { receivedFromBuyer, type FeeRule } from "../model/fees";
import { formatMoney, numberForPrice, parseDisplayedPrice, priceLabel, priceTextMatchesCurrency } from "../model/currencies";
import { ORDER_DEPTH, type OrderLevel } from "../model/order-book";

const MARK = "data-kuusei-ratio";
const TABLE = "data-kuusei-ratio-table";
const LEVEL = "data-kuusei-level";
const SUMMARY = "data-kuusei-summary";
const SUMMARY_EMPTY = "data-kuusei-summary-empty";

export type OrderTableState = {
  currency: number;
  rule: FeeRule;
  rate: number | null;
  unitCost: number | null;
  count: number | null;
  buy: OrderLevel[];
  sell: OrderLevel[];
  onDepthMismatch?: () => void;
};

type SummarySnapshot = {
  original: string[];
  rendered: string[];
};

const summaries = new WeakMap<HTMLTableRowElement, SummarySnapshot>();

function quantityOf(text: string) {
  return Number(text.replace(/[\s,.\u00a0\u202f]/g, ""));
}

function originalCells(row: HTMLTableRowElement) {
  return Array.from(row.cells).filter((cell) => !cell.hasAttribute(MARK));
}

function setStyledText(cell: HTMLElement, value: string) {
  if (cell.textContent === value) return;
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const target = nodes.find((node) => node.data.trim()) ?? nodes[0];
  if (!target) {
    cell.appendChild(document.createTextNode(value));
    return;
  }
  for (const node of nodes) node.data = node === target ? value : "";
}

function setContent(cell: HTMLElement, text: string, tip: string) {
  if (cell.textContent !== text) cell.textContent = text;
  cell.removeAttribute("title");
  if (tip) {
    if (cell.getAttribute("data-kuusei-tip") !== tip) cell.setAttribute("data-kuusei-tip", tip);
    cell.tabIndex = 0;
    return;
  }
  cell.removeAttribute("data-kuusei-tip");
  cell.removeAttribute("tabindex");
  cell.removeAttribute("aria-describedby");
}

function restoreSummary(row: HTMLTableRowElement) {
  const saved = summaries.get(row);
  if (saved) {
    originalCells(row).forEach((cell, index) => {
      const rendered = saved.rendered[index];
      const original = saved.original[index];
      if (rendered !== undefined && original !== undefined && cell.textContent === rendered) {
        setStyledText(cell, original);
      }
    });
    summaries.delete(row);
  }
  row.removeAttribute(SUMMARY);
  row.removeAttribute(SUMMARY_EMPTY);
}

function rememberSummary(row: HTMLTableRowElement, cells: HTMLTableCellElement[]) {
  const saved = summaries.get(row);
  if (!saved) {
    const original = cells.map((cell) => cell.textContent ?? "");
    const created = { original, rendered: [...original] };
    summaries.set(row, created);
    return created;
  }
  cells.forEach((cell, index) => {
    if (cell.textContent !== saved.rendered[index]) saved.original[index] = cell.textContent ?? "";
  });
  return saved;
}

function updateSummary(row: HTMLTableRowElement, extras: OrderLevel[], next: OrderLevel | undefined, currency: number) {
  const cells = originalCells(row);
  const saved = rememberSummary(row, cells);
  const remaining = quantityOf(saved.original[1] ?? "") - extras.reduce((sum, level) => sum + level.quantity, 0);
  const price = next
    ? (saved.original[0] ?? "").replace(/\d(?:[\d.,\s\u00a0\u202f]*\d)?(?:\.--)?/, numberForPrice(next.price, currency))
    : "更多";
  saved.rendered = [price, Math.max(0, remaining).toLocaleString("en-US")];
  cells.forEach((cell, index) => {
    const value = saved.rendered[index];
    if (value !== undefined) setStyledText(cell, value);
  });
  row.setAttribute(SUMMARY, "");
  row.toggleAttribute(SUMMARY_EMPTY, remaining <= 0);
}

function findOrderTables(root: ParentNode, currency: number) {
  return Array.from(root.querySelectorAll("table")).filter((table) => {
    const header = Array.from(table.rows).find((row) => row.querySelector("th"));
    if (!header || originalCells(header).length !== 2) return false;
    const rows = Array.from(table.rows).filter((row) => !row.querySelector("th") && !row.hasAttribute(LEVEL));
    const prices = rows.map((row) => originalCells(row)).filter((cells) => {
      const quantity = cells[1]?.textContent ?? "";
      return cells.length === 2
        && /^[\d,\.\s\u00a0\u202f]+$/.test(quantity)
        && parseDisplayedPrice(cells[0]?.textContent ?? "", currency) !== null;
    });
    return prices.length > 0
      && prices.length <= ORDER_DEPTH
      && prices.every((cells) => priceTextMatchesCurrency(cells[0]?.textContent ?? "", currency));
  });
}

function nativeRows(table: HTMLTableElement) {
  return Array.from(table.rows).filter((row) => !row.querySelector("th") && !row.hasAttribute(LEVEL));
}

function pricedRows(rows: HTMLTableRowElement[], currency: number) {
  return rows.flatMap((row) => {
    const cells = originalCells(row);
    const priceCell = cells[0];
    if (cells.length !== 2 || !priceCell) return [];
    const price = parseDisplayedPrice(priceCell.textContent ?? "", currency);
    return price === null ? [] : [{ row, price }];
  });
}

function writeLevel(row: HTMLTableRowElement, level: OrderLevel, currency: number) {
  const values = [priceLabel(level.price, currency), level.quantity.toLocaleString("en-US")];
  originalCells(row).forEach((cell, index) => {
    const value = values[index];
    if (value !== undefined) setStyledText(cell, value);
  });
}

function createLevelRow(template: HTMLTableRowElement, level: OrderLevel, currency: number) {
  const row = document.createElement("tr");
  row.className = template.className;
  row.setAttribute(LEVEL, String(level.price));
  for (const cell of originalCells(template)) {
    const copy = cell.cloneNode(true) as HTMLElement;
    copy.removeAttribute("id");
    copy.querySelectorAll("[id]").forEach((element) => element.removeAttribute("id"));
    row.appendChild(copy);
  }
  writeLevel(row, level, currency);
  return row;
}

function extendDepth(table: HTMLTableElement, state: OrderTableState) {
  const native = nativeRows(table);
  const rows = pricedRows(native, state.currency);
  const prices = rows.map((entry) => entry.price);
  const [firstPrice, secondPrice] = prices;
  const buy = firstPrice !== undefined && secondPrice !== undefined
    ? firstPrice > secondPrice
    : state.buy[0]?.price === firstPrice;
  const levels = buy ? state.buy : state.sell;
  const boundary = prices[prices.length - 1];
  const tail = boundary === undefined ? [] : levels.filter((level) => buy ? level.price < boundary : level.price > boundary);
  const extras = tail.slice(0, Math.max(0, ORDER_DEPTH - rows.length));
  const mismatch = rows.some((entry, index) => {
    return entry.price !== levels[index]?.price
      || quantityOf(originalCells(entry.row)[1]?.textContent ?? "") !== levels[index]?.quantity;
  });
  const desired = new Set(extras.map((level) => String(level.price)));
  table.querySelectorAll(`[${LEVEL}]`).forEach((row) => {
    if (!desired.has(row.getAttribute(LEVEL) ?? "")) row.remove();
  });

  const template = rows[0]?.row;
  if (!template) return;
  const summary = native.find((row) => {
    const cells = originalCells(row);
    return cells.length === 2 && parseDisplayedPrice(cells[0]?.textContent ?? "", state.currency) === null;
  });
  if (summary) {
    if (extras.length) updateSummary(summary, extras, tail[extras.length], state.currency);
    else restoreSummary(summary);
  }

  const parent = template.parentElement;
  if (!parent) return;
  let anchor: Element | null = summary?.parentElement === parent ? summary : null;
  for (const level of [...extras].reverse()) {
    let row = table.querySelector<HTMLTableRowElement>(`[${LEVEL}="${level.price}"]`);
    if (!row) row = createLevelRow(template, level, state.currency);
    else writeLevel(row, level, state.currency);
    if (row.parentElement !== parent || row.nextElementSibling !== anchor) parent.insertBefore(row, anchor);
    anchor = row;
  }
  if (mismatch) state.onDepthMismatch?.();
}

function ensureCell(row: HTMLTableRowElement, name: string, header: boolean) {
  let cell = row.querySelector<HTMLTableCellElement>(`[${MARK}="${name}"]`);
  if (!cell) {
    cell = document.createElement(header ? "th" : "td");
    cell.setAttribute(MARK, name);
    row.appendChild(cell);
  }
  return cell;
}

function fillColumns(table: HTMLTableElement, state: OrderTableState) {
  let level = 0;
  let cumulative = 0;
  for (const row of Array.from(table.rows)) {
    const cells = originalCells(row);
    const priceCell = cells[0];
    const quantityCell = cells[1];
    if (cells.length !== 2 || !priceCell || !quantityCell) continue;
    const header = !!row.querySelector("th");
    const price = header ? null : parseDisplayedPrice(priceCell.textContent ?? "", state.currency);
    const eligible = !header && price !== null && level++ < ORDER_DEPTH;
    const cumulativeCell = ensureCell(row, "cumulative", header);
    if (quantityCell.nextElementSibling !== cumulativeCell) {
      row.insertBefore(cumulativeCell, quantityCell.nextSibling);
    }
    const netCell = ensureCell(row, "net", header);
    const ratioCell = ensureCell(row, "ratio", header);
    const totalCell = ensureCell(row, "total", header);
    if (header) {
      setContent(cumulativeCell, "堆积数量", "从第一档累加到当前档的数量");
      setContent(netCell, "税后 (CNY)", "单件税后到手人民币");
      setContent(ratioCell, "比例", "单个人民币成本 ÷ 单件税后到手人民币");
      setContent(totalCell, "总金额 (CNY)", "单件税后金额 × 数量");
      continue;
    }
    fillBodyCells(state, quantityCell, cumulativeCell, netCell, ratioCell, totalCell, price, eligible, cumulative);
    const quantity = quantityOf(quantityCell.textContent ?? "");
    if (Number.isSafeInteger(quantity) && quantity >= 0) cumulative += quantity;
  }
}

function fillBodyCells(
  state: OrderTableState,
  quantityCell: HTMLTableCellElement,
  cumulativeCell: HTMLTableCellElement,
  netCell: HTMLTableCellElement,
  ratioCell: HTMLTableCellElement,
  totalCell: HTMLTableCellElement,
  price: number | null,
  eligible: boolean,
  cumulative: number,
) {
  const quantity = quantityOf(quantityCell.textContent ?? "");
  if (Number.isSafeInteger(quantity) && quantity >= 0) {
    setContent(cumulativeCell, (cumulative + quantity).toLocaleString("en-US"), "");
  } else {
    setContent(cumulativeCell, "—", "");
  }
  if (!eligible || price === null) {
    setContent(netCell, "—", "");
    setContent(ratioCell, "—", "");
    setContent(totalCell, "—", "");
    return;
  }
  const net = receivedFromBuyer(price, state.rule);
  const cny = state.rate === null ? null : (net / 100) * state.rate;
  setContent(netCell, cny !== null && net > 0 ? `¥${cny.toFixed(2)}` : "—", `税后 ${formatMoney(net, state.currency)}`);
  const ratio = cny !== null && cny > 0 && state.unitCost !== null ? state.unitCost / cny : null;
  const unitCost = state.unitCost;
  const ratioTip = ratio !== null && unitCost !== null
    ? `${(ratio * 100).toFixed(2)}% · 单个成本 ¥${unitCost.toFixed(4)}`
    : unitCost === null ? "请填写购买总价和数量" : "等待自动汇率";
  setContent(ratioCell, ratio !== null ? ratio.toFixed(4) : "—", ratioTip);
  const count = state.count;
  if (count === null) {
    setContent(totalCell, "—", "请填写购买总价和数量");
    return;
  }
  const totalNet = net * count;
  const totalCny = state.rate === null ? null : (totalNet / 100) * state.rate;
  setContent(
    totalCell,
    totalCny !== null && net > 0 ? `¥${totalCny.toFixed(2)}` : "—",
    `${count} 个 · 税后合计 ${formatMoney(totalNet, state.currency)}`,
  );
}

export function updateOrderTables(root: ParentNode, state: OrderTableState) {
  const tables = findOrderTables(root, state.currency);
  for (const table of tables) {
    table.setAttribute(TABLE, "");
    extendDepth(table, state);
    fillColumns(table, state);
  }
  for (const table of Array.from(root.querySelectorAll<HTMLTableElement>(`table[${TABLE}]`))) {
    if (tables.includes(table)) continue;
    releaseTable(table);
  }
  return tables;
}

function releaseTable(table: HTMLTableElement) {
  table.querySelectorAll(`[${LEVEL}]`).forEach((row) => row.remove());
  table.querySelectorAll(`[${SUMMARY}]`).forEach((row) => {
    if (row instanceof HTMLTableRowElement) restoreSummary(row);
  });
  table.querySelectorAll(`[${MARK}]`).forEach((cell) => cell.remove());
  table.removeAttribute(TABLE);
}

export function clearOrderTables(root: ParentNode) {
  root.querySelectorAll(`[${LEVEL}]`).forEach((row) => row.remove());
  root.querySelectorAll(`[${SUMMARY}]`).forEach((row) => {
    if (row instanceof HTMLTableRowElement) restoreSummary(row);
  });
  root.querySelectorAll(`[${MARK}]`).forEach((cell) => cell.remove());
  root.querySelectorAll(`[${TABLE}]`).forEach((table) => table.removeAttribute(TABLE));
}
