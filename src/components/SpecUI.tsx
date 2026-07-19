import type { PropsWithChildren } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { spec } from "../theme/specTokens";

// ---------------------------------------------------------------------------
// Card — rounded surface with spec background + border
// ---------------------------------------------------------------------------
export function Card({ children, style }: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  return <View style={[styles.card, style]}>{children}</View>;
}

// ---------------------------------------------------------------------------
// SectionLabel — uppercase, tracked, muted heading
// ---------------------------------------------------------------------------
export function SectionLabel({ children, style }: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return (
    <Text style={[styles.sectionLabel, style]} numberOfLines={1}>
      {children as string}
    </Text>
  );
}

// ---------------------------------------------------------------------------
// SegToggle — segmented button group in the spec style
// ---------------------------------------------------------------------------
export interface SegToggleOption<T extends string> {
  value: T;
  label: string;
}

export function SegToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: SegToggleOption<T>[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.seg}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={[styles.segBtn, { backgroundColor: active ? spec.TEAL : "transparent" }]}
          >
            <Text style={[styles.segText, { color: active ? "#000" : spec.SUB }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Chevron — rotates when open
// ---------------------------------------------------------------------------
export function Chevron({ open }: { open: boolean }) {
  return (
    <Text style={[styles.chevron, { transform: [{ rotate: open ? "180deg" : "0deg" }] }]}>⌄</Text>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: spec.CARD,
    borderWidth: 1,
    borderColor: spec.BDR,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    color: spec.MUTED,
    marginBottom: 12,
  },
  seg: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: spec.CARD2,
    borderWidth: 1,
    borderColor: spec.BDR,
  },
  segBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  segText: {
    fontSize: 13,
    fontWeight: "600",
  },
  chevron: {
    fontSize: 18,
    lineHeight: 18,
    color: spec.TEAL,
    fontWeight: "700",
  },
});

