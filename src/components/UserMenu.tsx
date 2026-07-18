import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuthStore } from "../store/authStore";
import { radii, spacing, typography, useTheme } from "../theme";

// Approximate card size used for viewport-overflow clamping before layout.
const CARD_WIDTH = 240;
const CARD_MAX_HEIGHT = 320;
const GAP = 8;
const EDGE = spacing.md;

/**
 * Top-right avatar button that opens a user dropdown with profile info,
 * quick navigation to Accounts / Settings, and Sign out.
 *
 * Shown across the Portfolio, Insights and Settings tabs so sign-out is
 * always reachable. Anchored to the avatar, closes on outside click and on
 * Escape (web).
 */
export function UserMenu() {
  const { colors } = useTheme();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const signOut = useAuthStore((s) => s.signOut);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number }>({ top: 88, right: EDGE });

  const avatarRef = useRef<View>(null);
  const anim = useRef(new Animated.Value(0)).current;

  // Animate the dropdown in/out whenever visibility changes.
  useEffect(() => {
    Animated.timing(anim, {
      toValue: open ? 1 : 0,
      duration: open ? 150 : 100,
      useNativeDriver: true,
    }).start();
  }, [open, anim]);

  // Close on Escape (web only — native has no keyboard here).
  useEffect(() => {
    if (Platform.OS !== "web" || !open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  if (!user) return null;

  const metadata = user.user_metadata ?? undefined;
  const displayName = metadata?.full_name || metadata?.name || user.email || "Account";
  const email = user.email ?? "";
  const photoUrl = metadata?.avatar_url || metadata?.picture || null;
  const initial = (displayName || "?").trim().charAt(0).toUpperCase();

  const close = () => setOpen(false);

  // Measure the avatar so the dropdown can be anchored to its bottom-right,
  // clamped to stay within the viewport.
  const openMenu = () => {
    const node = avatarRef.current;
    if (node && typeof node.measureInWindow === "function") {
      node.measureInWindow((x, y, width, height) => {
        const { width: winW, height: winH } = Dimensions.get("window");
        const right = Math.max(EDGE, winW - (x + width));
        const top = Math.min(y + height + GAP, winH - CARD_MAX_HEIGHT - EDGE);
        setAnchor({ top: Math.max(EDGE, top), right });
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  };

  const goManageAccounts = () => {
    close();
    router.push({ pathname: "/(tabs)/settings", params: { section: "accounts" } } as never);
  };

  const goSettings = () => {
    close();
    router.push("/(tabs)/settings" as never);
  };

  const handleSignOut = async () => {
    close();
    await signOut();
    router.replace("/(auth)/login" as never);
  };

  return (
    <>
      <Pressable
        ref={avatarRef}
        onPress={openMenu}
        accessibilityRole="button"
        accessibilityLabel="Open user menu"
        style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}
      >
        {photoUrl ? (
          <Image source={{ uri: photoUrl }} style={styles.avatarImage} />
        ) : (
          <Text style={[styles.avatarInitial, { color: colors.text }]}>{initial}</Text>
        )}
      </Pressable>

      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        <Pressable style={styles.overlay} onPress={close}>
          <Animated.View
            style={[
              styles.cardWrap,
              {
                top: anchor.top,
                right: anchor.right,
                opacity: anim,
                transform: [
                  { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
                  { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-4, 0] }) },
                ],
              },
            ]}
          >
            <Pressable
              style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={(e) => e.stopPropagation()}
              accessibilityRole="menu"
            >
              <View style={styles.headerBlock}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                  {displayName}
                </Text>
                {email ? (
                  <Text style={[styles.email, { color: colors.muted }]} numberOfLines={1}>
                    {email}
                  </Text>
                ) : null}
              </View>

              <MenuItem label="Manage accounts" color={colors.text} onPress={goManageAccounts} />
              <MenuItem label="Settings" color={colors.text} onPress={goSettings} />

              <View style={[styles.divider, { backgroundColor: colors.border }]} />

              <MenuItem label="Sign out" color={colors.negative} onPress={handleSignOut} />
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>
    </>
  );
}

function MenuItem({ label, color, onPress }: { label: string; color: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.item} accessibilityRole="menuitem">
      <Text style={[styles.itemText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarImage: {
    width: 32,
    height: 32,
  },
  avatarInitial: {
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
  overlay: {
    flex: 1,
  },
  cardWrap: {
    position: "absolute",
  },
  card: {
    width: CARD_WIDTH,
    maxWidth: 280,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: spacing.xs,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 8,
  },
  headerBlock: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  name: {
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
  },
  email: {
    marginTop: 2,
    fontSize: typography.caption,
  },
  divider: {
    height: 1,
    marginVertical: spacing.xs,
  },
  item: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  itemText: {
    fontSize: typography.body,
    fontWeight: typography.weightMedium,
  },
});


