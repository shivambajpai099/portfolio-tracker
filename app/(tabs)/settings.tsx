import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { PortfolioGuideModal } from "../../src/components/PortfolioGuideModal";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { useAuthStore } from "../../src/store/authStore";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { radii, spacing, typography, useTheme, type ThemeColors } from "../../src/theme";
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
  const { colors } = useTheme();
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
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

  const closeGuide = () => {
    setShowGuide(false);
    if (!settings.onboardingTipsSeen) {
      updateSettings({ onboardingTipsSeen: true });
    }
  };

  const showGuideNextLaunch = () => {
    updateSettings({ onboardingTipsSeen: false });
    flash("Guide will auto-open next time you open the app.");
  };

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>

        {statusMsg ? (
          <View style={[styles.statusCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.statusText, { color: colors.accent }]}>{statusMsg}</Text>
          </View>
        ) : null}

        {/* ── Exchange rate ────────────────────────────────────────── */}
        <SectionLabel colors={colors}>Exchange Rate</SectionLabel>
        <View style={styles.sectionWrap}>
          <Text style={[styles.rateHint, { color: colors.muted }]}>1 USD equals</Text>
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
              style={[styles.rateInput, { backgroundColor: colors.surface, color: colors.text }]}
              placeholderTextColor={colors.muted}
            />
            <Text style={[styles.inrText, { color: colors.muted }]}>INR</Text>
            <Pressable style={[styles.saveBtn, { backgroundColor: colors.accent }]} onPress={commitRate}>
              <Text style={[styles.saveBtnText, { color: colors.bg }]}>Save</Text>
            </Pressable>
          </View>
          {rateError ? <Text style={[styles.errorText, { color: colors.negative }]}>{rateError}</Text> : null}
        </View>

        {/* ── Reporting currency ───────────────────────────────────── */}
        <SectionLabel colors={colors}>Reporting Currency</SectionLabel>
        <View style={styles.currencyRow}>
          {(["INR", "USD"] as Currency[]).map((c) => {
            const active = settings.reportingCurrency === c;
            return (
              <Pressable key={c} onPress={() => setReportingCurrency(c)} style={[styles.currencyPill, { backgroundColor: active ? colors.accent : colors.surface }]}>
                <Text style={[styles.currencyPillText, { color: active ? colors.bg : colors.muted }]}>{c}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Allocation settings ──────────────────────────────────── */}
        <SectionLabel colors={colors}>Allocation Basis</SectionLabel>
        <View style={styles.currencyRow}>
          {(["CURRENT_VALUE", "INVESTED_VALUE"] as AllocationBasis[]).map((basis) => {
            const active = settings.allocationBasis === basis;
            const label = basis === "CURRENT_VALUE" ? "Current Value" : "Invested Value";
            return (
              <Pressable
                key={basis}
                onPress={() => updateSettings({ allocationBasis: basis })}
                style={[styles.currencyPill, { backgroundColor: active ? colors.accent : colors.surface }]}
              >
                <Text style={[styles.currencyPillText, { color: active ? colors.bg : colors.muted }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel colors={colors}>Cash in Allocation</SectionLabel>
        <View style={styles.currencyRow}>
          {([true, false] as const).map((include) => {
            const active = settings.allocationIncludeCash === include;
            const label = include ? "Include Cash" : "Exclude Cash";
            return (
              <Pressable
                key={String(include)}
                onPress={() => updateSettings({ allocationIncludeCash: include })}
                style={[styles.currencyPill, { backgroundColor: active ? colors.accent : colors.surface }]}
              >
                <Text style={[styles.currencyPillText, { color: active ? colors.bg : colors.muted }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        <SectionLabel colors={colors}>History Retention</SectionLabel>
        <View style={styles.currencyRowWrap}>
          {([
            ["6M", "6 Months"],
            ["1Y", "1 Year"],
            ["2Y", "2 Years"],
            ["ALL", "All"],
          ] as const).map(([value, label]) => {
            const active = (settings.timelineRetention ?? "1Y") === value;
            return (
              <Pressable
                key={value}
                onPress={() => updateSettings({ timelineRetention: value as TimelineRetention })}
                style={[styles.currencyPill, { backgroundColor: active ? colors.accent : colors.surface }]}
              >
                <Text style={[styles.currencyPillText, { color: active ? colors.bg : colors.muted }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Theme ────────────────────────────────────────────────── */}
        <SectionLabel colors={colors}>Theme</SectionLabel>
        <View style={styles.currencyRowWrap}>
          {([
            ["light", "Light"],
            ["dark", "Dark"],
            ["system", "System"],
          ] as const).map(([value, label]) => {
            const active = (settings.themeMode ?? "dark") === value;
            return (
              <Pressable
                key={value}
                onPress={() => updateSettings({ themeMode: value as ThemeMode })}
                style={[styles.currencyPill, { backgroundColor: active ? colors.accent : colors.surface }]}
              >
                <Text style={[styles.currencyPillText, { color: active ? colors.bg : colors.muted }]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Help ─────────────────────────────────────────────────── */}
        <SectionLabel colors={colors}>Help</SectionLabel>
        <View style={styles.cardList}>
          <Pressable onPress={() => setShowGuide(true)} style={[styles.actionCard, { backgroundColor: colors.surface }]}>
            <View>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Portfolio Guide</Text>
              <Text style={[styles.actionSubtitle, { color: colors.muted }]}>Understand metrics, filters, and how to input holdings</Text>
            </View>
            <Text style={{ color: colors.muted }}>?</Text>
          </Pressable>
          <Pressable onPress={showGuideNextLaunch} style={[styles.actionCard, { backgroundColor: colors.surface }]}>
            <View>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Show Guide on Next Launch</Text>
              <Text style={[styles.actionSubtitle, { color: colors.muted }]}>Useful when sharing the app with someone new</Text>
            </View>
            <Text style={{ color: colors.muted }}>↻</Text>
          </Pressable>
        </View>

        {/* ── Data ─────────────────────────────────────────────────── */}
        <SectionLabel colors={colors}>Data</SectionLabel>
        <View style={styles.cardList}>
          <Pressable onPress={handleExport} style={[styles.actionCard, { backgroundColor: colors.surface }]}>
            <View>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Export Portfolio</Text>
              <Text style={[styles.actionSubtitle, { color: colors.muted }]}>Save a JSON backup of all your data</Text>
            </View>
            <Text style={{ color: colors.muted }}>↑</Text>
          </Pressable>

          <Pressable onPress={handleImport} style={[styles.actionCard, { backgroundColor: colors.surface }]}>
            <View>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Import Portfolio</Text>
              <Text style={[styles.actionSubtitle, { color: colors.muted }]}>Restore from a JSON backup file</Text>
            </View>
            <Text style={{ color: colors.muted }}>↓</Text>
          </Pressable>
        </View>

        {/* ── Auth ─────────────────────────────────────────────────── */}
        <SectionLabel colors={colors}>Auth</SectionLabel>
        <View style={styles.cardList}>
          <Pressable onPress={handleSignOut} style={[styles.actionCard, { backgroundColor: colors.surface }]}>
            <View>
              <Text style={[styles.actionTitle, { color: colors.text }]}>Sign Out</Text>
              <Text style={[styles.actionSubtitle, { color: colors.muted }]}>End current session on this device</Text>
            </View>
            <Text style={{ color: colors.muted }}>→</Text>
          </Pressable>
        </View>

        {/* ── Danger zone ──────────────────────────────────────────── */}
        <SectionLabel colors={colors} style={styles.dangerLabel}>Danger Zone</SectionLabel>
        <Pressable onPress={() => setShowClearConfirm(true)} style={[styles.actionCard, { backgroundColor: colors.surface }]}>
          <View>
            <Text style={[styles.actionTitle, { color: colors.negative }]}>Clear All Data</Text>
            <Text style={[styles.actionSubtitle, { color: colors.muted }]}>Permanently removes all accounts, holdings and balances</Text>
          </View>
          <Text style={{ color: colors.negative }}>×</Text>
        </Pressable>
      </ScrollView>

      {/* ── Clear confirmation modal ─────────────────────────────── */}
      <Modal visible={showClearConfirm} transparent animationType="fade" onRequestClose={() => setShowClearConfirm(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Clear all data?</Text>
            <Text style={[styles.modalText, { color: colors.muted }]}>
              This will permanently delete all accounts, holdings, and cash balances. This cannot be undone.
            </Text>
            <View style={styles.modalActions}>
              <Pressable style={styles.ghostBtn} onPress={() => setShowClearConfirm(false)}>
                <Text style={{ color: colors.muted }}>Cancel</Text>
              </Pressable>
              <Pressable style={[styles.dangerBtn, { backgroundColor: colors.negative }]} onPress={confirmClear}>
                <Text style={[styles.dangerBtnText, { color: colors.text }]}>Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <PortfolioGuideModal visible={showGuide} onClose={closeGuide} />
    </ScreenContainer>
  );
}

function SectionLabel({ children, style, colors }: { children: string; style?: object; colors?: ThemeColors }) {
  const theme = useTheme();
  const c = colors ?? theme.colors;
  return <Text style={[styles.sectionLabel, { color: c.muted }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 40,
  },
  title: {
    marginBottom: spacing.xxl,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  statusCard: {
    marginBottom: spacing.xl,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  statusText: {
    fontSize: typography.body,
  },
  sectionLabel: {
    marginBottom: spacing.md,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: typography.body,
  },
  inrText: {
    fontSize: typography.body,
  },
  saveBtn: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  saveBtnText: {
    fontWeight: typography.weightSemibold,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: typography.caption,
  },
  currencyRow: {
    marginBottom: spacing.xxl,
    flexDirection: "row",
    gap: spacing.sm,
  },
  currencyRowWrap: {
    marginBottom: spacing.xxl,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  currencyPill: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  currencyPillText: {
    fontWeight: typography.weightSemibold,
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
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
  },
  actionTitle: {
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
  actionSubtitle: {
    marginTop: 2,
    fontSize: typography.caption,
  },
  dangerLabel: {
    marginTop: spacing.xxl,
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
    padding: spacing.xl,
  },
  modalTitle: {
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  modalText: {
    marginTop: spacing.sm,
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
  dangerBtn: {
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  dangerBtnText: {
    fontWeight: typography.weightSemibold,
  },
});

