/**
 * Groww Order History Parser
 *
 * Parses the "Stocks Order History" .xlsx export from Groww.
 *
 * This export differs from the generic Groww transaction history:
 * - It has a few metadata/title rows before the real header row
 *   (the header row is located dynamically via the "Stock name" cell).
 * - It reports a total "Value" per order (not a per-share price), so the
 *   price per share is derived as Value / Quantity.
 * - "Execution date and time" is formatted like "06-05-2021 09:48 AM".
 * - An "Order status" column is present; only executed orders are imported.
 *
 * Expected header columns:
 *   Stock name | Symbol | ISIN | Type | Quantity | Value | Exchange |
 *   Exchange Order Id | Execution date and time | Order status
 *
 * Ported from the standalone parseOrders.js script.
 */

import { Platform } from "react-native";
import type { TransactionSourceParser } from "../types";
import type { ParsedTransaction, TransactionParseResult } from "../../../types/transaction";

/**
 * Column header (normalized, lower-cased) -> logical field name.
 */
const COLUMN_MAP: Record<string, keyof ColumnIndices> = {
  "stock name": "stockName",
  symbol: "symbol",
  isin: "isin",
  type: "type",
  quantity: "quantity",
  value: "value",
  exchange: "exchange",
  "execution date and time": "date",
  "order status": "status",
};

interface ColumnIndices {
  stockName: number;
  symbol: number;
  isin: number;
  type: number;
  quantity: number;
  value: number;
  exchange: number;
  date: number;
  status: number;
}

/** Order statuses that indicate the trade did NOT execute — these are skipped. */
const NON_EXECUTED_STATUSES = ["cancelled", "canceled", "rejected", "failed", "expired", "pending"];

const normalize = (value: unknown): string => String(value ?? "").trim().toLowerCase();

const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value.replace(/[$₹,\s]/g, "").trim();
    if (cleaned === "" || cleaned === "-") return null;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Convert "06-05-2021 09:48 AM" (or a JS Date, or ISO string) to an ISO 8601 string.
 * Mirrors the toIsoDate() helper from the original parseOrders.js script.
 */
const toIsoDate = (value: unknown): string | null => {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === "string") {
    const trimmed = value.trim();

    const match = trimmed.match(/^(\d{2})-(\d{2})-(\d{4})\s+(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (match) {
      const [, dd, mm, yyyy, hhRaw, min, ampm] = match;
      let hh = parseInt(hhRaw, 10);
      if (/pm/i.test(ampm) && hh !== 12) hh += 12;
      if (/am/i.test(ampm) && hh === 12) hh = 0;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd), hh, Number(min));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    // DD-MM-YYYY (no time)
    const dateOnly = trimmed.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dateOnly) {
      const [, dd, mm, yyyy] = dateOnly;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      return Number.isNaN(d.getTime()) ? null : d.toISOString();
    }

    const generic = new Date(trimmed);
    return Number.isNaN(generic.getTime()) ? null : generic.toISOString();
  }
  return null;
};

const parseTransactionType = (value: unknown): "BUY" | "SELL" | null => {
  const str = normalize(value);
  if (str === "buy" || str === "b" || str === "bought" || str === "purchase") return "BUY";
  if (str === "sell" || str === "s" || str === "sold" || str === "sale") return "SELL";
  return null;
};

const isRowEmpty = (row: unknown[]): boolean =>
  row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");

/**
 * Locate the header row and resolve column indices.
 * The header row is the one containing a "Stock name" cell.
 */
const findColumnIndices = (row: unknown[]): ColumnIndices | null => {
  const indices: ColumnIndices = {
    stockName: -1,
    symbol: -1,
    isin: -1,
    type: -1,
    quantity: -1,
    value: -1,
    exchange: -1,
    date: -1,
    status: -1,
  };

  for (let i = 0; i < row.length; i++) {
    const field = COLUMN_MAP[normalize(row[i])];
    if (field && indices[field] === -1) {
      indices[field] = i;
    }
  }

  // Require the fields needed to build a transaction.
  if (
    indices.type === -1 ||
    indices.quantity === -1 ||
    indices.value === -1 ||
    indices.date === -1 ||
    (indices.symbol === -1 && indices.stockName === -1)
  ) {
    return null;
  }

  return indices;
};

const cleanSymbol = (value: unknown): string => String(value ?? "").trim().toUpperCase();

/**
 * Parse a CSV string into rows (handles quoted cells).
 */
const parseCSV = (content: string): string[][] => {
  const rows: string[][] = [];
  for (const line of content.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += char;
      }
    }
    cells.push(current.trim());
    rows.push(cells);
  }
  return rows;
};

/**
 * Read a file (xlsx/xls/csv) into a matrix of rows across web + native.
 */
