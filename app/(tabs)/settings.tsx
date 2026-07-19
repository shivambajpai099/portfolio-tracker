import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { TourTarget, useOnboardingTour } from "../../src/components/OnboardingTourProvider";
import { PortfolioGuideModal } from "../../src/components/PortfolioGuideModal";
import { StockSplitManagerModal } from "../../src/components/StockSplitManagerModal";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { Card, SectionLabel, SegToggle } from "../../src/components/SpecUI";
import { UserMenu } from "../../src/components/UserMenu";
import { AccountsSection } from "./accounts";
import { fetchUsdInrRate } from "../../src/services/yahooFinanceService";
import { useAuthStore } from "../../src/store/authStore";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { spec } from "../../src/theme/specTokens";
import type { AllocationBasis, Currency, ThemeMode, TimelineRetention } from "../../src/types/portfolio";

interface PortfolioExport {
  exportedAt: string;
  accounts: unknown;
  holdings: unknown;
  cashHoldings: unknown;
  settings: unknown;
  fxRates: unknown;
}

export default function SettingsScreen() {
  const fxRates = usePortfolioStore((s) => s.fxRates);
  const settings = usePortfolioStore((s) => s.settings);
  const accounts = usePortfolioStore((s) => s.accounts);
  const holdings = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const updateFxRates = usePortfolioStore((s) => s.updateFxRates);
  const updateSettings = usePortfolioStore((s) => s.updateSettings);
  const addAccount = usePortfolioStore((s) => s.addAccount);
  const addHolding = usePortfolioStore((s) => s.addHolding);
  const addCashHolding = usePortfolioStore((s) => s.addCashHolding);
  const clearAllData = usePortfolioStore((s) => s.clearAllData);
  const signOut = useAuthStore((s) => s.signOut);

  const [rateInput, setRateInput] = useState(String(fxRates.USDINR));
  const [rateError, setRateError] = useState("");
  const [rateLoading, setRateLoading] = useState(false);
  const [rateSource, setRateSource] = useState<"live" | "manual">("manual");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showSplits, setShowSplits] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  const flash = (msg: string) => {
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(""), 3000);
  };

  // ── FX rate ──────────────────────────────────────────────────────────────
  const commitRate = () => {
    const parsed = parseFloat(rateInput);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setRateError("Enter a valid positive number.");
      return;
    }
    setRateError("");
    setRateSource("manual");
    updateFxRates({ USDINR: parsed });
    flash("Exchange rate saved.");
  };

  // Fetch the live USD/INR rate and auto-populate it. Users can still edit
  // the value manually afterwards (this only overwrites on success).
  const refreshLiveRate = async (announce = true) => {
    setRateLoading(true);
    setRateError("");
    try {
      // A user-triggered refresh (announce) bypasses the 20-min price cache so
      // the button always fetches a fresh rate; the silent mount refresh reuses
      // the cache to avoid an extra upstream call.
      const result = await fetchUsdInrRate(undefined, announce);
      if (result.ok) {
        const rounded = Math.round(result.data * 100) / 100;
        setRateInput(String(rounded));
        setRateSource("live");
        updateFxRates({ USDINR: rounded });
        if (announce) flash("Live USD/INR rate applied.");
      } else if (announce) {
        flash("Could not fetch live rate. Edit manually if needed.");
      }
    } catch {
      if (announce) flash("Could not fetch live rate. Edit manually if needed.");
    } finally {
      setRateLoading(false);
    }
  };

  // Auto-populate the live rate once when the screen first mounts.
  useEffect(() => {
    void refreshLiveRate(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Reporting currency ───────────────────────────────────────────────────
  const setReportingCurrency = (currency: Currency) => {
    updateSettings({ reportingCurrency: currency });
    flash(`Display currency set to ${currency}.`);
  };

  // ── Export ───────────────────────────────────────────────────────────────
  const handleExport = async () => {
    try {
      const payload: PortfolioExport = {
        exportedAt: new Date().toISOString(),
        accounts,
        holdings,
        cashHoldings,
        settings,
        fxRates,
      };
      const json = JSON.stringify(payload, null, 2);
      const filename = `portfolio-${Date.now()}.json`;

      if (Platform.OS === "web") {
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = filename;
        anchor.click();
        URL.revokeObjectURL(url);
        flash("Portfolio exported.");
        return;
      }

      const path = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(path, { mimeType: "application/json", dialogTitle: "Export portfolio" });
      } else {
        flash("Sharing not available on this platform.");
      }
    } catch {
      flash("Export failed. Please try again.");
    }
  };

  // ── Import ───────────────────────────────────────────────────────────────
  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: "application/json", copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      const uri = result.assets[0].uri;
      let raw: string;

      if (Platform.OS === "web") {
        raw = await new Promise<string>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("GET", uri);
          xhr.onload = () => resolve(xhr.responseText);
          xhr.onerror = reject;
          xhr.send();
        });
      } else {
        raw = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.UTF8 });
      }

      const data = JSON.parse(raw) as Partial<PortfolioExport>;

      if (!data.accounts || !data.holdings) {
        flash("Invalid file: missing accounts or holdings.");
        return;
      }

      clearAllData();

      for (const account of data.accounts as Parameters<typeof addAccount>[0][]) {
        addAccount(account);
      }
      for (const holding of data.holdings as Parameters<typeof addHolding>[0][]) {
        addHolding(holding);
      }
      if (Array.isArray(data.cashHoldings)) {
        for (const cash of data.cashHoldings as Parameters<typeof addCashHolding>[0][]) {
          addCashHolding(cash);
        }
      }
      if (data.fxRates) {
        updateFxRates(data.fxRates as typeof fxRates);
      }
      if (data.settings) {
        updateSettings(data.settings as typeof settings);
        setRateInput(String((data.fxRates as typeof fxRates)?.USDINR ?? fxRates.USDINR));
      }

      flash("Portfolio imported successfully.");
    } catch {
      flash("Import failed. Make sure the file is a valid portfolio export.");
    }
  };

  // ── Clear all ────────────────────────────────────────────────────────────
  const confirmClear = () => {
    clearAllData();
    setShowClearConfirm(false);
    flash("All data cleared.");
  };

  const handleSignOut = async () => {
    const ok = await signOut();
    if (!ok) {
      flash("Unable to sign out. Please try again.");
      return;
    }
    flash("Signed out.");
  };

  const { startTour } = useOnboardingTour();

  const closeGuide = () => {
    setShowGuide(false);
    if (!settings.onboardingTipsSeen) {
      updateSettings({ onboardingTipsSeen: true });
    }
  };

  const showGuideNextLaunch = () => {
    // Reset both the static guide and spotlight tour flags
    updateSettings({ onboardingTipsSeen: false, spotlightTourSeen: false });
    flash("Guide and tour will show next time you open the app.");
  };

  const startTourNow = () => {
    startTour();
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Settings</Text>
          <UserMenu />
        </View>

        {statusMsg ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        ) : null}

        {/* ── Accounts (primary management task) ────────────────────── */}
        <View style={styles.accountsSectionWrap}>
          <AccountsSection />
        </View>

        {/* ── Preferences (all display/allocation toggles grouped) ─── */}
        <TourTarget tourKey="settings">
          <SectionLabel>Preferences</SectionLabel>
          <View style={styles.prefGroup}>
            {/* Display currency */}
            <Card style={styles.prefCard}>
              <Text style={styles.prefTitle}>Display currency</Text>
              <Text style={styles.prefSubtitle}>Currency used across the app. Saved on this device.</Text>
              <SegToggle
                options={[
                  { value: "INR", label: "₹ INR" },
                  { value: "USD", label: "$ USD" },
                ]}
                value={settings.reportingCurrency}
                onChange={(c) => setReportingCurrency(c as Currency)}
              />
            </Card>

            {/* Exchange rate */}
            <Card style={styles.prefCard}>
              <View style={styles.rateTitleRow}>
                <Text style={styles.prefTitle}>Exchange rate</Text>
                <Pressable
                  style={styles.rateRefreshBtn}
                  onPress={() => refreshLiveRate(true)}
                  disabled={rateLoading}
                  accessibilityRole="button"
                  accessibilityLabel="Fetch live USD to INR rate"
                >
                  <Text style={styles.rateRefreshText}>{rateLoading ? "Fetching…" : "↺ Live rate"}</Text>
                </Pressable>
              </View>
              <Text style={styles.prefSubtitle}>
                {rateSource === "live"
                  ? "1 USD equals (auto-filled from live market rate — edit if needed)"
                  : "1 USD equals (enter manually or fetch the live rate)"}
              </Text>
              <View style={styles.rateRow}>
                <TextInput
                  value={rateInput}
                  onChangeText={(v) => {
                    setRateInput(v);
                    setRateError("");
                    setRateSource("manual");
                  }}
                  onSubmitEditing={commitRate}
                  keyboardType="decimal-pad"
                  returnKeyType="done"
                  style={styles.rateInput}
                  placeholderTextColor={spec.MUTED}
                />
                <Text style={styles.inrText}>INR</Text>
                <Pressable style={styles.saveBtn} onPress={commitRate}>
                  <Text style={styles.saveBtnText}>Save</Text>
                </Pressable>
              </View>
              {rateError ? <Text style={styles.errorText}>{rateError}</Text> : null}
            </Card>

            {/* Allocation basis */}
            <Card style={styles.prefCard}>
              <Text style={styles.prefTitle}>Allocation basis</Text>
              <Text style={styles.prefSubtitle}>Base allocation percentages on current or invested value.</Text>
              <SegToggle
                options={[
                  { value: "CURRENT_VALUE", label: "Current" },
                  { value: "INVESTED_VALUE", label: "Invested" },
                ]}
                value={settings.allocationBasis}
                onChange={(basis) => updateSettings({ allocationBasis: basis as AllocationBasis })}
              />
            </Card>

            {/* Cash in allocation */}
            <Card style={styles.prefCard}>
              <Text style={styles.prefTitle}>Cash in allocation</Text>
              <Text style={styles.prefSubtitle}>Include uninvested cash when computing allocations.</Text>
              <SegToggle
                options={[
                  { value: "true", label: "Include" },
                  { value: "false", label: "Exclude" },
                ]}
                value={String(settings.allocationIncludeCash)}
                onChange={(v) => updateSettings({ allocationIncludeCash: v === "true" })}
              />
            </Card>

            {/* Intraday trades */}
            <Card style={styles.prefCard}>
              <Text style={styles.prefTitle}>Intraday trades</Text>
              <Text style={styles.prefSubtitle}>
                Exclude same-day buy/sell round-trips from Insights so day-trading doesn’t skew win rate and holding periods.
              </Text>
              <SegToggle
                options={[
                  { value: "true", label: "Exclude" },
                  { value: "false", label: "Include" },
                ]}
                value={String(settings.excludeIntradayFromInsights ?? true)}
                onChange={(v) => updateSettings({ excludeIntradayFromInsights: v === "true" })}
              />
            </Card>

            {/* History retention */}
            <Card style={styles.prefCard}>
              <Text style={styles.prefTitle}>History retention</Text>
              <Text style={styles.prefSubtitle}>How much historical snapshot data to keep.</Text>
              <SegToggle
                options={[
                  { value: "6M", label: "6M" },
                  { value: "1Y", label: "1Y" },
                  { value: "2Y", label: "2Y" },
                  { value: "ALL", label: "All" },
                ]}
                value={settings.timelineRetention ?? "1Y"}
                onChange={(v) => updateSettings({ timelineRetention: v as TimelineRetention })}
              />
            </Card>

            {/* Theme */}
            <Card style={styles.prefCard}>
              <Text style={styles.prefTitle}>Theme</Text>
              <Text style={styles.prefSubtitle}>Appearance of the app interface.</Text>
              <SegToggle
                options={[
                  { value: "light", label: "Light" },
                  { value: "dark", label: "Dark" },
                  { value: "system", label: "System" },
                ]}
                value={settings.themeMode ?? "dark"}
                onChange={(v) => updateSettings({ themeMode: v as ThemeMode })}
              />
            </Card>
          </View>
        </TourTarget>

        {/* ── Help ─────────────────────────────────────────────────── */}
        <SectionLabel>Help</SectionLabel>
        <View style={styles.cardList}>
          <SettingsRow
            title="Start Guided Tour"
            subtitle="Walk through key features of the app step by step"
            icon="▶"
            onPress={startTourNow}
          />
          <SettingsRow
            title="Portfolio Guide"
            subtitle="Understand metrics, filters, and how to input holdings"
            icon="?"
            onPress={() => setShowGuide(true)}
          />
          <SettingsRow
            title="Show Guide on Next Launch"
            subtitle="Useful when sharing the app with someone new"
            icon="↺"
            onPress={showGuideNextLaunch}
          />
        </View>

        {/* ── Data ─────────────────────────────────────────────────── */}
        <SectionLabel>Data</SectionLabel>
        <View style={styles.cardList}>
          <SettingsRow
            title="Export Portfolio"
            subtitle="Save a JSON backup of all your data"
            icon="↑"
            onPress={handleExport}
          />
          <SettingsRow
            title="Import Portfolio"
            subtitle="Restore from a JSON backup file"
            icon="↓"
            onPress={handleImport}
          />
          <SettingsRow
            title="Stock Splits"
            subtitle="Fix averages after a split/bonus that wasn't auto-detected"
            icon="⇄"
            onPress={() => setShowSplits(true)}
          />
        </View>

        {/* ── Auth ─────────────────────────────────────────────────── */}
        <SectionLabel>Auth</SectionLabel>
        <View style={styles.cardList}>
          <SettingsRow
            title="Sign Out"
            subtitle="End current session on this device"
            icon="→"
            onPress={handleSignOut}
          />
        </View>

        {/* ── Danger zone ──────────────────────────────────────────── */}
        <SectionLabel style={styles.dangerLabel}>Danger Zone</SectionLabel>
        <Pressable onPress={() => setShowClearConfirm(true)} style={styles.dangerRow}>
          <View>
            <Text style={styles.dangerTitle}>Clear All Data</Text>
            <Text style={styles.actionSubtitle}>Permanently removes all accounts, holdings and balances</Text>
          </View>
          <Text style={styles.dangerIcon}>✕</Text>
        </Pressable>
      </ScrollView>

      {/* ── Clear confirmation modal ─────────────────────────────── */}
      <Modal visible={showClearConfirm} transparent animationType="fade" onRequestClose={() => setShowClearConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Clear all data?</Text>
            <Text style={styles.modalText}>
              This will permanently delete all accounts, holdings, and cash balances. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setShowClearConfirm(false)}>
                <Text style={{ color: spec.SUB }}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={confirmClear}>
                <Text style={styles.dangerBtnText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <PortfolioGuideModal visible={showGuide} onClose={closeGuide} />
      <StockSplitManagerModal visible={showSplits} onClose={() => setShowSplits(false)} />
    </ScreenContainer>
  );
}

