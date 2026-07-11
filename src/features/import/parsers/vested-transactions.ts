/**
 * Vested Transactions Parser
 *
 * Parses transaction export files from Vested (US brokerage for Indian investors).
 * Supports .xlsx and .csv file formats.
 *
 * Expected file structure:
 * - Header row with columns: Date, Type, Symbol, Quantity, Price, Amount, Fees (optional)
 * - Date format: YYYY-MM-DD or MM/DD/YYYY
 * - Type: "Buy" or "Sell" (case-insensitive)
 */

import { Platform } from "react-native";
import type { TransactionSourceParser } from "../types";
import type { ParsedTransaction, TransactionParseResult } from "../../../types/transaction";

/**
 * Expected column names (case-insensitive matching).
 */
const COLUMN_PATTERNS = {
  DATE: ["date", "transaction date", "trade date"],
  TYPE: ["type", "transaction type", "side", "action"],
  SYMBOL: ["symbol", "ticker", "stock symbol", "security"],
  COMPANY: ["company", "company name", "name", "security name"],
  QUANTITY: ["quantity", "qty", "shares", "units"],
  PRICE: ["price", "price per share", "unit price", "execution price"],
  AMOUNT: ["amount", "total", "value", "total amount"],
  FEES: ["fees", "commission", "charges", "brokerage"],
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
    const cleaned = value.replace(/[$,₹\s()]/g, "").trim();
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

  // Try MM/DD/YYYY format
  const mmddyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mmddyyyy) {
    const [, month, day, year] = mmddyyyy;
    const date = new Date(Number(year), Number(month) - 1, Number(day));
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split("T")[0];
    }
  }

  // Try DD/MM/YYYY format
  const ddmmyyyy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy;
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
const matchesPattern = (header: string, patterns: readonly string[]): boolean => {
  const normalized = header.toLowerCase().trim();
  return patterns.some((pattern) => normalized === pattern || normalized.includes(pattern));
};

/**
 * Extract column indices from the header row.
 */
const extractColumnIndices = (headerRow: unknown[]): ColumnIndices | null => {
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
    const header = String(headerRow[i] ?? "").trim();
    if (!header) continue;

    if (matchesPattern(header, COLUMN_PATTERNS.DATE) && indices.date === -1) {
      indices.date = i;
    } else if (matchesPattern(header, COLUMN_PATTERNS.TYPE) && indices.type === -1) {
      indices.type = i;
    } else if (matchesPattern(header, COLUMN_PATTERNS.SYMBOL) && indices.symbol === -1) {
      indices.symbol = i;
    } else if (matchesPattern(header, COLUMN_PATTERNS.COMPANY) && indices.company === -1) {
      indices.company = i;
    } else if (matchesPattern(header, COLUMN_PATTERNS.QUANTITY) && indices.quantity === -1) {
      indices.quantity = i;
    } else if (matchesPattern(header, COLUMN_PATTERNS.PRICE) && indices.price === -1) {
      indices.price = i;
    } else if (matchesPattern(header, COLUMN_PATTERNS.AMOUNT) && indices.amount === -1) {
      indices.amount = i;
    } else if (matchesPattern(header, COLUMN_PATTERNS.FEES) && indices.fees === -1) {
      indices.fees = i;
    }
  }

  // Required columns: date, type, symbol, and either (quantity + price) or amount
  if (indices.date === -1 || indices.type === -1 || indices.symbol === -1) {
    return null;
  }

  // We need at least quantity and price, or amount to derive them
  if (indices.quantity === -1 || indices.price === -1) {
    // Can't proceed without quantity and price
    return null;
  }

  return indices as ColumnIndices;
};

/**
 * Find the header row index by looking for required columns.
 */
const findHeaderRowIndex = (rows: unknown[][]): number => {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row || row.length < 3) continue;

    const indices = extractColumnIndices(row);
    if (indices) {
      return i;
    }
  }
  return -1;
};

/**
 * Parse transactions from rows.
 */
