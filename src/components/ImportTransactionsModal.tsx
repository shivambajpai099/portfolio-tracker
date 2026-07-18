/**
 * Import Transactions Modal
 *
 * Multi-step modal for importing transactions from broker exports.
 * Transactions are persisted and holdings are derived via FIFO.
 *
 * Steps:
 * 1. Upload: Select file and source parser
 * 2. Account Selection: Pick target account
 * 3. Review: Preview derived holdings before committing
 * 4. Complete: Transactions imported
 */

import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { colors, radii, spacing, typography } from "../theme";
import { accountSupportsHoldings, type Account, type Currency } from "../types/portfolio";
import type { Transaction, TransactionParseResult } from "../types/transaction";
import type { TransactionSourceParser, TransactionImportReviewData, EnrichedHolding } from "../features/import/types";
import {
  getAllTransactionParsers,
  getTransactionParser,
  buildTransactionImportReviewData,
  createTransactionsFromParseResult,
  getSymbolsFromTransactions,
} from "../features/import";
import { fetchLivePrices } from "../services/yahooFinanceService";

type ImportStep = "upload" | "account" | "review" | "complete";

interface ImportTransactionsModalProps {
  visible: boolean;
  accounts: Account[];
  onClose: () => void;
  onComplete: (result: ImportCompleteResult) => void;
  setAccountTransactions: (accountId: string, transactions: Transaction[]) => void;
  updateAccount?: (accountId: string, updates: Partial<Account>) => void;
  updateMarketPrices?: (prices: Record<string, number>) => void;
  /** Pre-select an account when opening the modal */
  preSelectedAccountId?: string;
}

interface ImportCompleteResult {
  transactionCount: number;
  derivedHoldingCount: number;
  accountName: string;
  accountId: string;
  parserName: string;
}

