/**
 * Groww Transactions Parser
 *
 * Parses transaction history exports from Groww app.
 * Supports .xlsx, .xls, and .csv file formats.
 *
 * Expected file structure:
 * - Header row with columns: Date, Type, Symbol, Quantity, Price, Amount
 * - Date format: YYYY-MM-DD or DD/MM/YYYY
 * - Type: "BUY" or "SELL" (case-insensitive)
 */

import { Platform } from "react-native";
import type { TransactionSourceParser } from "../types";
import type { ParsedTransaction, TransactionParseResult } from "../../../types/transaction";

/**
 * Expected column names (case-insensitive matching).
 */
const COLUMN_PATTERNS = {
  DATE: ["date", "trade date", "transaction date", "order date"],
  TYPE: ["type", "transaction type", "side", "action", "order type"],
  SYMBOL: ["symbol", "ticker", "stock symbol", "scrip", "stock name", "security"],
  COMPANY: ["company", "company name", "name", "security name"],
  QUANTITY: ["quantity", "qty", "shares", "units", "no. of shares"],
  PRICE: ["price", "price per share", "unit price", "avg price", "average price", "rate"],
  AMOUNT: ["amount", "total", "value", "total amount", "order value"],
  FEES: ["fees", "commission", "charges", "brokerage", "stt", "stamp duty"],
} as const;

/**
 * Column indices after parsing header row.
 */
interface ColumnIndices {
  date: number;
  type: number;
  symbol: number;
  company: number;
  quantity: number;
  price: number;
  amount: number;
  fees: number;
}

/**
 * Parse a number from a cell value, handling various formats.
 */
const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    // Remove currency symbols, commas, and whitespace
    const cleaned = value.replace(/[$₹,\s()]/g, "").trim();
    if (cleaned === "" || cleaned === "-") {
      return null;
    }
    // Handle negative numbers in parentheses or with minus
    const isNegative = value.includes("(") || cleaned.startsWith("-");
    const parsed = Number(cleaned.replace("-", ""));
    if (!Number.isFinite(parsed)) return null;
    return isNegative ? -parsed : parsed;
  }
  return null;
};

/**
 * Parse a date string from various formats.
 * Returns ISO date string (YYYY-MM-DD).
 */
const parseDate = (value: unknown): string | null => {
  if (!value) return null;

  const str = String(value).trim();
  if (!str) return null;

  // Try ISO format first (YYYY-MM-DD)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const date = new Date(str);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Try DD/MM/YYYY format (common in India)
  const ddmmyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Try MM/DD/YYYY format
  const mmddyyyy = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Try parsing as general date
  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().split("T")[0];
  }

  return null;
};

/**
 * Parse transaction type from string.
 */
const parseTransactionType = (value: unknown): "BUY" | "SELL" | null => {
  if (!value) return null;
  const str = String(value).trim().toUpperCase();

  if (str === "BUY" || str === "B" || str === "BOUGHT" || str === "PURCHASE") {
    return "BUY";
  }
  if (str === "SELL" || str === "S" || str === "SOLD" || str === "SALE") {
    return "SELL";
  }
  return null;
};

/**
 * Clean and normalize a symbol string.
 */
const cleanSymbol = (value: unknown): string => {
  if (!value) return "";
  return String(value).trim().toUpperCase();
};

/**
 * Check if a row is entirely empty.
 */
const isRowEmpty = (row: unknown[]): boolean => {
  return row.every((cell) => cell === null || cell === undefined || String(cell).trim() === "");
};

/**
 * Match a column header against patterns (case-insensitive).
 */
const matchColumnHeader = (header: string, patterns: readonly string[]): boolean => {
  const normalized = header.toLowerCase().trim();
  return patterns.some((pattern) => normalized.includes(pattern.toLowerCase()));
};

/**
 * Find column indices from header row.
 */
const findColumnIndices = (headerRow: unknown[]): ColumnIndices | null => {
  const indices: Partial<ColumnIndices> = {
    date: -1,
    type: -1,
    symbol: -1,
    company: -1,
    quantity: -1,
    price: -1,
    amount: -1,
    fees: -1,
  };

  for (let i = 0; i < headerRow.length; i++) {
    const header = String(headerRow[i] ?? "");

    if (indices.date === -1 && matchColumnHeader(header, COLUMN_PATTERNS.DATE)) {
      indices.date = i;
    } else if (indices.type === -1 && matchColumnHeader(header, COLUMN_PATTERNS.TYPE)) {
      indices.type = i;
    } else if (indices.symbol === -1 && matchColumnHeader(header, COLUMN_PATTERNS.SYMBOL)) {
      indices.symbol = i;
    } else if (indices.company === -1 && matchColumnHeader(header, COLUMN_PATTERNS.COMPANY)) {
      indices.company = i;
    } else if (indices.quantity === -1 && matchColumnHeader(header, COLUMN_PATTERNS.QUANTITY)) {
      indices.quantity = i;
    } else if (indices.price === -1 && matchColumnHeader(header, COLUMN_PATTERNS.PRICE)) {
      indices.price = i;
    } else if (indices.amount === -1 && matchColumnHeader(header, COLUMN_PATTERNS.AMOUNT)) {
      indices.amount = i;
    } else if (indices.fees === -1 && matchColumnHeader(header, COLUMN_PATTERNS.FEES)) {
      indices.fees = i;
    }
  }

  // Require at least date, type, symbol, quantity, and price
  if (
    indices.date === -1 ||
    indices.type === -1 ||
    indices.symbol === -1 ||
    indices.quantity === -1 ||
    indices.price === -1
  ) {
    return null;
  }

  return indices as ColumnIndices;
};

