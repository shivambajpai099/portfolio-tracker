/**
 * INDMoney Holdings Parser
 *
 * Parses holdings export files from INDMoney app.
 * Supports .xlsx and .numbers file formats.
 *
 * Expected file structure:
 * - Row 2: "Broker Name" in col A, broker value in col B
 * - Row 4: "Holdings as on" in col A, date value in col B
 * - Header row: First row where col A = "Stock Symbol"
 * - Columns: Stock Symbol, Holding Since, Quantity, Avg. Price ($), Total Value ($)
 * - Data ends at first fully blank row after header
 *
 * Note: Total Value = Quantity × Avg. Price (cost basis, NOT current market value)
 */

import { Platform } from "react-native";
import type { HoldingsSourceParser, ParsedHolding, ParseResult, SkippedRow } from "../types";

/**
 * Expected column names in the header row.
 */
const EXPECTED_COLUMNS = {
  SYMBOL: "Stock Symbol",
  HOLDING_SINCE: "Holding Since",
  QUANTITY: "Quantity",
  AVG_PRICE: "Avg. Price ($)",
  TOTAL_VALUE: "Total Value ($)",
} as const;

/**
 * Column indices after parsing header row.
 */
interface ColumnIndices {
  symbol: number;
  holdingSince: number;
  quantity: number;
  avgPrice: number;
  totalValue: number;
}

/**
 * Parsed metadata from the file header.
 */
interface FileMetadata {
  brokerName?: string;
  asOfDate?: string;
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
    const cleaned = value.replace(/[$,₹\s]/g, "").trim();
    if (cleaned === "" || cleaned === "-") {
      return null;
    }
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

/**
 * Parse a date string from various formats.
 */
const parseDate = (value: unknown): string | undefined => {
  if (!value) return undefined;

  const str = String(value).trim();
  if (!str) return undefined;

  // Try parsing as ISO date
  const date = new Date(str);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().split("T")[0];
  }

  // Return as-is if it looks like a date string
  if (/\d/.test(str)) {
    return str;
  }

  return undefined;
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
 * Find the header row index by looking for "Stock Symbol" in column A.
 */
const findHeaderRowIndex = (rows: unknown[][]): number => {
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (row && row.length > 0) {
      const firstCell = String(row[0] ?? "").trim();
      if (firstCell === EXPECTED_COLUMNS.SYMBOL) {
        return i;
      }
    }
  }
  return -1;
};

/**
 * Extract column indices from the header row.
 */
const extractColumnIndices = (headerRow: unknown[]): ColumnIndices | null => {
  const indices: Partial<ColumnIndices> = {};

  for (let i = 0; i < headerRow.length; i++) {
    const cell = String(headerRow[i] ?? "").trim();

    if (cell === EXPECTED_COLUMNS.SYMBOL) {
      indices.symbol = i;
    } else if (cell === EXPECTED_COLUMNS.HOLDING_SINCE) {
      indices.holdingSince = i;
    } else if (cell === EXPECTED_COLUMNS.QUANTITY) {
      indices.quantity = i;
    } else if (cell.includes("Avg. Price") || cell.includes("Avg Price")) {
      indices.avgPrice = i;
    } else if (cell.includes("Total Value")) {
      indices.totalValue = i;
    }
  }

  // Symbol and either (quantity + avgPrice) or totalValue are required
  if (indices.symbol === undefined) {
    return null;
  }

  // We need at least quantity and avgPrice
  if (indices.quantity === undefined || indices.avgPrice === undefined) {
    return null;
  }

  return {
    symbol: indices.symbol,
    holdingSince: indices.holdingSince ?? -1,
    quantity: indices.quantity,
    avgPrice: indices.avgPrice,
    totalValue: indices.totalValue ?? -1,
  };
};

/**
 * Extract metadata (broker name, as-of date) from the file header rows.
 */
