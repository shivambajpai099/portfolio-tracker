/**
 * INDMoney Transactions Parser
 *
 * Parses transaction history (ORDER_BOOK) from INDMoney app exports.
 * Supports .xlsx and .xls file formats.
 *
 * Expected file structure:
 * - Sheet name: "ORDER_BOOK"
 * - Header row contains: Stock Symbol, Order Execution Time, Transaction Type, 
 *   Quantity, Price ($), Order Amount ($), Brokerage ($), Broker Reference Id
 * - Header row is located by searching for "Stock Symbol"
 */

import { Platform } from "react-native";
import type { TransactionSourceParser } from "../types";
import type { ParsedTransaction, TransactionParseResult } from "../../../types/transaction";

/**
 * Expected column names in the header row.
 */
const COLUMN_NAMES = {
  SYMBOL: "Stock Symbol",
  EXECUTION_TIME: "Order Execution Time",
  TRANSACTION_TYPE: "Transaction Type",
  QUANTITY: "Quantity",
  PRICE: "Price ($)",
  ORDER_AMOUNT: "Order Amount ($)",
  BROKERAGE: "Brokerage ($)",
  BROKER_REF_ID: "Broker Reference Id",
} as const;

/**
 * Column indices after parsing header row.
 */
interface ColumnIndices {
  symbol: number;
  executionTime: number;
  transactionType: number;
  quantity: number;
  price: number;
  orderAmount: number;
  brokerage: number;
  brokerRefId: number;
}

/**
 * Parse a number from a cell value.
 */
const parseNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/[$,\s]/g, "").trim();
    if (cleaned === "" || cleaned === "-") {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Parse a date from Order Execution Time format.
 * Expected formats: various date/time strings
 */
const parseExecutionTime = (value: unknown): string | null => {
  if (!value) return null;

  const str = String(value).trim();
  if (!str) return null;

  // Try parsing as Date
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
 * Check if a row is empty.
 */
const isRowEmpty = (row: unknown[]): boolean => {
  return !row || row.length === 0 || row.every(
    (cell) => cell === null || cell === undefined || String(cell).trim() === ""
  );
};

/**
 * Find header row index by searching for "Stock Symbol".
 */
const findHeaderRowIndex = (rows: unknown[][]): number => {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.some((cell) => String(cell).trim() === COLUMN_NAMES.SYMBOL)) {
      return i;
    }
  }
  return -1;
};

/**
 * Extract column indices from the header row.
 */
const extractColumnIndices = (headerRow: unknown[]): ColumnIndices | null => {
  const indices: Partial<ColumnIndices> = {
    symbol: -1,
    executionTime: -1,
    transactionType: -1,
    quantity: -1,
    price: -1,
    orderAmount: -1,
    brokerage: -1,
    brokerRefId: -1,
  };

  for (let i = 0; i < headerRow.length; i++) {
    const header = String(headerRow[i] ?? "").trim();
    if (!header) continue;

    if (header === COLUMN_NAMES.SYMBOL) {
      indices.symbol = i;
    } else if (header === COLUMN_NAMES.EXECUTION_TIME) {
      indices.executionTime = i;
    } else if (header === COLUMN_NAMES.TRANSACTION_TYPE) {
      indices.transactionType = i;
    } else if (header === COLUMN_NAMES.QUANTITY) {
      indices.quantity = i;
    } else if (header === COLUMN_NAMES.PRICE) {
      indices.price = i;
    } else if (header === COLUMN_NAMES.ORDER_AMOUNT) {
      indices.orderAmount = i;
    } else if (header === COLUMN_NAMES.BROKERAGE) {
      indices.brokerage = i;
    } else if (header === COLUMN_NAMES.BROKER_REF_ID) {
      indices.brokerRefId = i;
    }
  }

  // Required columns
  if (
    indices.symbol === -1 ||
    indices.executionTime === -1 ||
    indices.transactionType === -1 ||
    indices.quantity === -1 ||
    indices.price === -1
  ) {
    return null;
  }

  return indices as ColumnIndices;
};

/**
 * Parse transactions from rows.
 */
