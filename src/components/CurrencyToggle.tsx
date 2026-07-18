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
      {OPTIONS.map((option, index) => {
        const selected = reportingCurrency === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => updateSettings({ reportingCurrency: option.value })}
            style={[
              styles.option,
              index > 0 && styles.optionDivider,
              selected && styles.optionSelected,
            ]}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={`Show values in ${option.value}`}
          >
            <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const BORDER = "#1E232B";

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 7,
    overflow: "hidden",
  },
  option: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  optionDivider: {
    borderLeftWidth: 1,
    borderLeftColor: BORDER,
  },
  optionSelected: {
    backgroundColor: "#16323A",
  },
  optionText: {
    fontSize: 12,
    color: "#8A94A3",
  },
  optionTextSelected: {
    color: "#5FD4EB",
    fontWeight: "600",
  },
});

