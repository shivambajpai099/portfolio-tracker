import { useEffect, useMemo, useRef, useState } from "react";
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SegmentedControl } from "./SegmentedControl";
import { radii, spacing, typography, useTheme } from "../theme";
import type { AccountType, Currency } from "../types/portfolio";

export interface AddAccountInput {
  name: string;
  owner: string;
  broker: string;
  type: AccountType;
  baseCurrency: Currency;
  /** Only meaningful for SAVINGS accounts */
  savingsInitialBalance?: number;
}

interface AddAccountModalProps {
  visible: boolean;
  onClose: () => void;
  onCreate: (input: AddAccountInput) => void;
}

type AccountDraft = {
  name: string;
  owner: string;
  broker: string;
  type: AccountType;
  baseCurrency: Currency;
};

const emptyDraft: AccountDraft = {
  name: "",
  owner: "",
  broker: "",
  type: "BROKER",
  baseCurrency: "INR",
};

/**
 * Known brokers rendered as a logo grid. Extend this array to add more brokers
 * without touching the component logic (id/label/color/initials/logo only).
 */
interface BrokerOption {
  id: string;
  label: string;
  color: string;
  initials: string;
  logo: string;
}

const BROKERS: BrokerOption[] = [
  { id: "groww", label: "Groww", color: "#00D09C", initials: "G", logo: "https://groww.in/favicon.ico" },
  { id: "indmoney", label: "INDMoney", color: "#F5A623", initials: "I", logo: "https://indmoney.com/favicon.ico" },
  { id: "zerodha", label: "Zerodha", color: "#387ED1", initials: "Z", logo: "https://zerodha.com/favicon.ico" },
];

/** Pick a readable text color (dark/light) for a given background hex. */
const getContrastText = (hex: string): string => {
  const c = hex.replace("#", "");
  const r = parseInt(c.slice(0, 2), 16);
  const g = parseInt(c.slice(2, 4), 16);
  const b = parseInt(c.slice(4, 6), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 140 ? "#0B0C10" : "#FFFFFF";
};

/**
 * A single broker logo tile. Tries the favicon/logo image first and falls back
 * to a colored initials avatar if the image fails to load.
 */
function BrokerLogoItem({
  broker,
  selected,
  onPress,
}: {
  broker: BrokerOption;
  selected: boolean;
  onPress: () => void;
}) {
  const [imgFailed, setImgFailed] = useState(false);

  return (
    <Pressable style={styles.brokerItem} onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}>
      <View style={[styles.brokerSquare, selected ? styles.brokerSquareSelected : styles.brokerSquareUnselected]}>
        {imgFailed ? (
          <View style={[styles.brokerFallback, { backgroundColor: broker.color }]}>
            <Text style={[styles.brokerInitials, { color: getContrastText(broker.color) }]}>{broker.initials}</Text>
          </View>
        ) : (
          <Image
            source={{ uri: broker.logo }}
            style={styles.brokerLogo}
            resizeMode="contain"
            onError={() => setImgFailed(true)}
          />
        )}
      </View>
      <Text style={[styles.brokerLabel, selected && styles.brokerLabelSelected]}>{broker.label}</Text>
    </Pressable>
  );
}

/**
 * Self-contained modal for creating a new account.
 *
 * Extracted so the add-account flow can be launched from the Portfolio page
 * (onboarding) as well as the Accounts section in Settings.
 */