const extractMetadata = (rows: unknown[][]): FileMetadata => {
  const metadata: FileMetadata = {};

  // Row 2 (index 1): "Broker Name" in col A, value in col B
  if (rows[1] && rows[1].length >= 2) {
    const label = String(rows[1][0] ?? "").trim();
    if (label.toLowerCase().includes("broker")) {
      metadata.brokerName = String(rows[1][1] ?? "").trim() || undefined;
    }
  }

  // Row 4 (index 3): "Holdings as on" in col A, value in col B
  if (rows[3] && rows[3].length >= 2) {
    const label = String(rows[3][0] ?? "").trim();
    if (label.toLowerCase().includes("holdings as on") || label.toLowerCase().includes("as of")) {
      const dateValue = rows[3][1];
      metadata.asOfDate = parseDate(dateValue);
    }
  }

  return metadata;
};

/**
 * Parse holdings data from rows.
 */
const parseHoldingsFromRows = (
  rows: unknown[][],
  headerRowIndex: number,
  columnIndices: ColumnIndices
): { holdings: ParsedHolding[]; skippedRows: SkippedRow[] } => {
  const holdings: ParsedHolding[] = [];
  const skippedRows: SkippedRow[] = [];

  // Start from row after header
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i];
    const rawRowIndex = i + 1; // 1-based for user display

    if (!row || isRowEmpty(row)) {
      // End of data
      break;
    }

    const rawData: Record<string, unknown> = {
      symbol: row[columnIndices.symbol],
      quantity: row[columnIndices.quantity],
      avgPrice: row[columnIndices.avgPrice],
      holdingSince: columnIndices.holdingSince >= 0 ? row[columnIndices.holdingSince] : undefined,
    };

    // Extract and validate symbol
    const symbol = cleanSymbol(row[columnIndices.symbol]);
    if (!symbol) {
      skippedRows.push({
        rawRowIndex,
        reason: "Empty or missing symbol",
        rawData,
      });
      continue;
    }

    // Extract and validate quantity
    const quantity = parseNumber(row[columnIndices.quantity]);
    if (quantity === null || quantity <= 0) {
      skippedRows.push({
        rawRowIndex,
        reason: quantity === null ? "Missing quantity" : "Non-positive quantity",
        rawData,
      });
      continue;
    }

    // Extract and validate average price
    const avgPrice = parseNumber(row[columnIndices.avgPrice]);
    if (avgPrice === null || avgPrice <= 0) {
      skippedRows.push({
        rawRowIndex,
        reason: avgPrice === null ? "Missing average price" : "Non-positive average price",
        rawData,
      });
      continue;
    }

    // Extract optional holding since date
    const holdingSince =
      columnIndices.holdingSince >= 0 ? parseDate(row[columnIndices.holdingSince]) : undefined;

    holdings.push({
      symbol,
      quantity,
      avgPrice,
      holdingSince,
      rawRowIndex,
    });
  }

  return { holdings, skippedRows };
};

/**
 * Read file content as ArrayBuffer - works on both web and native.
 */
const readFileAsArrayBuffer = async (fileUri: string): Promise<ArrayBuffer> => {
  if (Platform.OS === "web") {
    // On web, fetch the blob URI and convert to ArrayBuffer
    const response = await fetch(fileUri);
    return response.arrayBuffer();
  } else {
    // On native, use expo-file-system
    const FileSystem = await import("expo-file-system");
    const base64Content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    // Convert base64 to ArrayBuffer
    const binaryString = atob(base64Content);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
};

/**
 * Parse an XLSX file using SheetJS (xlsx library).
 * Note: This requires the xlsx package to be installed.
 */
const parseXlsxFile = async (fileUri: string): Promise<ParseResult> => {
  try {
    // Read file as ArrayBuffer (works on both web and native)
    const arrayBuffer = await readFileAsArrayBuffer(fileUri);

    // Dynamic import of xlsx library
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require("xlsx");

    // Parse workbook from ArrayBuffer
    const workbook = XLSX.read(arrayBuffer, { type: "array" });

    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return {
        ok: false,
        holdings: [],
        skippedRows: [],
        errors: ["Couldn't read this file — the workbook appears to be empty."],
      };
    }

    const sheet = workbook.Sheets[sheetName];

    // Convert sheet to array of arrays
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
      holdings: [],
      skippedRows: [],
      errors: [`Couldn't read this file — make sure it's an unmodified INDMoney export. (${message})`],
    };
  }
};

