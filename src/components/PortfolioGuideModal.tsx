import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, radii, spacing, typography } from "../theme";

interface PortfolioGuideModalProps {
  visible: boolean;
  onClose: () => void;
}

type GuideSection = {
  title: string;
  lines: string[];
};

const GUIDE_SECTIONS: GuideSection[] = [
  {
    title: "How to read this app",
    lines: [
      "- Total value: what your holdings are worth now.",
      "- Invested: how much money you put in.",
      "- Gain/Loss: Total value minus Invested.",
      "- Allocation %: each position's share of your portfolio.",
    ],
  },
  {
    title: "Allocation filters",
    lines: [
      "- Current % uses live/current value to compute weights.",
      "- Invested % uses your cost basis to compute weights.",
      "- Include Cash counts cash balances in the denominator.",
      "- Exclude Cash compares only stock positions.",
    ],
  },
  {
    title: "How to enter a holding",
    lines: [
      "- Search and pick the ticker first (example: AAPL, RELIANCE.NS).",
      "- Quantity is units you own now (decimals are allowed).",
      "- Average buy price is weighted cost per unit.",
      "- Market price auto-fills from live quotes when available.",
    ],
  },
  {
    title: "Quick example",
    lines: [
      "- Bought 10 shares at 150 and 10 shares at 170?",
      "- Quantity = 20",
      "- Average buy price = 160",
      "- If current price is 180, app calculates gain automatically.",
    ],
  },
];

export function PortfolioGuideModal({ visible, onClose }: PortfolioGuideModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Portfolio Guide</Text>
            <Pressable style={styles.closeBtn} onPress={onClose}>
              <Text style={styles.closeBtnText}>Close</Text>
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.contentWrap}>
            {GUIDE_SECTIONS.map((section) => (
              <View key={section.title} style={styles.section}>
                <Text style={styles.sectionTitle}>{section.title}</Text>
                {section.lines.map((line) => (
                  <Text key={line} style={styles.sectionLine}>
                    {line}
                  </Text>
                ))}
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: spacing.xl,
  },
  card: {
    maxHeight: "85%",
    borderRadius: radii.xl,
    backgroundColor: colors.surface,
    padding: spacing.xl,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  closeBtn: {
    borderRadius: radii.md,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  closeBtnText: {
    color: colors.muted,
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
  },
  contentWrap: {
    paddingBottom: spacing.sm,
    gap: spacing.lg,
  },
  section: {
    gap: spacing.xs,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  sectionLine: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 18,
  },
});

