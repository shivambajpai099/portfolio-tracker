import { Pressable, StyleSheet, Text, View } from "react-native";
import { usePortfolioStore } from "../store/portfolioStore";
import type { Currency } from "../types/portfolio";

const OPTIONS: { value: Currency; label: string }[] = [
  { value: "INR", label: "₹" },
  { value: "USD", label: "$" },
];

/**
 * Compact ₹/$ segmented control that toggles the app-wide reporting currency.
 * Reads/writes the same store setting as the Settings → Display Currency control,
 * so both surfaces stay in sync.
 */
export function CurrencyToggle() {
  const reportingCurrency = usePortfolioStore((s) => s.settings.reportingCurrency);
  const updateSettings = usePortfolioStore((s) => s.updateSettings);

  return (
    <View style={styles.container}>
      {OPTIONS.map((option) => {
        const selected = reportingCurrency === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => updateSettings({ reportingCurrency: option.value })}
            style={[styles.option, { backgroundColor: selected ? TEAL : CARD2 }]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Show values in ${option.value}`}
          >
            <Text style={[styles.optionText, { color: selected ? "#000" : SUB }]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const TEAL = "#00d4c8";
const CARD2 = "#1c1c26";
const BDR = "rgba(255,255,255,0.07)";
const SUB = "#80809a";

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: BDR,
    borderRadius: 8,
    overflow: "hidden",
  },
  option: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  optionText: {
    fontSize: 14,
    fontWeight: "700",
  },
});

