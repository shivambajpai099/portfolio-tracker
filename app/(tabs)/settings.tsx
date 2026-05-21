import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors, radii, spacing, typography } from "../../src/theme";
import type { AllocationBasis, Currency } from "../../src/types/portfolio";

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

  const [rateInput, setRateInput] = useState(String(fxRates.USDINR));
  const [rateError, setRateError] = useState("");
  const [showClearConfirm, setShowClearConfirm] = useState(false);
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
    updateFxRates({ USDINR: parsed });
    flash("Exchange rate saved.");
  };

  // ── Reporting currency ───────────────────────────────────────────────────
  const setReportingCurrency = (currency: Currency) => {
    updateSettings({ reportingCurrency: currency });
    flash(`Reporting currency set to ${currency}.`);
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
        // Browser: trigger file download via anchor element
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
        // On web the URI is a blob: URL — read it with FileReader
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

      // Re-hydrate from file
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

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Settings</Text>

        {statusMsg ? (
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>{statusMsg}</Text>
          </View>
        ) : null}

        {/* ── Exchange rate ────────────────────────────────────────── */}
        <SectionLabel>Exchange Rate</SectionLabel>
        <View style={styles.sectionWrap}>
          <Text style={styles.rateHint}>1 USD equals</Text>
          <View style={styles.rateRow}>
            <TextInput
              value={rateInput}
              onChangeText={(v) => {
                setRateInput(v);
                setRateError("");
              }}
              onSubmitEditing={commitRate}
              keyboardType="decimal-pad"
              returnKeyType="done"
              style={styles.rateInput}
              placeholderTextColor={colors.muted}
            />
            <Text style={styles.inrText}>INR</Text>
            <Pressable style={styles.saveBtn} onPress={commitRate}>
              <Text style={styles.saveBtnText}>Save</Text>
            </Pressable>
          </View>
          {rateError ? <Text style={styles.errorText}>{rateError}</Text> : null}
        </View>

        {/* ── Reporting currency ───────────────────────────────────── */}
        <SectionLabel>Reporting Currency</SectionLabel>
        <View style={styles.currencyRow}>
          {(["INR", "USD"] as Currency[]).map((c) => {
            const active = settings.reportingCurrency === c;
            return (
              <Pressable key={c} onPress={() => setReportingCurrency(c)} style={[styles.currencyPill, active && styles.currencyPillActive]}>
                <Text style={[styles.currencyPillText, active && styles.currencyPillTextActive]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Allocation settings ──────────────────────────────────── */}
        <SectionLabel>Allocation Basis</SectionLabel>
        <View style={styles.currencyRow}>
          {(["CURRENT_VALUE", "INVESTED_VALUE"] as AllocationBasis[]).map((basis) => {
            const active = settings.allocationBasis === basis;
            const label = basis === "CURRENT_VALUE" ? "Current Value" : "Invested Value";
            return (
              <Pressable
                key={basis}
                onPress={() => updateSettings({ allocationBasis: basis })}
                style={[styles.currencyPill, active && styles.currencyPillActive]}
              >
                <Text style={[styles.currencyPillText, active && styles.currencyPillTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel>Cash in Allocation</SectionLabel>
        <View style={styles.currencyRow}>
          {([true, false] as const).map((include) => {
            const active = settings.allocationIncludeCash === include;
            const label = include ? "Include Cash" : "Exclude Cash";
            return (
              <Pressable
                key={String(include)}
                onPress={() => updateSettings({ allocationIncludeCash: include })}
                style={[styles.currencyPill, active && styles.currencyPillActive]}
              >
                <Text style={[styles.currencyPillText, active && styles.currencyPillTextActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Data ─────────────────────────────────────────────────── */}
        <SectionLabel>Data</SectionLabel>
        <View style={styles.cardList}>
          <Pressable onPress={handleExport} style={styles.actionCard}>
            <View>
              <Text style={styles.actionTitle}>Export Portfolio</Text>
              <Text style={styles.actionSubtitle}>Save a JSON backup of all your data</Text>
            </View>
            <Text style={styles.actionArrow}>↑</Text>
          </Pressable>

          <Pressable onPress={handleImport} style={styles.actionCard}>
            <View>
              <Text style={styles.actionTitle}>Import Portfolio</Text>
              <Text style={styles.actionSubtitle}>Restore from a JSON backup file</Text>
            </View>
            <Text style={styles.actionArrow}>↓</Text>
          </Pressable>
        </View>

        {/* ── Danger zone ──────────────────────────────────────────── */}
        <SectionLabel style={styles.dangerLabel}>Danger Zone</SectionLabel>
        <Pressable onPress={() => setShowClearConfirm(true)} style={styles.actionCard}>
          <View>
            <Text style={styles.dangerTitle}>Clear All Data</Text>
            <Text style={styles.actionSubtitle}>Permanently removes all accounts, holdings and balances</Text>
          </View>
          <Text style={styles.dangerTitle}>×</Text>
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
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.dangerBtn} onPress={confirmClear}>
                <Text style={styles.dangerBtnText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function SectionLabel({ children, style }: { children: string; style?: object }) {
  return <Text style={[styles.sectionLabel, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  title: {
    marginBottom: spacing.xxl,
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  statusCard: {
    marginBottom: spacing.xl,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statusText: {
    color: colors.accent,
    fontSize: typography.body,
  },
  sectionLabel: {
    marginBottom: spacing.md,
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  sectionWrap: {
    marginBottom: spacing.xxl,
  },
  rateHint: {
    marginBottom: spacing.sm,
    color: colors.muted,
    fontSize: typography.caption,
  },
  rateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  rateInput: {
    flex: 1,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.body,
  },
  inrText: {
    color: colors.muted,
    fontSize: typography.body,
  },
  saveBtn: {
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  saveBtnText: {
    color: colors.bg,
    fontWeight: typography.weightSemibold,
  },
  errorText: {
    marginTop: spacing.xs,
    color: colors.negative,
    fontSize: typography.caption,
  },
  currencyRow: {
    marginBottom: spacing.xxl,
    flexDirection: "row",
    gap: spacing.sm,
  },
  currencyPill: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  currencyPillActive: {
    backgroundColor: colors.accent,
  },
  currencyPillText: {
    color: colors.muted,
    fontWeight: typography.weightSemibold,
  },
  currencyPillTextActive: {
    color: colors.bg,
  },
  cardList: {
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  actionCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  actionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  actionSubtitle: {
    marginTop: 2,
    color: colors.muted,
    fontSize: typography.caption,
  },
  actionArrow: {
    color: colors.muted,
  },
  dangerLabel: {
    marginTop: spacing.xxl,
  },
  dangerTitle: {
    color: colors.negative,
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  modalOverlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: spacing.xl,
  },
  modalCard: {
    width: "100%",
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  modalTitle: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  modalText: {
    marginTop: spacing.sm,
    color: colors.muted,
    fontSize: typography.body,
  },
  modalActions: {
    marginTop: spacing.xxl,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
  ghostBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  ghostText: {
    color: colors.muted,
  },
  dangerBtn: {
    borderRadius: radii.lg,
    backgroundColor: colors.negative,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dangerBtnText: {
    color: colors.text,
    fontWeight: typography.weightSemibold,
  },
});