function SettingsRow({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.actionCard}>
      <View style={styles.actionTextWrap}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionSubtitle}>{subtitle}</Text>
      </View>
      <Text style={styles.actionIcon}>{icon}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 112,
  },
  headerRow: {
    marginBottom: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 24,
    fontWeight: "700",
    color: "#F2F4F8",
  },
  statusCard: {
    marginBottom: 16,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: spec.CARD,
    borderWidth: 1,
    borderColor: spec.BDR,
  },
  statusText: {
    fontSize: 14,
    color: spec.TEAL,
  },
  accountsSectionWrap: {
    marginBottom: 16,
  },
  prefGroup: {
    gap: 12,
    marginBottom: 28,
  },
  prefCard: {
    padding: 16,
    gap: 8,
  },
  prefTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F2F4F8",
  },
  prefSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    color: spec.SUB,
    marginBottom: 4,
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  rateTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rateRefreshBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  rateRefreshText: {
    fontSize: 12,
    fontWeight: "600",
    color: spec.TEAL,
  },
  rateInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: spec.CARD2,
    borderWidth: 1,
    borderColor: spec.BDR,
    color: "#F2F4F8",
  },
  inrText: {
    fontSize: 14,
    color: spec.SUB,
  },
  saveBtn: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: spec.TEAL,
  },
  saveBtnText: {
    fontWeight: "700",
    color: "#000",
  },
  errorText: {
    marginTop: 4,
    fontSize: 12,
    color: spec.RED,
  },
  cardList: {
    marginBottom: 16,
    gap: 8,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: spec.CARD,
    borderWidth: 1,
    borderColor: spec.BDR,
  },
  actionTextWrap: {
    flex: 1,
    paddingRight: 12,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#F2F4F8",
  },
  actionSubtitle: {
    marginTop: 2,
    fontSize: 12,
    color: spec.SUB,
  },
  actionIcon: {
    fontSize: 16,
    color: spec.TEAL,
  },
  dangerLabel: {
    marginTop: 28,
  },
  dangerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: "rgba(248,113,113,0.25)",
    backgroundColor: spec.CARD,
  },
  dangerTitle: {
    fontSize: 14,
    fontWeight: "500",
    color: spec.RED,
  },
  dangerIcon: {
    fontSize: 16,
    color: spec.RED,
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 24,
  },
  modalCard: {
    width: "100%",
    borderRadius: 20,
    padding: 24,
    backgroundColor: spec.CARD,
    borderWidth: 1,
    borderColor: spec.BDR,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#F2F4F8",
  },
  modalText: {
    marginTop: 8,
    fontSize: 14,
    color: spec.SUB,
  },
  modalActions: {
    marginTop: 28,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  ghostBtn: {
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  dangerBtn: {
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    backgroundColor: spec.RED,
  },
  dangerBtnText: {
    fontWeight: "700",
    color: "#000",
  },
});

