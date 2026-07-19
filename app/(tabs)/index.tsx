import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { TourTarget } from "../../src/components/OnboardingTourProvider";
import { PortfolioPerformanceChart, type PortfolioHistoryPoint, type TimeRangeView } from "../../src/components/PortfolioPerformanceChart";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { UserMenu } from "../../src/components/UserMenu";
import { CurrencyToggle } from "../../src/components/CurrencyToggle";
import { AddAccountModal, type AddAccountInput } from "../../src/components/AddAccountModal";
import { ImportTransactionsModal } from "../../src/components/ImportTransactionsModal";
import { HoldingsSection } from "./holdings";
import {
  calcPortfolioTotals,
  calcPortfolioPerformanceHistory,
} from "../../src/features/portfolio/calculations";
import { selectAllHoldings } from "../../src/features/portfolio/selectors";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { radii, spacing, typography, useTheme } from "../../src/theme";
import { accountSupportsHoldings, type Currency } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

export default function DashboardScreen() {
  const { colors } = useTheme();
  const manualHoldings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const accounts = usePortfolioStore((s) => s.accounts);
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);
  const transactions = usePortfolioStore((s) => s.transactions);
  const marketPrices = usePortfolioStore((s) => s.marketPrices);
  const addAccount = usePortfolioStore((s) => s.addAccount);
  const addCashHolding = usePortfolioStore((s) => s.addCashHolding);
  const updateAccount = usePortfolioStore((s) => s.updateAccount);
  const setAccountTransactions = usePortfolioStore((s) => s.setAccountTransactions);
  const updateMarketPrices = usePortfolioStore((s) => s.updateMarketPrices);

  // Convert marketPrices record to Map for selectAllHoldings
  const priceMap = useMemo(() => new Map(Object.entries(marketPrices)), [marketPrices]);

  // Combine manual holdings + derived holdings from transaction-sourced accounts
  const holdings = useMemo(
    () => selectAllHoldings(manualHoldings, transactions, accounts, priceMap),
    [manualHoldings, transactions, accounts, priceMap]
  );

  const [performanceView, setPerformanceView] = useState<TimeRangeView>("monthly");

  // Onboarding flow: add first account from the portfolio page, then import.
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [importAccountId, setImportAccountId] = useState<string | null>(null);

  const handleCreateAccount = (input: AddAccountInput) => {
    const timestamp = new Date().toISOString();
    const accountId = `acc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    addAccount({
      id: accountId,
      name: input.name,
      owner: input.owner,
      broker: input.broker,
      type: input.type,
      baseCurrency: input.baseCurrency,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    if (input.type === "SAVINGS") {
      addCashHolding({
        id: `cash-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        accountId,
        currency: input.baseCurrency,
        balance: input.savingsInitialBalance ?? 0,
        updatedAt: timestamp,
      });
    }

    setShowAddAccount(false);

    // After adding a broker account, open the import flow right away so the
    // new user can bring in their transactions.
    if (accountSupportsHoldings(input.type)) {
      setImportAccountId(accountId);
    }
  };

  const rc: Currency = settings.reportingCurrency;

  const totalsCashHoldings = useMemo(
    () => (settings.allocationIncludeCash ? cashHoldings : []),
    [settings.allocationIncludeCash, cashHoldings]
  );

  const totals = useMemo(
    () => calcPortfolioTotals(holdings, totalsCashHoldings, fxRates, rc),
    [holdings, totalsCashHoldings, fxRates, rc]
  );

  // Current market price per symbol (resolved live price from holdings).
  const currentPrices = useMemo(() => {
    const map = new Map<string, number>();
    for (const holding of holdings) {
      map.set(holding.symbol.toUpperCase(), holding.marketPrice);
    }
    return map;
  }, [holdings]);

  // Build performance chart data using the SAME per-holding logic (average
  // cost basis + Approach A market value) aggregated across all holdings.
  const performanceData = useMemo(
    (): PortfolioHistoryPoint[] =>
      calcPortfolioPerformanceHistory(transactions, currentPrices, fxRates, rc, performanceView),
    [transactions, currentPrices, fxRates, rc, performanceView]
  );

  // State A: No accounts at all — show centered empty state only
  const hasNoAccounts = accounts.length === 0;

  const onboardingModals = (
    <>
      <AddAccountModal
        visible={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onCreate={handleCreateAccount}
      />
      <ImportTransactionsModal
        visible={importAccountId !== null}
        accounts={accounts}
        preSelectedAccountId={importAccountId ?? undefined}
        onClose={() => setImportAccountId(null)}
        onComplete={() => setImportAccountId(null)}
        setAccountTransactions={setAccountTransactions}
        updateAccount={updateAccount}
        updateMarketPrices={updateMarketPrices}
        manualHoldings={manualHoldings}
      />
    </>
  );

  // Render State A — no accounts
  if (hasNoAccounts) {
    return (
      <ScreenContainer>
        <View style={styles.noAccountsContainer}>
          <View style={styles.headerRow}>
            <Text style={[styles.headerTitle, { color: colors.text }]}>Portfolio</Text>
            <View style={styles.headerControls}>
              <UserMenu />
            </View>
          </View>
          <View style={styles.noAccountsContent}>
            <View style={[styles.noAccountsIconWrap, { backgroundColor: colors.surface }]}>
              <Text style={styles.noAccountsIcon}>📊</Text>
            </View>
            <Text style={[styles.noAccountsTitle, { color: colors.text }]}>Nothing to track yet</Text>
            <Text style={[styles.noAccountsBody, { color: colors.muted }]}>
              Create an account first, then add holdings to see your dashboard come alive.
            </Text>
            <TourTarget tourKey="accounts-add">
              <Pressable
                style={[styles.noAccountsBtn, { backgroundColor: colors.accent }]}
                onPress={() => setShowAddAccount(true)}
              >
                <Text style={[styles.noAccountsBtnText, { color: colors.bg }]}>Add your first account</Text>
              </Pressable>
            </TourTarget>
          </View>
        </View>
        {onboardingModals}
      </ScreenContainer>
    );
  }

  // Render State B and normal state — has at least one account
  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Portfolio</Text>
          <View style={styles.headerControls}>
            <CurrencyToggle />
            <UserMenu />
          </View>
        </View>


        <TourTarget tourKey="overview">
          <View style={styles.heroSection}>
            <Text style={[styles.heroLabel, { color: colors.muted }]}>Total Portfolio Value</Text>
            <Text style={[styles.heroValue, { color: colors.text }]}>{formatMoney(totals.currentValue, rc)}</Text>

            <View style={styles.heroStatsWrap}>
              <View style={styles.heroStatRow}>
                <Text style={[styles.heroStatKey, { color: colors.muted }]}>Invested</Text>
                <Text style={[styles.heroStatValue, { color: colors.text }]}>{formatMoney(totals.investedValue, rc)}</Text>
              </View>

              <View style={styles.heroStatRow}>
                <Text style={[styles.heroStatKey, { color: colors.muted }]}>Gain/Loss</Text>
                <Text style={[
                  styles.heroStatGain,
                  { color: totals.gainLoss >= 0 ? colors.positive : colors.negative },
                ]}>
                  {totals.gainLoss >= 0 ? "+" : ""}
                  {formatMoney(totals.gainLoss, rc)}
                </Text>
                <View style={[
                  styles.gainBadge,
                  { backgroundColor: totals.gainLoss >= 0 ? `${colors.positive}22` : `${colors.negative}22` },
                ]}>
                <Text style={[
                  styles.gainBadgeText,
                  { color: totals.gainLoss >= 0 ? colors.positive : colors.negative },
                ]}>
                  {totals.gainLossPct >= 0 ? "+" : ""}
                  {totals.gainLossPct.toFixed(2)}%
                </Text>
              </View>
            </View>
          </View>
        </View>
        </TourTarget>

        {/* Portfolio Performance Chart */}
        {accounts.length > 0 && (
          <View style={styles.chartSection}>
            <PortfolioPerformanceChart
              data={performanceData}
              currency={rc}
            />
          </View>
        )}


        {/* Holdings — merged from the former standalone Holdings tab */}
        <View style={[styles.holdingsDivider, { borderTopColor: colors.border }]} />
        <HoldingsSection />
      </ScrollView>
      {onboardingModals}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 48,
  },
  // State A — no accounts centered empty state
  noAccountsContainer: {
    flex: 1,
  },
  noAccountsContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80, // offset for visual center accounting for header
  },
  noAccountsIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radii.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.lg,
  },
  noAccountsIcon: {
    fontSize: 28,
  },
  noAccountsTitle: {
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.xs,
    textAlign: "center",
  },
  noAccountsBody: {
    fontSize: typography.caption,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: spacing.lg,
  },
  noAccountsBtn: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm + 2,
  },
  noAccountsBtnText: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  headerRow: {
    marginBottom: spacing.xxxl,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerTitle: {
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  headerControls: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  heroSection: {
    marginBottom: spacing.lg,
  },
  heroLabel: {
    fontSize: typography.caption,
  },
  heroValue: {
    marginTop: spacing.xs,
    fontSize: 32,
    fontWeight: typography.weightSemibold,
    lineHeight: 36,
  },
  heroStatsWrap: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  heroStatRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.md,
  },
  heroStatKey: {
    width: 76,
    fontSize: typography.caption,
  },
  heroStatValue: {
    fontSize: typography.body,
  },
  heroStatGain: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  gainBadge: {
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    marginLeft: spacing.xs,
  },
  gainBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  chartSection: {
    marginBottom: spacing.xxxl,
  },
  holdingsDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xxxl,
  },
  sectionGap: {
    marginBottom: spacing.xxxl,
  },
  sectionLabel: {
    marginBottom: spacing.md,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  // Compact allocation controls
  allocationControls: {
    marginBottom: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  toggleLabel: {
    fontSize: 11,
  },
  toggleTrack: {
    width: 32,
    height: 18,
    borderRadius: 9,
    justifyContent: "center",
  },
  toggleKnob: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  // Holdings list
  allocList: {
    gap: 0,
  },
  holdingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  holdingLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  holdingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  cashDotContainer: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  holdingInfo: {
    flex: 1,
  },
  holdingTickerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.xs,
  },
  holdingTicker: {
    fontSize: typography.body,
    fontWeight: typography.weightBold,
  },
  allocationBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
  },
  allocationBadgeText: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  holdingName: {
    fontSize: typography.micro,
    marginTop: 1,
  },
  holdingRight: {
    alignItems: "flex-end",
    flexShrink: 0,
  },
  holdingValue: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    fontVariant: ["tabular-nums"],
  },
  holdingGain: {
    fontSize: typography.micro,
    marginTop: 1,
  },
  showMoreRow: {
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  showMoreText: {
    fontSize: typography.caption,
  },
  emptyCard: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  emptyTitle: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  emptyBody: {
    marginTop: spacing.xs,
    fontSize: typography.caption,
    lineHeight: 18,
  },
  emptyPrimaryBtn: {
    marginTop: spacing.md,
    alignSelf: "flex-start",
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  emptyPrimaryBtnText: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
});