const parseTransactionsFromRows = (
  rows: unknown[][],
  headerRowIndex: number,
  columnIndices: ColumnIndices
): {
  transactions: ParsedTransaction[];
  skippedRows: Array<{ rawRowIndex: number; reason: string; rawData?: Record<string, unknown> }>;
} => {
  const transactions: ParsedTransaction[] = [];
  const skippedRows: Array<{ rawRowIndex: number; reason: string; rawData?: Record<string, unknown> }> = [];

  // Start from row after header
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawRowIndex = i + 1; // 1-based for user display

    if (isRowEmpty(row)) {
      continue;
    }

    const rawData: Record<string, unknown> = {
      symbol: row[columnIndices.symbol],
      executionTime: row[columnIndices.executionTime],
      transactionType: row[columnIndices.transactionType],
      quantity: row[columnIndices.quantity],
      price: row[columnIndices.price],
    };

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

    // Parse date
    const transactionDate = parseExecutionTime(row[columnIndices.executionTime]);
    if (!transactionDate) {
      skippedRows.push({
        rawRowIndex,
        reason: `Invalid or missing date: "${row[columnIndices.executionTime]}"`,
        rawData,
      });
      continue;
    }

    // Parse type
    const type = parseTransactionType(row[columnIndices.transactionType]);
    if (!type) {
      skippedRows.push({
        rawRowIndex,
        reason: `Invalid transaction type: "${row[columnIndices.transactionType]}" (expected Buy or Sell)`,
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

    // Parse optional fees (brokerage)
    const fees = columnIndices.brokerage >= 0
      ? parseNumber(row[columnIndices.brokerage]) ?? undefined
      : undefined;

    transactions.push({
      symbol,
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
 * Read file content as ArrayBuffer.
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
 * Parse rows from ORDER_BOOK sheet.
 */
const parseOrderBookSheet = (rows: unknown[][]): TransactionParseResult => {
  if (!rows || rows.length === 0) {
    return {
      ok: false,
      transactions: [],
      skippedRows: [],
      errors: ["ORDER_BOOK sheet appears to be empty."],
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
        "Could not locate header row. Expected to find 'Stock Symbol' column.",
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
        "Missing required columns. Expected: Stock Symbol, Order Execution Time, Transaction Type, Quantity, Price ($).",
      ],
    };
  }

  // Parse transactions
  const { transactions, skippedRows } = parseTransactionsFromRows(
    rows,
    headerRowIndex,
    columnIndices
  );

  return {
    ok: true,
    brokerName: "INDMoney",
    currency: "USD",
    transactions,
    skippedRows,
    errors: [],
  };
};

/**
 * Parse an Excel file (.xlsx or .xls).
 */
const parseExcelFile = async (fileUri: string): Promise<TransactionParseResult> => {
  try {
    const arrayBuffer = await readFileAsArrayBuffer(fileUri);

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");

    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // Look for ORDER_BOOK sheet
    const orderBookSheet = workbook.Sheets["ORDER_BOOK"];
    if (!orderBookSheet) {
      // If ORDER_BOOK not found, list available sheets in error
      const sheetNames = workbook.SheetNames.join(", ");
      return {
        ok: false,
        transactions: [],
        skippedRows: [],
        errors: [
          `ORDER_BOOK sheet not found. Available sheets: ${sheetNames || "none"}. ` +
          "Please ensure you're uploading an INDMoney transaction export file.",
        ],
      };
    }

    // Convert sheet to array of arrays
    const rows: unknown[][] = XLSX.utils.sheet_to_json(orderBookSheet, {
      header: 1,
      raw: false,
      defval: "",
    });

    return parseOrderBookSheet(rows);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      transactions: [],
      skippedRows: [],
      errors: [`Failed to parse Excel file: ${message}`],
    };
  }
};

/**
 * INDMoney Transactions Parser
 */
export const indmoneyTransactionsParser: TransactionSourceParser = {
  id: "indmoney-transactions",
  displayName: "INDMoney Transactions",
  supportedExtensions: [".xlsx", ".xls"],
  description: "Transaction history (ORDER_BOOK) from INDMoney app",
  parserType: "transactions",

  async parse(fileUri: string, fileExtension: string): Promise<TransactionParseResult> {
    const ext = fileExtension.toLowerCase();

    if (ext === ".xlsx" || ext === ".xls") {
      return parseExcelFile(fileUri);
    } else {
      return {
        ok: false,
        transactions: [],
        skippedRows: [],
        errors: [`Unsupported file type: ${fileExtension}. Please use .xlsx or .xls.`],
      };
    }
  },
};

