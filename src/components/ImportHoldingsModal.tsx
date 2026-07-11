/**
 * Import Holdings Modal
 *
 * Multi-step modal for importing holdings from broker exports.
 * Steps:
 * 1. Upload: Select file and source parser
 * 2. Account Selection: Pick target account
 * 3. Review: Preview changes before committing
 * 4. Commit: Apply changes to selected account
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
import { accountSupportsHoldings, type Account, type Currency, type Holding } from "../types/portfolio";
import type { HoldingsSourceParser, ParseResult, SkippedRow, ImportReviewData, EnrichedHolding, HoldingComparison } from "../features/import/types";
import { getAllParsers, getDefaultParserId, getParser } from "../features/import/parserRegistry";
import { buildImportReviewData, commitImport, getSymbolsForPriceFetch } from "../features/import/importLogic";
import { fetchLivePrices } from "../services/yahooFinanceService";

type ImportStep = "upload" | "account" | "review" | "complete";

interface ImportHoldingsModalProps {
  visible: boolean;
  accounts: Account[];
  existingHoldings: Holding[];
  onClose: () => void;
  onComplete: (result: ImportCompleteResult) => void;
  addHolding: (holding: Holding) => void;
  updateHolding: (holdingId: string, updates: Partial<Holding>) => void;
}

interface ImportCompleteResult {
  addedCount: number;
  updatedCount: number;
  accountName: string;
}

export function ImportHoldingsModal({
  visible,
  accounts,
  existingHoldings,
  onClose,
  onComplete,
  addHolding,
  updateHolding,
}: ImportHoldingsModalProps) {
  // Step state
  const [step, setStep] = useState<ImportStep>("upload");

  // Upload step state
  const [selectedParserId, setSelectedParserId] = useState(getDefaultParserId());
  const [selectedFile, setSelectedFile] = useState<{
    uri: string;
    name: string;
    extension: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Account step state
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");

  // Review step state
  const [reviewData, setReviewData] = useState<ImportReviewData | null>(null);
  const [priceMap, setPriceMap] = useState<Map<string, { price: number; companyName: string }>>(new Map());
  const [isFetchingPrices, setIsFetchingPrices] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);

  // Get available parsers
  const availableParsers = useMemo(() => getAllParsers(), []);

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

  // Reset state when modal closes
  const handleClose = () => {
    setStep("upload");
    setSelectedFile(null);
    setParseResult(null);
    setParseError(null);
    setSelectedAccountId("");
    setReviewData(null);
    setPriceMap(new Map());
    setShowUnchanged(false);
    onClose();
  };

  // Handle file selection
  const handleSelectFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
          "application/vnd.apple.numbers", // .numbers
          "application/octet-stream", // fallback for .numbers
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

    const parser = getParser(selectedParserId);
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
      } else if (result.holdings.length === 0) {
        setParseError("No holdings found in the file. Check if the file format is correct.");
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
      const symbols = getSymbolsForPriceFetch(parseResult);
      const newPriceMap = new Map<string, { price: number; companyName: string }>();

      const result = await fetchLivePrices(symbols);
      if (result.ok && result.data) {
        for (const quote of result.data) {
          newPriceMap.set(quote.symbol.toUpperCase(), {
            price: quote.price,
            companyName: quote.name || quote.symbol,
          });
        }
      }

      setPriceMap(newPriceMap);

      // Build review data
      const review = buildImportReviewData(
        parseResult,
        existingHoldings,
        selectedAccountId,
        newPriceMap
      );
      setReviewData(review);
    } catch (error) {
      // Even if price fetch fails, build review with empty price map
      const review = buildImportReviewData(
        parseResult,
        existingHoldings,
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
      const currency: Currency = parseResult.currency || selectedAccount.baseCurrency;

      const result = commitImport(
        reviewData,
        selectedAccountId,
        currency,
        priceMap,
        existingHoldings,
        addHolding,
        updateHolding
      );

      onComplete({
        addedCount: result.summary.addedCount,
        updatedCount: result.summary.updatedCount,
        accountName: selectedAccount.name,
      });

      handleClose();
    } catch (error) {
      // Show error but don't close
      console.error("Import commit failed:", error);
    } finally {
      setIsCommitting(false);
    }
  };

  // Format currency
  const formatValue = (value: number, currency: Currency = "USD"): string => {
    const symbol = currency === "USD" ? "$" : "₹";
    return `${symbol}${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Render step content
  const renderUploadStep = () => {
    const selectedParser = getParser(selectedParserId);

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Import Holdings</Text>
        <Text style={styles.stepDescription}>
          Select a holdings export file from your broker to import.
        </Text>

        {/* Source selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Source</Text>
          <View style={styles.sourceSelector}>
            {availableParsers.map((parser: HoldingsSourceParser) => {
              const isSelected = parser.id === selectedParserId;
              return (
                <Pressable
                  key={parser.id}
                  style={[styles.sourcePill, isSelected && styles.sourcePillActive]}
                  onPress={() => setSelectedParserId(parser.id)}
                >
                  <Text style={[styles.sourcePillText, isSelected && styles.sourcePillTextActive]}>
                    {parser.displayName}
                  </Text>
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

  const renderAccountStep = () => {
    if (!parseResult) return null;

    const brokerNameDisplay = parseResult.brokerName || "Broker/date info missing from file";
    const asOfDateDisplay = parseResult.asOfDate || "Date not available";

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Select Account</Text>
        <Text style={styles.stepDescription}>
          Choose which account to import the holdings into.
        </Text>

        {/* Parsed metadata */}
        <View style={styles.metadataBox}>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Broker:</Text>
            <Text
              style={[
                styles.metadataValue,
                !parseResult.brokerName && styles.metadataValueMissing,
              ]}
            >
              {brokerNameDisplay}
            </Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>As of:</Text>
            <Text
              style={[
                styles.metadataValue,
                !parseResult.asOfDate && styles.metadataValueMissing,
              ]}
            >
              {asOfDateDisplay}
            </Text>
          </View>
          <View style={styles.metadataRow}>
            <Text style={styles.metadataLabel}>Holdings found:</Text>
            <Text style={styles.metadataValue}>{parseResult.holdings.length}</Text>
          </View>
          {parseResult.skippedRows.length > 0 && (
            <View style={styles.metadataRow}>
              <Text style={styles.metadataLabel}>Rows skipped:</Text>
              <Text style={[styles.metadataValue, styles.metadataValueWarning]}>
                {parseResult.skippedRows.length}
              </Text>
            </View>
          )}
        </View>

        {/* Account selector */}
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>Target Account</Text>
          {holdingAccounts.length === 0 ? (
            <View style={styles.noAccountsBox}>
              <Text style={styles.noAccountsText}>
                No accounts available. Create a broker account first.
              </Text>
            </View>
          ) : (
            <ScrollView style={styles.accountList} nestedScrollEnabled>
              {sortedAccounts.map((account) => {
                const isSelected = account.id === selectedAccountId;
                const matchesBroker =
                  parseResult.brokerName &&
                  account.broker.toLowerCase().includes(parseResult.brokerName.toLowerCase());

                return (
                  <Pressable
                    key={account.id}
                    style={[styles.accountItem, isSelected && styles.accountItemSelected]}
                    onPress={() => setSelectedAccountId(account.id)}
                  >
                    <View style={styles.accountItemContent}>
                      <Text style={[styles.accountName, isSelected && styles.accountNameSelected]}>
                        {account.name}
                      </Text>
                      <Text style={styles.accountBroker}>
                        {account.broker} · {account.baseCurrency}
                      </Text>
                    </View>
                    {matchesBroker && (
                      <View style={styles.matchBadge}>
                        <Text style={styles.matchBadgeText}>Match</Text>
                      </View>
                    )}
                    {isSelected && (
                      <View style={styles.checkmark}>
                        <Text style={styles.checkmarkText}>✓</Text>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>

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
            <Text style={styles.primaryButtonText}>Preview Import</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  const renderReviewStep = () => {
    if (!parseResult || !selectedAccount) return null;

    const currency: Currency = parseResult.currency || selectedAccount.baseCurrency;

    // Loading state while fetching prices
    if (isFetchingPrices || !reviewData) {
      return (
        <View style={styles.stepContent}>
          <Text style={styles.stepTitle}>Preparing Review...</Text>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={styles.loadingText}>Fetching current prices...</Text>
          </View>
        </View>
      );
    }

    const { newHoldings, changedHoldings, unchangedHoldings, skippedRows, summary } = reviewData;

    return (
      <View style={styles.stepContent}>
        <Text style={styles.stepTitle}>Review Import</Text>
        <Text style={styles.stepDescription}>
          Review changes before importing to {selectedAccount.name}.
        </Text>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.summaryText}>
            <Text style={styles.summaryHighlight}>{summary.newCount}</Text> new,{" "}
            <Text style={styles.summaryHighlight}>{summary.changedCount}</Text> changed,{" "}
            <Text style={styles.summaryMuted}>{summary.unchangedCount}</Text> unchanged,{" "}
            <Text style={summary.skippedCount > 0 ? styles.summaryWarning : styles.summaryMuted}>
              {summary.skippedCount}
            </Text> skipped
          </Text>
        </View>

        <ScrollView style={styles.reviewScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
          {/* NEW Holdings */}
          {newHoldings.length > 0 && (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>
                New Holdings ({newHoldings.length})
              </Text>
              {newHoldings.map((item: EnrichedHolding, idx: number) => (
                <View key={`new-${idx}`} style={styles.reviewItem}>
                  <View style={styles.reviewItemHeader}>
                    <Text style={styles.reviewSymbol}>{item.parsed.symbol}</Text>
                    {item.warning && (
                      <View style={styles.warningBadge}>
                        <Text style={styles.warningBadgeText}>⚠</Text>
                      </View>
                    )}
                  </View>
                  {item.companyName && (
                    <Text style={styles.reviewCompany}>{item.companyName}</Text>
                  )}
                  <View style={styles.reviewDetails}>
                    <Text style={styles.reviewDetailText}>
                      {item.parsed.quantity} shares @ {formatValue(item.parsed.avgPrice, currency)}
                    </Text>
                    {item.currentPrice ? (
                      <Text style={styles.reviewDetailMuted}>
                        Current: {formatValue(item.currentPrice, currency)}
                      </Text>
                    ) : (
                      <Text style={styles.reviewDetailWarning}>Price unavailable</Text>
                    )}
                  </View>
                  <Text style={styles.reviewInvested}>
                    Cost basis: {formatValue(item.investedValue, currency)}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* CHANGED Holdings */}
          {changedHoldings.length > 0 && (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitle}>
                Changed Holdings ({changedHoldings.length})
              </Text>
              {changedHoldings.map((item: HoldingComparison, idx: number) => (
                <View key={`changed-${idx}`} style={styles.reviewItem}>
                  <Text style={styles.reviewSymbol}>{item.symbol}</Text>
                  <Text style={styles.reviewCompany}>{item.companyName}</Text>
                  <View style={styles.changeComparison}>
                    <View style={styles.changeColumn}>
                      <Text style={styles.changeLabel}>Current</Text>
                      <Text style={styles.changeOld}>
                        {item.existingQuantity} @ {formatValue(item.existingAvgPrice, currency)}
                      </Text>
                    </View>
                    <Text style={styles.changeArrow}>→</Text>
                    <View style={styles.changeColumn}>
                      <Text style={styles.changeLabel}>New</Text>
                      <Text style={styles.changeNew}>
                        {item.newQuantity} @ {formatValue(item.newAvgPrice, currency)}
                      </Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* UNCHANGED Holdings (collapsed) */}
          {unchangedHoldings.length > 0 && (
            <View style={styles.reviewSection}>
              <Pressable
                style={styles.unchangedHeader}
                onPress={() => setShowUnchanged(!showUnchanged)}
              >
                <Text style={styles.reviewSectionTitleMuted}>
                  Unchanged ({unchangedHoldings.length})
                </Text>
                <Text style={styles.expandIcon}>{showUnchanged ? "▼" : "▶"}</Text>
              </Pressable>
              {showUnchanged && (
                <View style={styles.unchangedList}>
                  {unchangedHoldings.map((item, idx: number) => (
                    <Text key={`unchanged-${idx}`} style={styles.unchangedItem}>
                      {item.symbol}
                    </Text>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Skipped Rows */}
          {skippedRows.length > 0 && (
            <View style={styles.reviewSection}>
              <Text style={styles.reviewSectionTitleWarning}>
                Skipped Rows ({skippedRows.length})
              </Text>
              {skippedRows.map((row: SkippedRow, idx: number) => (
                <View key={`skipped-${idx}`} style={styles.skippedItem}>
                  <Text style={styles.skippedRowNumber}>Row {row.rawRowIndex}:</Text>
                  <Text style={styles.skippedRowReason}>{row.reason}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        {/* Actions */}
        <View style={styles.reviewActions}>
          <Pressable style={styles.secondaryButton} onPress={() => setStep("account")}>
            <Text style={styles.secondaryButtonText}>Back</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={handleClose}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={[
              styles.confirmButton,
              (isCommitting || (summary.newCount === 0 && summary.changedCount === 0)) &&
                styles.buttonDisabled,
            ]}
            onPress={handleCommit}
            disabled={isCommitting || (summary.newCount === 0 && summary.changedCount === 0)}
          >
            {isCommitting ? (
              <ActivityIndicator size="small" color={colors.bg} />
            ) : (
              <Text style={styles.confirmButtonText}>Confirm Import</Text>
            )}
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {step === "upload" && renderUploadStep()}
            {step === "account" && renderAccountStep()}
            {step === "review" && renderReviewStep()}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.lg,
  },
  modal: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.lg,
    width: "100%",
    maxWidth: 500,
    maxHeight: "90%",
  },
  stepContent: {
    gap: spacing.lg,
  },
  stepTitle: {
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  stepDescription: {
    color: colors.muted,
    fontSize: typography.body,
    lineHeight: 22,
  },
  fieldGroup: {
    gap: spacing.sm,
  },
  fieldLabel: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  sourceSelector: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  sourcePill: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bg,
  },
  sourcePillActive: {
    backgroundColor: colors.accent,
  },
  sourcePillText: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  sourcePillTextActive: {
    color: colors.bg,
  },
  sourceHint: {
    color: colors.muted,
    fontSize: typography.micro,
    marginTop: spacing.xs,
  },
  filePickerButton: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
  },
  filePickerButtonText: {
    color: colors.text,
    fontSize: typography.body,
  },
  errorBox: {
    backgroundColor: `${colors.negative}22`,
    borderRadius: radii.md,
    padding: spacing.md,
  },
  errorText: {
    color: colors.negative,
    fontSize: typography.caption,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 100,
    alignItems: "center",
  },
  primaryButtonText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  secondaryButton: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  metadataBox: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.xs,
  },
  metadataRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metadataLabel: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  metadataValue: {
    color: colors.text,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  metadataValueMissing: {
    color: colors.muted,
    fontStyle: "italic",
  },
  metadataValueWarning: {
    color: colors.warning,
  },
  noAccountsBox: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.lg,
    alignItems: "center",
  },
  noAccountsText: {
    color: colors.muted,
    fontSize: typography.body,
    textAlign: "center",
  },
  accountList: {
    maxHeight: 200,
  },
  accountItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  accountItemSelected: {
    backgroundColor: `${colors.accent}22`,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  accountItemContent: {
    flex: 1,
  },
  accountName: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  accountNameSelected: {
    color: colors.accent,
  },
  accountBroker: {
    color: colors.muted,
    fontSize: typography.micro,
    marginTop: 2,
  },
  matchBadge: {
    backgroundColor: `${colors.positive}22`,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginRight: spacing.sm,
  },
  matchBadgeText: {
    color: colors.positive,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  checkmark: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  checkmarkText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  // Review step styles
  loadingContainer: {
    alignItems: "center",
    padding: spacing.xxl,
    gap: spacing.lg,
  },
  loadingText: {
    color: colors.muted,
    fontSize: typography.body,
  },
  summaryBox: {
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: spacing.md,
  },
  summaryText: {
    color: colors.text,
    fontSize: typography.body,
    textAlign: "center",
  },
  summaryHighlight: {
    color: colors.accent,
    fontWeight: typography.weightSemibold,
  },
  summaryMuted: {
    color: colors.muted,
  },
  summaryWarning: {
    color: colors.warning,
  },
  reviewScroll: {
    maxHeight: 350,
  },
  reviewSection: {
    marginBottom: spacing.lg,
  },
  reviewSectionTitle: {
    color: colors.positive,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.sm,
  },
  reviewSectionTitleMuted: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  reviewSectionTitleWarning: {
    color: colors.warning,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.sm,
  },
  reviewItem: {
    backgroundColor: colors.bg,
    borderRadius: radii.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
  },
  reviewItemHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  reviewSymbol: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  reviewCompany: {
    color: colors.muted,
    fontSize: typography.micro,
    marginTop: 2,
  },
  reviewDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: spacing.sm,
  },
  reviewDetailText: {
    color: colors.text,
    fontSize: typography.caption,
  },
  reviewDetailMuted: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  reviewDetailWarning: {
    color: colors.warning,
    fontSize: typography.caption,
  },
  reviewInvested: {
    color: colors.muted,
    fontSize: typography.micro,
    marginTop: spacing.xs,
  },
  warningBadge: {
    backgroundColor: `${colors.warning}33`,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.xs,
  },
  warningBadgeText: {
    color: colors.warning,
    fontSize: typography.micro,
  },
  changeComparison: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  changeColumn: {
    flex: 1,
  },
  changeLabel: {
    color: colors.muted,
    fontSize: typography.micro,
    marginBottom: 2,
  },
  changeOld: {
    color: colors.muted,
    fontSize: typography.caption,
    textDecorationLine: "line-through",
  },
  changeNew: {
    color: colors.accent,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  changeArrow: {
    color: colors.muted,
    fontSize: typography.body,
  },
  unchangedHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  expandIcon: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  unchangedList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  unchangedItem: {
    color: colors.muted,
    fontSize: typography.caption,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  skippedItem: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  skippedRowNumber: {
    color: colors.muted,
    fontSize: typography.micro,
    width: 50,
  },
  skippedRowReason: {
    color: colors.warning,
    fontSize: typography.micro,
    flex: 1,
  },
  reviewActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  cancelButton: {
    backgroundColor: "transparent",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  cancelButtonText: {
    color: colors.negative,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  confirmButton: {
    backgroundColor: colors.positive,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    minWidth: 120,
    alignItems: "center",
  },
  confirmButtonText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
});

export default ImportHoldingsModal;