export function ImportTransactionsModal({
  visible,
  accounts,
  onClose,
  onComplete,
  setAccountTransactions,
  updateAccount,
  updateMarketPrices,
  preSelectedAccountId,
}: ImportTransactionsModalProps) {
  // Step state
  const [step, setStep] = useState<ImportStep>("upload");

  // Upload step state
  const [selectedParserId, setSelectedParserId] = useState("");
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    extension: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parseResult, setParseResult] = useState<TransactionParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Account step state
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // Review step state
  const [reviewData, setReviewData] = useState<TransactionImportReviewData | null>(null);
  const [priceMap, setPriceMap] = useState<Map<string, { price: number; companyName: string }>>(new Map());
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

  // Get available transaction parsers
  const availableParsers = useMemo(() => getAllTransactionParsers(), []);

  // Set default parser on mount
  useEffect(() => {
    if (availableParsers.length > 0 && !selectedParserId) {
      setSelectedParserId(availableParsers[0].id);
    }
  }, [availableParsers, selectedParserId]);

  // Filter accounts that support holdings
  const holdingAccounts = useMemo(
    () => accounts.filter((account) => accountSupportsHoldings(account.type)),
    [accounts]
  );

  // Sort accounts by broker match
  const sortedAccounts = useMemo(() => {
    if (!parseResult?.brokerName) return holdingAccounts;

    const brokerLower = parseResult.brokerName.toLowerCase();
    return [...holdingAccounts].sort((a, b) => {
      const aMatches = a.broker.toLowerCase().includes(brokerLower);
      const bMatches = b.broker.toLowerCase().includes(brokerLower);
      if (aMatches && !bMatches) return -1;
      if (!aMatches && bMatches) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [holdingAccounts, parseResult?.brokerName]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === selectedAccountId),
    [accounts, selectedAccountId]
  );

  // Pre-select account if provided
  useEffect(() => {
    if (visible && preSelectedAccountId) {
      setSelectedAccountId(preSelectedAccountId);
    }
  }, [visible, preSelectedAccountId]);

  // Reset state when modal closes
  const handleClose = () => {
    setStep("upload");
    setSelectedFile(null);
    setParseResult(null);
    setParseError(null);
    setSelectedAccountId("");
    setReviewData(null);
    setPriceMap(new Map());
    onClose();
  };

  // Handle file selection
  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "text/csv",
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/octet-stream",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        return;
      }

      const file = result.assets[0];
      const extension = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();

      setSelectedFile({
        uri: file.uri,
        name: file.name,
        extension,
      });
      setParseError(null);
      setParseResult(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to select file";
      setParseError(message);
    }
  };

  // Handle parse
  const handleParse = async () => {
    if (!selectedFile) return;

    const parser = getTransactionParser(selectedParserId);
    if (!parser) {
      setParseError("Selected parser not found");
      return;
    }

    setIsLoading(true);
    setParseError(null);

    try {
      const result = await parser.parse(selectedFile.uri, selectedFile.extension);

      if (!result.ok) {
        setParseError(result.errors.join("\n"));
        setParseResult(null);
      } else if (result.transactions.length === 0) {
        setParseError("No transactions found in the file. Check if the file format is correct.");
        setParseResult(null);
      } else {
        setParseResult(result);
        setStep("account");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to parse file";
      setParseError(message);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle account selection and proceed to review
  const handleProceedToReview = async () => {
    if (!selectedAccountId || !parseResult || !selectedAccount) return;

    setIsFetchingPrices(true);
    setStep("review");

    try {
      // Fetch prices for all symbols
      const symbols = getSymbolsFromTransactions(parseResult);
      const newPriceMap = new Map<string, { price: number; companyName: string }>();

      const result = await fetchLivePrices(symbols);
      if (result.ok && result.data) {
        for (const quote of result.data) {
          newPriceMap.set(quote.symbol.toUpperCase(), {
            price: quote.price,
            companyName: quote.symbol, // Name comes from parsed data, not quote
          });
        }
      }

      setPriceMap(newPriceMap);

      // Build review data
      const review = buildTransactionImportReviewData(
        parseResult,
        selectedAccountId,
        newPriceMap
      );
      setReviewData(review);
    } catch (error) {
      // Even if price fetch fails, build review with empty price map
      const review = buildTransactionImportReviewData(
        parseResult,
        selectedAccountId,
        new Map()
      );
      setReviewData(review);
    } finally {
      setIsFetchingPrices(false);
    }
  };

  // Handle commit
  const handleCommit = () => {
    if (!reviewData || !selectedAccount || !parseResult) return;

    setIsCommitting(true);

    try {
      const parser = getTransactionParser(selectedParserId);

      // Create transactions from parsed data
      const transactions = createTransactionsFromParseResult(
        parseResult,
        selectedAccountId,
        priceMap
      );

      // Replace all transactions for this account
      setAccountTransactions(selectedAccountId, transactions);

      // Save fetched prices to store for transaction-derived holdings
      if (updateMarketPrices && priceMap.size > 0) {
        const pricesRecord: Record<string, number> = {};
        for (const [symbol, data] of priceMap.entries()) {
          pricesRecord[symbol] = data.price;
        }
        updateMarketPrices(pricesRecord);
      }

      // Update account metadata
      if (updateAccount) {
        updateAccount(selectedAccountId, {
          dataSource: "transactions",
          lastImportedAt: new Date().toISOString(),
          lastImportSource: parser?.displayName || selectedParserId,
          updatedAt: new Date().toISOString(),
        });
      }

      onComplete({
        transactionCount: transactions.length,
        derivedHoldingCount: reviewData.derivedHoldings.length,
        accountName: selectedAccount.name,
        accountId: selectedAccountId,
        parserName: parser?.displayName || selectedParserId,
      });

      handleClose();
    } catch (error) {
      console.error("Transaction import commit failed:", error);
    } finally {
      setIsCommitting(false);
    }
  };

  // Format currency
  const formatValue = (value: number, currency: Currency = "USD"): string => {
    const symbol = currency === "USD" ? "$" : "₹";
    return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Render upload step
  const renderUploadStep = () => {
    const selectedParser = getTransactionParser(selectedParserId);

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Import Transactions</Text>
        <Text style={styles.stepDescription}>
          Select a transaction history file from your broker. Holdings will be derived from your buy/sell transactions.
        </Text>

        {/* Source selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Source</Text>
          <View style={styles.sourceSelector}>
            {availableParsers.map((parser: TransactionSourceParser) => {
              const isSelected = parser.id === selectedParserId;
              return (
                <Pressable
                  key={parser.id}
                  style={[styles.sourcePill, isSelected && styles.sourcePillActive]}
                  onPress={() => setSelectedParserId(parser.id)}
                >
                  <View style={styles.sourcePillContent}>
                    <Text style={[styles.sourcePillText, isSelected && styles.sourcePillTextActive]}>
                      {parser.displayName}
                    </Text>
                    {parser.recommended && (
                      <View style={[styles.recommendedBadge, isSelected && styles.recommendedBadgeActive]}>
                        <Text style={[styles.recommendedBadgeText, isSelected && styles.recommendedBadgeTextActive]}>
                          Recommended
                        </Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {selectedParser && (
            <Text style={styles.sourceHint}>
              Supports: {selectedParser.supportedExtensions.join(", ")}
            </Text>
          )}
        </View>

        {/* File picker */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>File</Text>
          <Pressable style={styles.filePickerButton} onPress={handleSelectFile}>
            <Text style={styles.filePickerButtonText}>
              {selectedFile ? selectedFile.name : "Choose File…"}
            </Text>
          </Pressable>
        </View>

        {/* Error message */}
        {parseError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{parseError}</Text>
          </View>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={handleClose}>
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, (!selectedFile || isLoading) && styles.buttonDisabled]}
            onPress={handleParse}
            disabled={!selectedFile || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={styles.primaryButtonText}>Parse File</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  // Render account step
  const renderAccountStep = () => {
    if (!parseResult) return null;

    const brokerNameDisplay = parseResult.brokerName || "Unknown";
    const buyCount = parseResult.transactions.filter(tx => tx.type === "BUY").length;
    const sellCount = parseResult.transactions.filter(tx => tx.type === "SELL").length;

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Select Account</Text>
        <Text style={styles.stepDescription}>
          Choose which account to import the transactions into. Existing transactions for this account will be replaced.
        </Text>

        {/* Parsed metadata */}
        <View style={styles.metadataBox}>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Source:</Text>
            <Text style={styles.metadataValue}>{brokerNameDisplay}</Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Transactions:</Text>
            <Text style={styles.metadataValue}>
              {parseResult.transactions.length} ({buyCount} buys, {sellCount} sells)
            </Text>
          </View>
          {parseResult.skippedRows.length > 0 && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Skipped:</Text>
              <Text style={[styles.metadataValue, styles.warningText]}>
                {parseResult.skippedRows.length} rows
              </Text>
            </View>
          )}
        </View>

        {/* Account list */}
        <ScrollView style={styles.accountList}>
          {sortedAccounts.map((account) => {
            const isSelected = account.id === selectedAccountId;
            const isTransactionAccount = account.dataSource === "transactions";
            return (
              <Pressable
                key={account.id}
                style={[styles.accountRow, isSelected && styles.accountRowSelected]}
                onPress={() => setSelectedAccountId(account.id)}
              >
                <View style={styles.accountInfo}>
                  <Text style={[styles.accountName, isSelected && styles.accountNameSelected]}>
                    {account.name}
                  </Text>
                  <Text style={styles.accountMeta}>
                    {account.broker} • {account.baseCurrency}
                    {isTransactionAccount && " • Transaction-based"}
                  </Text>
                </View>
                <View style={[styles.radioCircle, isSelected && styles.radioCircleSelected]}>
                  {isSelected && <View style={styles.radioInner} />}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={() => setStep("upload")}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, !selectedAccountId && styles.buttonDisabled]}
            onPress={handleProceedToReview}
            disabled={!selectedAccountId}
          >
            <Text style={styles.primaryButtonText}>Review</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  // Render review step
  const renderReviewStep = () => {
    if (!reviewData || !selectedAccount) return null;

    const currency = parseResult?.currency || selectedAccount.baseCurrency;

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Review Import</Text>
        <Text style={styles.stepDescription}>
          Holdings derived from your transactions using FIFO cost basis.
        </Text>

        {isFetchingPrices ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Fetching prices…</Text>
          </View>
        ) : (
          <>
            {/* Summary */}
            <View style={styles.summaryBox}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Transactions:</Text>
                <Text style={styles.summaryValue}>{reviewData.transactionCount}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Derived Holdings:</Text>
                <Text style={styles.summaryValue}>{reviewData.derivedHoldings.length}</Text>
              </View>
              {reviewData.derivationErrors.length > 0 && (
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Warnings:</Text>
                  <Text style={[styles.summaryValue, styles.warningText]}>
                    {reviewData.derivationErrors.length}
                  </Text>
                </View>
              )}
            </View>

            {/* Derivation errors */}
            {reviewData.derivationErrors.length > 0 && (
              <View style={styles.warningBox}>
                <Text style={styles.warningTitle}>Warnings</Text>
                {reviewData.derivationErrors.map((error, idx) => (
                  <Text key={idx} style={styles.warningText}>• {error}</Text>
                ))}
              </View>
            )}

            {/* Derived holdings */}
            <Text style={styles.sectionTitle}>
              Derived Holdings ({reviewData.derivedHoldings.length})
            </Text>
            <ScrollView style={styles.holdingsList}>
              {reviewData.derivedHoldings.map((holding: EnrichedHolding, idx) => (
                <View key={idx} style={styles.holdingRow}>
                  <View style={styles.holdingInfo}>
                    <Text style={styles.holdingSymbol}>{holding.parsed.symbol}</Text>
                    <Text style={styles.holdingName} numberOfLines={1}>
                      {holding.companyName || holding.parsed.symbol}
                    </Text>
                  </View>
                  <View style={styles.holdingValues}>
                    <Text style={styles.holdingQuantity}>
                      {holding.parsed.quantity.toLocaleString()} shares
                    </Text>
                    <Text style={styles.holdingCost}>
                      Avg: {formatValue(holding.parsed.avgPrice, currency)}
                    </Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* Actions */}
        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={() => setStep("account")}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Pressable
            style={[styles.primaryButton, (isFetchingPrices || isCommitting) && styles.buttonDisabled]}
            onPress={handleCommit}
            disabled={isFetchingPrices || isCommitting}
          >
            {isCommitting ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={styles.primaryButtonText}>
                Import {reviewData?.transactionCount || 0} Transactions
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
        {/* Progress indicator */}
        <View style={styles.progress}>
          {["upload", "account", "review"].map((s, idx) => (
            <View
              key={s}
              style={[
                styles.progressDot,
                (step === s || 
                 (step === "account" && idx < 1) ||
                 (step === "review" && idx < 2)) && styles.progressDotActive,
              ]}
            />
          ))}
        </View>

        {step === "upload" && renderUploadStep()}
        {step === "account" && renderAccountStep()}
        {step === "review" && renderReviewStep()}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.6)",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  container: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#262B33",
    backgroundColor: colors.bg,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 40,
    elevation: 24,
  },
  progress: {
    flexDirection: "row",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.border,
  },
  progressDotActive: {
    backgroundColor: colors.accent,
  },
  stepContent: {
    flex: 1,
    padding: spacing.lg,
  },
  stepTitle: {
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  stepDescription: {
    fontSize: typography.body,
    color: colors.muted,
    marginBottom: spacing.lg,
  },
  fieldGroup: {
    marginBottom: spacing.lg,
  },
  fieldLabel: {
    fontSize: typography.caption,
    color: colors.muted,
    marginBottom: spacing.xs,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sourceSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  sourcePill: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  sourcePillActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sourcePillContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  sourcePillText: {
    fontSize: typography.caption,
    color: colors.muted,
  },
  sourcePillTextActive: {
    color: colors.bg,
    fontWeight: typography.weightSemibold,
  },
  recommendedBadge: {
    backgroundColor: `${colors.positive}22`,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  recommendedBadgeActive: {
    backgroundColor: `${colors.bg}33`,
  },
  recommendedBadgeText: {
    fontSize: 9,
    fontWeight: typography.weightSemibold,
    color: colors.positive,
  },
  recommendedBadgeTextActive: {
    color: colors.bg,
  },
  sourceHint: {
    fontSize: typography.caption,
    color: colors.muted,
    marginTop: spacing.xs,
  },
  filePickerButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    padding: spacing.lg,
    alignItems: "center",
  },
  filePickerButtonText: {
    fontSize: typography.body,
    color: colors.muted,
  },
  errorBox: {
    backgroundColor: colors.negative + "20",
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: typography.caption,
    color: colors.negative,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.md,
    marginTop: "auto",
    paddingTop: spacing.lg,
    justifyContent: "flex-end",
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  primaryButtonText: {
    fontSize: typography.body,
    color: colors.bg,
    fontWeight: typography.weightSemibold,
  },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
  },
  secondaryButtonText: {
    fontSize: typography.body,
    color: colors.text,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  metadataBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  metadataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  metadataLabel: {
    fontSize: typography.caption,
    color: colors.muted,
  },
  metadataValue: {
    fontSize: typography.caption,
    color: colors.text,
    fontWeight: typography.weightMedium,
  },
  metadataValueMissing: {
    color: colors.muted,
    fontStyle: "italic",
  },
  accountList: {
    flex: 1,
    marginBottom: spacing.md,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  accountRowSelected: {
    borderColor: colors.accent,
    backgroundColor: colors.accent + "10",
  },
  accountInfo: {
    flex: 1,
  },
  accountName: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: typography.weightMedium,
  },
  accountNameSelected: {
    color: colors.accent,
  },
  accountMeta: {
    fontSize: typography.caption,
    color: colors.muted,
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleSelected: {
    borderColor: colors.accent,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  loadingText: {
    fontSize: typography.body,
    color: colors.muted,
  },
  summaryBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: spacing.xs,
  },
  summaryLabel: {
    fontSize: typography.body,
    color: colors.muted,
  },
  summaryValue: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: typography.weightSemibold,
  },
  warningBox: {
    backgroundColor: colors.warning + "20",
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warningTitle: {
    fontSize: typography.caption,
    color: colors.warning,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.xs,
  },
  warningText: {
    fontSize: typography.caption,
    color: colors.warning,
  },
  sectionTitle: {
    fontSize: typography.caption,
    color: colors.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
  },
  holdingsList: {
    flex: 1,
  },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  holdingInfo: {
    flex: 1,
  },
  holdingSymbol: {
    fontSize: typography.body,
    color: colors.text,
    fontWeight: typography.weightSemibold,
  },
  holdingName: {
    fontSize: typography.caption,
    color: colors.muted,
    marginTop: 2,
  },
  holdingValues: {
    alignItems: "flex-end",
  },
  holdingQuantity: {
    fontSize: typography.body,
    color: colors.text,
  },
  holdingCost: {
    fontSize: typography.caption,
    color: colors.muted,
  },
});