/**
 * Parse a CSV string into rows.
 */
const parseCSV = (content: string): string[][] => {
  const rows: string[][] = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    if (line.trim() === "") continue;

    const cells: string[] = [];
    let currentCell = "";
    let insideQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === "," && !insideQuotes) {
        cells.push(currentCell.trim());
        currentCell = "";
      } else {
        currentCell += char;
      }
    }
    cells.push(currentCell.trim());
    rows.push(cells);
  }

  return rows;
};

/**
 * Groww Transactions Parser implementation.
 */
export const growwTransactionsParser: TransactionSourceParser = {
  id: "groww-transactions",
  displayName: "Groww",
  supportedExtensions: [".xlsx", ".xls", ".csv"],
  description: "Groww transaction history export (CSV or Excel)",
  parserType: "transactions",
  recommended: true,

  async parse(fileUri: string, fileExtension: string): Promise<TransactionParseResult> {
    const transactions: ParsedTransaction[] = [];
    const skippedRows: Array<{ rawRowIndex: number; reason: string; rawData?: Record<string, unknown> }> = [];
    const errors: string[] = [];

    try {
      let rows: unknown[][] = [];

      if (fileExtension.toLowerCase() === ".csv") {
        // Parse CSV file
        if (Platform.OS === "web") {
          const response = await fetch(fileUri);
          const text = await response.text();
          rows = parseCSV(text);
        } else {
          // React Native - use expo-file-system
          const FileSystem = await import("expo-file-system");
          const content = await FileSystem.readAsStringAsync(fileUri);
          rows = parseCSV(content);
        }
      } else {
        // Parse Excel file (.xlsx, .xls)
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

        const workbook = XLSX.read(arrayBuffer, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) {
          return {
            ok: false,
            transactions: [],
            skippedRows: [],
            errors: ["No sheets found in Excel file"],
          };
        }

        const sheet = workbook.Sheets[sheetName];
        rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
      }

      // Find header row
      let headerRowIndex = -1;
      let columnIndices: ColumnIndices | null = null;

      for (let i = 0; i < Math.min(rows.length, 20); i++) {
        const row = rows[i];
        if (!row || isRowEmpty(row)) continue;

        columnIndices = findColumnIndices(row);
        if (columnIndices) {
          headerRowIndex = i;
          break;
        }
      }

      if (headerRowIndex === -1 || !columnIndices) {
        return {
          ok: false,
          transactions: [],
          skippedRows: [],
          errors: ["Could not find header row with required columns (Date, Type, Symbol, Quantity, Price)"],
        };
      }

      // Parse data rows
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || isRowEmpty(row)) continue;

        const rawRowIndex = i + 1;

        // Parse required fields
        const dateStr = parseDate(row[columnIndices.date]);
        const type = parseTransactionType(row[columnIndices.type]);
        const symbol = cleanSymbol(row[columnIndices.symbol]);
        const quantity = parseNumber(row[columnIndices.quantity]);
        const price = parseNumber(row[columnIndices.price]);

        // Validate required fields
        if (!dateStr) {
          skippedRows.push({
            rawRowIndex,
            reason: "Invalid or missing date",
            rawData: { row: row.slice(0, 8) },
          });
          continue;
        }

        if (!type) {
          skippedRows.push({
            rawRowIndex,
            reason: "Invalid transaction type (expected BUY or SELL)",
            rawData: { type: row[columnIndices.type] },
          });
          continue;
        }

        if (!symbol) {
          skippedRows.push({
            rawRowIndex,
            reason: "Missing symbol",
            rawData: { symbol: row[columnIndices.symbol] },
          });
          continue;
        }

        if (quantity === null || quantity <= 0) {
          skippedRows.push({
            rawRowIndex,
            reason: "Invalid quantity",
            rawData: { quantity: row[columnIndices.quantity] },
          });
          continue;
        }

        if (price === null || price <= 0) {
          skippedRows.push({
            rawRowIndex,
            reason: "Invalid price",
            rawData: { price: row[columnIndices.price] },
          });
          continue;
        }

        // Parse optional fields
        const companyName = columnIndices.company !== -1 ? String(row[columnIndices.company] ?? "") : undefined;
        const fees = columnIndices.fees !== -1 ? parseNumber(row[columnIndices.fees]) : null;

        transactions.push({
          symbol,
          companyName: companyName || undefined,
          transactionDate: dateStr,
          type,
          quantity,
          pricePerShare: price,
          fees: fees ?? 0,
          rawRowIndex,
        });
      }

      return {
        ok: true,
        brokerName: "Groww",
        currency: "INR",
        transactions,
        skippedRows,
        errors,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown parsing error";
      return {
        ok: false,
        transactions: [],
        skippedRows: [],
        errors: [`Failed to parse file: ${message}`],
      };
    }
  },
};

