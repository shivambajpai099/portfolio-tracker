import { useEffect, useRef, useState } from "react";
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
  type LayoutRectangle,
} from "react-native";
import { colors, radii, spacing, typography } from "../theme";

/**
 * Preview images for tour steps.
 * Add new images here as: "filename.jpg": require("../../assets/filename.jpg")
 * 
 * Note: The image file must exist in /assets/ folder before uncommenting.
 * Placeholder shown if image is not found.
 */
const PREVIEW_IMAGES: Record<string, any> = {
  // Uncomment when the screenshot is added:
  // "onboarding-overview-preview.jpg": require("../../assets/onboarding-overview-preview.jpg"),
};

export interface TourStep {
  /** Unique key for this step */
  key: string;
  /** Title shown in the tooltip */
  title: string;
  /** Description shown in the tooltip */
  description: string;
  /** Which tab to highlight (for navigation context) */
  targetTab?: "index" | "settings" | "insights";
  /** Position of tooltip relative to spotlight */
  tooltipPosition?: "top" | "bottom" | "left" | "right";
  /** Optional preview image filename (should be in assets folder) */
  previewImage?: string;
}

interface SpotlightTourProps {
  visible: boolean;
  steps: TourStep[];
  currentStep: number;
  /** Layout rect of the currently highlighted element */
  targetRect: LayoutRectangle | null;
  onNext: () => void;
  onSkip: () => void;
  onComplete: () => void;
}

const SCREEN_WIDTH = Dimensions.get("window").width;
const SCREEN_HEIGHT = Dimensions.get("window").height;
const TOOLTIP_MAX_WIDTH = 320;
const SPOTLIGHT_PADDING = 8;