const parseTransactionsFromRows = (
  rows: unknown[][],
  headerRowIndex: number,
  columnIndices: ColumnIndices
): { transactions: ParsedTransaction[]; skippedRows: Array<{ rawRowIndex: number; reason: string; rawData?: Record<string, unknown> }> } => {
  const transactions: ParsedTransaction[] = [];
  const skippedRows: Array<{ rawRowIndex: number; reason: string; rawData?: Record<string, unknown> }> = [];

  // Start from row after header
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawRowIndex = i + 1; // 1-based for user display

    if (!row || isRowEmpty(row)) {
      // Skip empty rows silently
      continue;
    }

    const rawData: Record<string, unknown> = {
      date: row[columnIndices.date],
      type: row[columnIndices.type],
      symbol: row[columnIndices.symbol],
      quantity: row[columnIndices.quantity],
      price: row[columnIndices.price],
    };

    // Parse date
    const transactionDate = parseDate(row[columnIndices.date]);
    if (!transactionDate) {
      skippedRows.push({
        rawRowIndex,
        reason: `Invalid or missing date: "${row[columnIndices.date]}"`,
        rawData,
      });
      continue;
    }

    // Parse type
    const type = parseTransactionType(row[columnIndices.type]);
    if (!type) {
      skippedRows.push({
        rawRowIndex,
        reason: `Invalid transaction type: "${row[columnIndices.type]}" (expected Buy or Sell)`,
        rawData,
      });
      continue;
    }

    // Parse symbol
    const symbol = cleanSymbol(row[columnIndices.symbol]);
    if (!symbol) {
      skippedRows.push({
        rawRowIndex,
        reason: "Missing symbol",
        rawData,
      });
      continue;
    }

    // Parse quantity
    const quantity = parseNumber(row[columnIndices.quantity]);
    if (quantity === null || quantity <= 0) {
      skippedRows.push({
        rawRowIndex,
        reason: `Invalid quantity: "${row[columnIndices.quantity]}"`,
        rawData,
      });
      continue;
    }

    // Parse price
    const pricePerShare = parseNumber(row[columnIndices.price]);
    if (pricePerShare === null || pricePerShare < 0) {
      skippedRows.push({
        rawRowIndex,
        reason: `Invalid price: "${row[columnIndices.price]}"`,
        rawData,
      });
      continue;
    }

    // Parse optional fields
    const companyName = columnIndices.company >= 0
      ? String(row[columnIndices.company] ?? "").trim() || undefined
      : undefined;

    const fees = columnIndices.fees >= 0
      ? parseNumber(row[columnIndices.fees]) ?? undefined
      : undefined;

    transactions.push({
      symbol,
      companyName,
      transactionDate,
      type,
      quantity,
      pricePerShare,
      fees: fees && fees > 0 ? fees : undefined,
      rawRowIndex,
    });
  }

  return { transactions, skippedRows };
};

/**
 * Read file content as ArrayBuffer - works on both web and native.
 */
const readFileAsArrayBuffer = async (fileUri: string): Promise<ArrayBuffer> => {
  if (Platform.OS === "web") {
    const response = await fetch(fileUri);
    return response.arrayBuffer();
  } else {
    const FileSystem = await import("expo-file-system");
    const base64Content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
};

/**
 * Read file content as text - works on both web and native.
 */
const readFileAsText = async (fileUri: string): Promise<string> => {
  if (Platform.OS === "web") {
    const response = await fetch(fileUri);
    return response.text();
  } else {
    const FileSystem = await import("expo-file-system");
    return FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  }
};

/**
 * Parse rows data into TransactionParseResult.
 */
const parseRowsData = (rows: unknown[][]): TransactionParseResult => {
  if (!rows || rows.length === 0) {
    return {
      ok: false,
      transactions: [],
      skippedRows: [],
      errors: ["File appears to be empty."],
    };
  }

  // Find header row
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex === -1) {
    return {
      ok: false,
      transactions: [],
      skippedRows: [],
      errors: [
        "Couldn't find transaction headers. Expected columns: Date, Type, Symbol, Quantity, Price.",
      ],
    };
  }

  // Extract column indices
  const columnIndices = extractColumnIndices(rows[headerRowIndex]);
  if (!columnIndices) {
    return {
      ok: false,
      transactions: [],
      skippedRows: [],
      errors: [
        "Missing required columns. Expected: Date, Type, Symbol, Quantity, Price.",
      ],
    };
  }

  // Parse transactions
  const { transactions, skippedRows } = parseTransactionsFromRows(rows, headerRowIndex, columnIndices);

  return {
    ok: true,
    brokerName: "Vested",
    currency: "USD",
    transactions,
    skippedRows,
    errors: [],
  };
};

/**
 * Parse a CSV file.
 */
const parseCsvFile = async (fileUri: string): Promise<TransactionParseResult> => {
  try {
    const text = await readFileAsText(fileUri);

    // Simple CSV parsing (handles basic cases)
    const lines = text.split(/\r?\n/);
    const rows: unknown[][] = [];

    for (const line of lines) {
      if (!line.trim()) {
        rows.push([]);
        continue;
      }

      // Parse CSV line (handles quoted values)
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

    return parseRowsData(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      transactions: [],
      skippedRows: [],
      errors: [`Failed to parse CSV file: ${message}`],
    };
  }
};

/**
 * Parse an XLSX file using SheetJS.
 */
const parseXlsxFile = async (fileUri: string): Promise<TransactionParseResult> => {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(fileUri);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");

    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      return {
        ok: false,
        transactions: [],
        skippedRows: [],
        errors: ["Workbook appears to be empty."],
      };
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: "",
      blankrows: true,
    });

    return parseRowsData(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      transactions: [],
      skippedRows: [],
      errors: [`Failed to parse XLSX file: ${message}`],
    };
  }
};

/**
 * Vested Transactions Parser
 */
export const vestedTransactionsParser: TransactionSourceParser = {
  id: "vested-transactions",
  displayName: "Vested Transactions",
  supportedExtensions: [".csv", ".xlsx"],
  description: "Transaction history export from Vested (US stocks)",
  parserType: "transactions",

  async parse(fileUri: string, fileExtension: string): Promise<TransactionParseResult> {
    const ext = fileExtension.toLowerCase();

    if (ext === ".csv") {
      return parseCsvFile(fileUri);
    } else if (ext === ".xlsx") {
      return parseXlsxFile(fileUri);
    } else {
      return {
        ok: false,
        transactions: [],
        skippedRows: [],
        errors: [`Unsupported file type: ${fileExtension}. Please use .csv or .xlsx.`],
      };
    }
  },
};

