import { Pressable, StyleSheet, Text, View } from "react-native";
import { spacing } from "../theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Optional: allow wrapping for many options */
  wrap?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Compact segmented control component.
 * 
 * Used for mutually-exclusive choices throughout the app (e.g., Current/Invested,
 * Mon/Qtr/Year, INR/USD, etc.). Provides a bordered container with vertical dividers.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  wrap = false,
}: SegmentedControlProps<T>) {
  return (
    <View
      style={[
        styles.container,
        wrap && styles.containerWrap,
      ]}
    >
      {options.map((option, index) => {
        const isActive = value === option.value;
        const isLast = index === options.length - 1;
        return (
          <View key={option.value} style={styles.optionWrapper}>
            <Pressable
              onPress={() => onChange(option.value)}
              style={[
                styles.option,
                isActive && styles.optionActive,
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: isActive ? "#5FD4EB" : "#8A94A3" },
                  isActive && styles.optionTextActive,
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
            {!isLast && !wrap && (
              <View style={styles.divider} />
            )}
          </View>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#262B33",
    overflow: "hidden",
  },
  containerWrap: {
    flexWrap: "wrap",
  },
  optionWrapper: {
    flexDirection: "row",
    alignItems: "stretch",
    flex: 1,
  },
  option: {
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm - 2,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  optionActive: {
    backgroundColor: "#16323A",
  },
  optionText: {
    fontSize: 12,
    fontWeight: "500",
  },
  optionTextActive: {
    fontWeight: "600",
  },
  divider: {
    width: 1,
    alignSelf: "stretch",
    backgroundColor: "#262B33",
  },
});