/**
 * Parse a .numbers file.
 * Note: .numbers files are actually ZIP archives containing protobuf data.
 * This requires the numbers-parser library.
 */
const parseNumbersFile = async (fileUri: string): Promise<ParseResult> => {
  try {
    // Read file as ArrayBuffer (works on both web and native)
    const arrayBuffer = await readFileAsArrayBuffer(fileUri);

    // For .numbers files, we need to use a specialized parser
    // Since numbers-parser is a Python library, we'll use xlsx for now
    // and add numbers support via a web API or different approach later

    // Attempt to parse as xlsx (some .numbers exports are xlsx-compatible)
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require("xlsx");
      const workbook = XLSX.read(arrayBuffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];

      if (sheetName) {
        const sheet = workbook.Sheets[sheetName];
        const rows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
          header: 1,
          defval: "",
          blankrows: true,
        });
        return parseRowsData(rows);
      }
    } catch {
      // Not xlsx-compatible, need actual numbers parser
    }

    return {
      ok: false,
      holdings: [],
      skippedRows: [],
      errors: [
        "Apple Numbers (.numbers) files are not yet fully supported. " +
          "Please export your holdings as .xlsx from Numbers (File → Export To → Excel) and try again.",
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      holdings: [],
      skippedRows: [],
      errors: [`Couldn't read this file — make sure it's an unmodified INDMoney export. (${message})`],
    };
  }
};

/**
 * Parse rows data (common logic for xlsx and numbers).
 */
const parseRowsData = (rows: unknown[][]): ParseResult => {
  if (!rows || rows.length === 0) {
    return {
      ok: false,
      holdings: [],
      skippedRows: [],
      errors: ["Couldn't read this file — the file appears to be empty."],
    };
  }

  // Extract metadata from header rows
  const metadata = extractMetadata(rows);

  // Find header row
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex === -1) {
    return {
      ok: false,
      holdings: [],
      skippedRows: [],
      errors: [
        "This doesn't look like a holdings report — expected columns weren't found. " +
          `Looking for "${EXPECTED_COLUMNS.SYMBOL}" column header.`,
      ],
    };
  }

  // Extract column indices
  const columnIndices = extractColumnIndices(rows[headerRowIndex]);
  if (!columnIndices) {
    return {
      ok: false,
      holdings: [],
      skippedRows: [],
      errors: [
        "This doesn't look like a holdings report — expected columns weren't found. " +
          `Required columns: ${EXPECTED_COLUMNS.SYMBOL}, ${EXPECTED_COLUMNS.QUANTITY}, ${EXPECTED_COLUMNS.AVG_PRICE}`,
      ],
    };
  }

  // Parse holdings
  const { holdings, skippedRows } = parseHoldingsFromRows(rows, headerRowIndex, columnIndices);

  return {
    ok: true,
    brokerName: metadata.brokerName,
    asOfDate: metadata.asOfDate,
    currency: "USD", // INDMoney US stocks are in USD
    holdings,
    skippedRows,
    errors: [],
  };
};

/**
 * INDMoney Holdings Parser
 */
export const indmoneyParser: HoldingsSourceParser = {
  id: "indmoney",
  displayName: "INDMoney",
  supportedExtensions: [".xlsx", ".numbers"],
  description: "Holdings export from INDMoney app (US stocks)",

  async parse(fileUri: string, fileExtension: string): Promise<ParseResult> {
    const ext = fileExtension.toLowerCase();

    if (ext === ".xlsx") {
      return parseXlsxFile(fileUri);
    }

    if (ext === ".numbers") {
      return parseNumbersFile(fileUri);
    }

    return {
      ok: false,
      holdings: [],
      skippedRows: [],
      errors: [`Unsupported file format: ${fileExtension}. Expected .xlsx or .numbers`],
    };
  },

  async canParse(fileUri: string, fileExtension: string): Promise<boolean> {
    const ext = fileExtension.toLowerCase();
    if (ext !== ".xlsx" && ext !== ".numbers") {
      return false;
    }

    // Try to parse and check if it has expected structure
    const result = await this.parse(fileUri, fileExtension);
    return result.ok && result.holdings.length > 0;
  },
};

export default indmoneyParser;

