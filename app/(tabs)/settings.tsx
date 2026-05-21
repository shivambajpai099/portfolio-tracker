import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import type { Currency } from "../../src/types/portfolio";

interface PortfolioExport {
  exportedAt: string;
  accounts: unknown;
  holdings: unknown;
  cashHoldings: unknown;
  settings: unknown;
  fxRates: unknown;
}

export default function SettingsScreen() {
  const fxRates      = usePortfolioStore((s) => s.fxRates);
  const settings     = usePortfolioStore((s) => s.settings);
  const accounts     = usePortfolioStore((s) => s.accounts);
  const holdings     = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const updateFxRates   = usePortfolioStore((s) => s.updateFxRates);
  const updateSettings  = usePortfolioStore((s) => s.updateSettings);
  const addAccount      = usePortfolioStore((s) => s.addAccount);
  const addHolding      = usePortfolioStore((s) => s.addHolding);
  const addCashHolding  = usePortfolioStore((s) => s.addCashHolding);
  const clearAllData    = usePortfolioStore((s) => s.clearAllData);

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
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text className="mb-6 text-3xl font-semibold text-text">Settings</Text>

        {statusMsg ? (
          <View className="mb-5 rounded-xl bg-surface px-4 py-3">
            <Text className="text-sm text-accent">{statusMsg}</Text>
          </View>
        ) : null}

        {/* ── Exchange rate ────────────────────────────────────────── */}
        <SectionLabel>Exchange Rate</SectionLabel>
        <View className="mb-6">
          <Text className="mb-2 text-xs text-muted">1 USD equals</Text>
          <View className="flex-row items-center gap-3">
            <TextInput
              value={rateInput}
              onChangeText={(v) => { setRateInput(v); setRateError(""); }}
              onSubmitEditing={commitRate}
              keyboardType="decimal-pad"
              returnKeyType="done"
              className="flex-1 rounded-xl bg-surface px-4 py-3 text-base text-text"
              placeholderTextColor="#8B909A"
            />
            <Text className="text-sm text-muted">INR</Text>
            <Pressable className="rounded-xl bg-accent px-4 py-3" onPress={commitRate}>
              <Text className="font-semibold text-bg">Save</Text>
            </Pressable>
          </View>
          {rateError ? <Text className="mt-1.5 text-xs text-negative">{rateError}</Text> : null}
        </View>

        {/* ── Reporting currency ───────────────────────────────────── */}
        <SectionLabel>Reporting Currency</SectionLabel>
        <View className="mb-6 flex-row gap-2">
          {(["INR", "USD"] as Currency[]).map((c) => (
            <Pressable
              key={c}
              onPress={() => setReportingCurrency(c)}
              className={`rounded-xl px-5 py-3 ${settings.reportingCurrency === c ? "bg-accent" : "bg-surface"}`}
            >
              <Text className={`font-semibold ${settings.reportingCurrency === c ? "text-bg" : "text-muted"}`}>{c}</Text>
            </Pressable>
          ))}
        </View>

        {/* ── Data ─────────────────────────────────────────────────── */}
        <SectionLabel>Data</SectionLabel>
        <View className="mb-2 gap-2">
          <Pressable
            onPress={handleExport}
            className="flex-row items-center justify-between rounded-xl bg-surface px-4 py-4"
          >
            <View>
              <Text className="text-sm font-medium text-text">Export Portfolio</Text>
              <Text className="mt-0.5 text-xs text-muted">Save a JSON backup of all your data</Text>
            </View>
            <Text className="text-muted">↑</Text>
          </Pressable>

          <Pressable
            onPress={handleImport}
            className="flex-row items-center justify-between rounded-xl bg-surface px-4 py-4"
          >
            <View>
              <Text className="text-sm font-medium text-text">Import Portfolio</Text>
              <Text className="mt-0.5 text-xs text-muted">Restore from a JSON backup file</Text>
            </View>
            <Text className="text-muted">↓</Text>
          </Pressable>
        </View>

        {/* ── Danger zone ──────────────────────────────────────────── */}
        <SectionLabel className="mt-6">Danger Zone</SectionLabel>
        <Pressable
          onPress={() => setShowClearConfirm(true)}
          className="flex-row items-center justify-between rounded-xl bg-surface px-4 py-4"
        >
          <View>
            <Text className="text-sm font-medium text-negative">Clear All Data</Text>
            <Text className="mt-0.5 text-xs text-muted">Permanently removes all accounts, holdings and balances</Text>
          </View>
          <Text className="text-negative">✕</Text>
        </Pressable>
      </ScrollView>

      {/* ── Clear confirmation modal ─────────────────────────────── */}
      <Modal visible={showClearConfirm} transparent animationType="fade" onRequestClose={() => setShowClearConfirm(false)}>
        <View className="flex-1 items-center justify-center bg-black/70 px-5">
          <View className="w-full rounded-2xl bg-surface p-5">
            <Text className="text-xl font-semibold text-text">Clear all data?</Text>
            <Text className="mt-2 text-sm text-muted">
              This will permanently delete all accounts, holdings, and cash balances. This cannot be undone.
            </Text>
            <View className="mt-6 flex-row justify-end gap-2">
              <Pressable
                className="rounded-xl border border-[#252932] px-4 py-2.5"
                onPress={() => setShowClearConfirm(false)}
              >
                <Text className="text-muted">Cancel</Text>
              </Pressable>
              <Pressable className="rounded-xl bg-negative px-4 py-2.5" onPress={confirmClear}>
                <Text className="font-semibold text-text">Clear</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenContainer>
  );
}

function SectionLabel({ children, className }: { children: string; className?: string }) {
  return (
    <Text className={`mb-3 text-xs font-medium uppercase tracking-widest text-muted ${className ?? ""}`}>
      {children}
    </Text>
  );
}