const readRows = async (fileUri: string, fileExtension: string): Promise<unknown[][]> => {
  if (fileExtension.toLowerCase() === ".csv") {
    if (Platform.OS === "web") {
      const response = await fetch(fileUri);
      return parseCSV(await response.text());
    }
    const FileSystem = await import("expo-file-system");
    return parseCSV(await FileSystem.readAsStringAsync(fileUri));
  }

  const XLSX = await import("xlsx");
  let arrayBuffer: ArrayBuffer;

  if (Platform.OS === "web") {
    const response = await fetch(fileUri);
    arrayBuffer = await response.arrayBuffer();
  } else {
    const FileSystem = await import("expo-file-system");
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    arrayBuffer = bytes.buffer;
  }

  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  return XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null }) as unknown[][];
};

/**
 * Groww Order History Parser implementation.
 */
export const growwOrderHistoryParser: TransactionSourceParser = {
  id: "groww-order-history",
  displayName: "Groww (Order history)",
  supportedExtensions: [".xlsx", ".xls", ".csv"],
  description: "Groww \"Stocks Order History\" export (derives price from order value)",
  parserType: "transactions",

  async parse(fileUri: string, fileExtension: string): Promise<TransactionParseResult> {
    const transactions: ParsedTransaction[] = [];
    const skippedRows: Array<{ rawRowIndex: number; reason: string; rawData?: Record<string, unknown> }> = [];
    const errors: string[] = [];

    try {
      const rows = await readRows(fileUri, fileExtension);

      if (rows.length === 0) {
        return { ok: false, transactions: [], skippedRows: [], errors: ["No rows found in file"] };
      }

      // Locate header row (skips the leading metadata/title rows).
      let headerRowIndex = -1;
      let columns: ColumnIndices | null = null;
      for (let i = 0; i < Math.min(rows.length, 30); i++) {
        const row = rows[i];
        if (!row || isRowEmpty(row)) continue;
        columns = findColumnIndices(row);
        if (columns) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1 || !columns) {
        return {
          ok: false,
          transactions: [],
          skippedRows: [],
          errors: [
            "Could not find the Groww Order History header row (expected columns: Stock name, Type, Quantity, Value, Execution date and time).",
          ],
        };
      }

      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || isRowEmpty(row)) continue;
        const rawRowIndex = i + 1;

        // Skip non-executed orders (cancelled/rejected/failed/pending).
        if (columns.status !== -1) {
          const status = normalize(row[columns.status]);
          if (status && NON_EXECUTED_STATUSES.some((s) => status.includes(s))) {
            skippedRows.push({ rawRowIndex, reason: `Order not executed (${row[columns.status]})` });
            continue;
          }
        }

        const type = parseTransactionType(row[columns.type]);
        const symbolRaw = columns.symbol !== -1 ? row[columns.symbol] : null;
        const symbol = cleanSymbol(symbolRaw || (columns.stockName !== -1 ? row[columns.stockName] : ""));
        const isin = columns.isin !== -1 ? cleanSymbol(row[columns.isin]) || undefined : undefined;
        const companyName = columns.stockName !== -1 ? String(row[columns.stockName] ?? "").trim() : undefined;
        const quantity = parseNumber(row[columns.quantity]);
        const value = parseNumber(row[columns.value]);
        const transactionDate = toIsoDate(row[columns.date]);

        if (!transactionDate) {
          skippedRows.push({ rawRowIndex, reason: "Invalid or missing execution date", rawData: { date: row[columns.date] } });
          continue;
        }
        if (!type) {
          skippedRows.push({ rawRowIndex, reason: "Invalid transaction type (expected BUY or SELL)", rawData: { type: row[columns.type] } });
          continue;
        }
        if (!symbol) {
          skippedRows.push({ rawRowIndex, reason: "Missing symbol / stock name" });
          continue;
        }
        if (quantity === null || quantity <= 0) {
          skippedRows.push({ rawRowIndex, reason: "Invalid quantity", rawData: { quantity: row[columns.quantity] } });
          continue;
        }
        if (value === null || value <= 0) {
          skippedRows.push({ rawRowIndex, reason: "Invalid order value", rawData: { value: row[columns.value] } });
          continue;
        }

        // Groww Order History reports total value, not per-share price.
        const pricePerShare = value / quantity;

        transactions.push({
          symbol,
          isin,
          companyName: companyName || undefined,
          transactionDate,
          type,
          quantity,
          pricePerShare,
          fees: 0,
          rawRowIndex,
        });
      }

      return {
        ok: transactions.length > 0,
        brokerName: "Groww",
        currency: "INR",
        transactions,
        skippedRows,
        errors: transactions.length === 0 ? [...errors, "No executed orders found to import."] : errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown parsing error";
      return { ok: false, transactions: [], skippedRows: [], errors: [`Failed to parse file: ${message}`] };
    }
  },
};