export function SpotlightTour({
  visible,
  steps,
  currentStep,
  targetRect,
  onNext,
  onSkip,
  onComplete,
}: SpotlightTourProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [tooltipLayout, setTooltipLayout] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const progress = `${currentStep + 1}/${steps.length}`;

  useEffect(() => {
    if (visible) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 250,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [visible, fadeAnim]);

  // Calculate tooltip position based on target rect and preferred position
  useEffect(() => {
    if (!targetRect) {
      // Center the tooltip if no target
      setTooltipLayout({
        x: (SCREEN_WIDTH - TOOLTIP_MAX_WIDTH) / 2,
        y: SCREEN_HEIGHT / 2 - 80,
      });
      return;
    }

    const tooltipHeight = 140; // Approximate height
    const tooltipWidth = Math.min(TOOLTIP_MAX_WIDTH, SCREEN_WIDTH - spacing.xl * 2);
    const position = step?.tooltipPosition ?? "bottom";

    let x = targetRect.x + targetRect.width / 2 - tooltipWidth / 2;
    let y = targetRect.y + targetRect.height + SPOTLIGHT_PADDING + 12;

    // Adjust based on position preference
    if (position === "top") {
      y = targetRect.y - tooltipHeight - SPOTLIGHT_PADDING - 12;
    } else if (position === "left") {
      x = targetRect.x - tooltipWidth - SPOTLIGHT_PADDING - 12;
      y = targetRect.y + targetRect.height / 2 - tooltipHeight / 2;
    } else if (position === "right") {
      x = targetRect.x + targetRect.width + SPOTLIGHT_PADDING + 12;
      y = targetRect.y + targetRect.height / 2 - tooltipHeight / 2;
    }

    // Clamp to screen bounds
    x = Math.max(spacing.md, Math.min(x, SCREEN_WIDTH - tooltipWidth - spacing.md));
    y = Math.max(spacing.xxl, Math.min(y, SCREEN_HEIGHT - tooltipHeight - spacing.xxl));

    setTooltipLayout({ x, y });
  }, [targetRect, step?.tooltipPosition]);

  if (!visible || !step) {
    return null;
  }

  const handleNext = () => {
    if (isLastStep) {
      onComplete();
    } else {
      onNext();
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        {/* Dark overlay with cutout for spotlight */}
        <View style={styles.overlayBackground}>
          {/* Top section */}
          <View
            style={[
              styles.overlaySection,
              {
                height: targetRect ? targetRect.y - SPOTLIGHT_PADDING : SCREEN_HEIGHT / 2,
              },
            ]}
          />

          {/* Middle section with spotlight hole */}
          <View style={styles.middleRow}>
            {/* Left side */}
            <View
              style={[
                styles.overlaySection,
                {
                  width: targetRect ? targetRect.x - SPOTLIGHT_PADDING : 0,
                  height: targetRect ? targetRect.height + SPOTLIGHT_PADDING * 2 : 0,
                },
              ]}
            />

            {/* Spotlight cutout (transparent) */}
            {targetRect ? (
              <View
                style={[
                  styles.spotlight,
                  {
                    width: targetRect.width + SPOTLIGHT_PADDING * 2,
                    height: targetRect.height + SPOTLIGHT_PADDING * 2,
                  },
                ]}
              />
            ) : null}

            {/* Right side */}
            <View
              style={[
                styles.overlaySection,
                {
                  flex: 1,
                  height: targetRect ? targetRect.height + SPOTLIGHT_PADDING * 2 : 0,
                },
              ]}
            />
          </View>

          {/* Bottom section */}
          <View style={[styles.overlaySection, { flex: 1 }]} />
        </View>

        {/* Tooltip card */}
        <View
          style={[
            styles.tooltipCard,
            {
              left: tooltipLayout.x,
              top: tooltipLayout.y,
              maxWidth: TOOLTIP_MAX_WIDTH,
            },
          ]}
        >
          <View style={styles.tooltipHeader}>
            <Text style={styles.stepCounter}>{progress}</Text>
          </View>

          <Text style={styles.tooltipTitle}>{step.title}</Text>
          <Text style={styles.tooltipDescription}>{step.description}</Text>

          {/* Preview image if available */}
          {step.previewImage ? (
            PREVIEW_IMAGES[step.previewImage] ? (
              <View style={styles.previewImageContainer}>
                <Image
                  source={PREVIEW_IMAGES[step.previewImage]}
                  style={styles.previewImage}
                  resizeMode="cover"
                />
              </View>
            ) : (
              <View style={styles.previewPlaceholder}>
                <Text style={styles.previewPlaceholderIcon}>📊</Text>
                <Text style={styles.previewPlaceholderText}>Preview coming soon</Text>
              </View>
            )
          ) : null}

          <View style={styles.tooltipActions}>
            <Pressable style={styles.skipBtn} onPress={onSkip}>
              <Text style={styles.skipBtnText}>Skip tour</Text>
            </Pressable>

            <Pressable style={styles.nextBtn} onPress={handleNext}>
              <Text style={styles.nextBtnText}>{isLastStep ? "Done" : "Next"}</Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    position: "relative",
  },
  overlayBackground: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "column",
  },
  overlaySection: {
    backgroundColor: "rgba(0, 0, 0, 0.75)",
  },
  middleRow: {
    flexDirection: "row",
  },
  spotlight: {
    backgroundColor: "transparent",
    borderRadius: radii.lg,
    // Add a subtle border to highlight
    borderWidth: 2,
    borderColor: colors.accent,
  },
  tooltipCard: {
    position: "absolute",
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
      web: {
        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
      },
    }),
  },
  tooltipHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: spacing.sm,
  },
  stepCounter: {
    color: colors.muted,
    fontSize: typography.micro,
    fontWeight: typography.weightMedium,
  },
  tooltipTitle: {
    color: colors.text,
    fontSize: typography.body,
    fontWeight: typography.weightSemibold,
    marginBottom: spacing.xs,
  },
  tooltipDescription: {
    color: colors.muted,
    fontSize: typography.caption,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  previewImageContainer: {
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  previewImage: {
    width: "100%",
    height: 140,
  },
  previewPlaceholder: {
    marginBottom: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    backgroundColor: colors.bg,
    height: 100,
    alignItems: "center",
    justifyContent: "center",
  },
  previewPlaceholderIcon: {
    fontSize: 24,
    marginBottom: spacing.xs,
  },
  previewPlaceholderText: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  tooltipActions: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  skipBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  skipBtnText: {
    color: colors.muted,
    fontSize: typography.caption,
  },
  nextBtn: {
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  nextBtnText: {
    color: colors.bg,
    fontSize: typography.caption,
    fontWeight: typography.weightSemibold,
  },
});