export function AddAccountModal({ visible, onClose, onCreate }: AddAccountModalProps) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft);
  const [savingsInitialBalance, setSavingsInitialBalance] = useState("");
  const [isOtherBroker, setIsOtherBroker] = useState(false);
  const customBrokerRef = useRef<TextInput>(null);

  // Reset the form whenever the modal is opened.
  useEffect(() => {
    if (visible) {
      setDraft(emptyDraft);
      setSavingsInitialBalance("");
      setIsOtherBroker(false);
    }
  }, [visible]);

  const validation = useMemo(() => {
    const trimmedName = draft.name.trim();
    const isSavings = draft.type === "SAVINGS";
    // Only the account name is required; all other fields are optional.
    const canSave = Boolean(trimmedName);
    const helperMessage = canSave ? null : "Enter an account name to continue";

    return { canSave, helperMessage, isSavings };
  }, [draft]);

  const handleSave = () => {
    if (!validation.canSave) return;
    const parsedBalance = parseFloat(savingsInitialBalance);
    onCreate({
      name: draft.name.trim(),
      owner: draft.owner.trim(),
      broker: draft.broker.trim(),
      type: draft.type,
      baseCurrency: draft.baseCurrency,
      savingsInitialBalance:
        validation.isSavings && Number.isFinite(parsedBalance) && parsedBalance >= 0 ? parsedBalance : 0,
    });
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <View style={[styles.iconBadge, { backgroundColor: `${colors.accent}22` }]}>
                  <Text style={styles.iconEmoji}>🏦</Text>
                </View>
                <Text style={[styles.title, { color: colors.text }]}>Add Account</Text>
              </View>
              <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
                <Text style={[styles.closeBtnText, { color: colors.muted }]}>✕</Text>
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Account Name</Text>
            <TextInput
              value={draft.name}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, name: value }))}
              placeholder="e.g. US-Core, India-Growth"
              placeholderTextColor={colors.muted}
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
            />

            <Text style={[styles.fieldLabel, { color: colors.muted }]}>Owner</Text>
            <TextInput
              value={draft.owner}
              onChangeText={(value) => setDraft((prev) => ({ ...prev, owner: value }))}
              placeholder="e.g. John Doe"
              placeholderTextColor={colors.muted}
              style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
            />

            <View style={styles.twoColumnRow}>
              <View style={styles.columnHalf}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Type</Text>
                <SegmentedControl
                  options={[
                    { value: "BROKER", label: "Broker" },
                    { value: "SAVINGS", label: "Savings" },
                  ]}
                  value={draft.type}
                  onChange={(type) => setDraft((prev) => ({ ...prev, type: type as AccountType }))}
                />
              </View>
              <View style={styles.columnHalf}>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Currency</Text>
                <SegmentedControl
                  options={[
                    { value: "INR", label: "INR" },
                    { value: "USD", label: "USD" },
                  ]}
                  value={draft.baseCurrency}
                  onChange={(currency) => setDraft((prev) => ({ ...prev, baseCurrency: currency as Currency }))}
                />
              </View>
            </View>

            {draft.type === "BROKER" ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Broker</Text>
                <View style={styles.brokerGrid}>
                  {BROKERS.map((broker) => (
                    <BrokerLogoItem
                      key={broker.id}
                      broker={broker}
                      selected={!isOtherBroker && draft.broker === broker.label}
                      onPress={() => {
                        setIsOtherBroker(false);
                        setDraft((prev) => ({ ...prev, broker: broker.label }));
                      }}
                    />
                  ))}

                  {/* Other option */}
                  <Pressable
                    style={styles.brokerItem}
                    onPress={() => {
                      setIsOtherBroker(true);
                      setDraft((prev) => ({ ...prev, broker: "" }));
                      setTimeout(() => customBrokerRef.current?.focus(), 0);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isOtherBroker }}
                  >
                    <View
                      style={[
                        styles.brokerSquare,
                        styles.brokerSquareOther,
                        isOtherBroker && styles.brokerSquareSelected,
                      ]}
                    >
                      <Text style={styles.brokerOtherPlus}>+</Text>
                    </View>
                    <Text style={[styles.brokerLabel, isOtherBroker && styles.brokerLabelSelected]}>Other</Text>
                  </Pressable>
                </View>

                {isOtherBroker ? (
                  <TextInput
                    ref={customBrokerRef}
                    value={draft.broker}
                    onChangeText={(value) => setDraft((prev) => ({ ...prev, broker: value }))}
                    placeholder="Enter broker name"
                    placeholderTextColor={colors.muted}
                    style={[styles.input, styles.brokerCustomInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                  />
                ) : null}
              </>
            ) : null}

            {draft.type === "SAVINGS" ? (
              <>
                <Text style={[styles.fieldLabel, { color: colors.muted }]}>Initial Balance</Text>
                <TextInput
                  value={savingsInitialBalance}
                  onChangeText={setSavingsInitialBalance}
                  placeholder="0.00"
                  placeholderTextColor={colors.muted}
                  keyboardType="decimal-pad"
                  style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                />
              </>
            ) : null}

            <Pressable
              style={[
                styles.saveBtn,
                validation.canSave ? { backgroundColor: colors.accent } : styles.saveBtnDisabled,
              ]}
              onPress={handleSave}
              disabled={!validation.canSave}
            >
              <Text style={[styles.saveText, { color: validation.canSave ? colors.bg : "#5A6472" }]}>
                Save Account
              </Text>
            </Pressable>
            {validation.helperMessage ? (
              <Text style={[styles.helper, { color: colors.muted }]}>{validation.helperMessage}</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    maxHeight: "90%",
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconBadge: {
    width: 36,
    height: 36,
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  iconEmoji: {
    fontSize: 18,
  },
  title: {
    fontSize: typography.subheading,
    fontWeight: typography.weightSemibold,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: typography.body,
  },
  fieldLabel: {
    fontSize: typography.caption,
    fontWeight: typography.weightMedium,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  input: {
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: typography.body,
  },
  twoColumnRow: {
    flexDirection: "row",
    gap: 14,
  },
  columnHalf: {
    flex: 1,
  },
  brokerGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingVertical: 2,
  },
  brokerItem: {
    alignItems: "center",
    gap: 6,
  },
  brokerSquare: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  brokerSquareUnselected: {
    borderWidth: 1,
    borderColor: "#262B33",
    backgroundColor: "#1A1F26",
  },
  brokerSquareSelected: {
    borderWidth: 2,
    borderColor: "#5FD4EB",
    backgroundColor: "#16323A",
  },
  brokerSquareOther: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#262B33",
    backgroundColor: "#1A1F26",
  },
  brokerLogo: {
    width: 32,
    height: 32,
  },
  brokerFallback: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  brokerInitials: {
    fontSize: 18,
    fontWeight: "800",
  },
  brokerOtherPlus: {
    fontSize: 20,
    color: "#5A6472",
  },
  brokerLabel: {
    fontSize: 11,
    color: "#5A6472",
  },
  brokerLabelSelected: {
    color: "#5FD4EB",
    fontWeight: "600",
  },
  brokerCustomInput: {
    marginTop: spacing.sm,
  },
  saveBtn: {
    marginTop: spacing.xl,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    // Transparent base border keeps size identical to the disabled (bordered) state.
    borderWidth: 1,
    borderColor: "transparent",
  },
  saveBtnDisabled: {
    backgroundColor: "#1A1F26",
    borderColor: "#262B33",
  },
  saveText: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  helper: {
    marginTop: spacing.sm,
    fontSize: typography.caption,
    textAlign: "center",
  },
});

