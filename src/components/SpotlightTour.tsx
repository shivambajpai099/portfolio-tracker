import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from "react-native";
import { colors, radii, spacing, typography } from "../theme";

/**
 * Preview images for tour steps.
 *
 * The onboarding "overview" step shows a 3-image carousel. Drop the images in
 * the app's /assets/ folder using these exact filenames, then uncomment the
 * matching require() lines below:
 *
 *   assets/onboarding-1.jpg   → Portfolio dashboard
 *   assets/onboarding-2.jpg   → Insights / allocation
 *   assets/onboarding-3.jpg   → Holdings & performance
 *
 * A styled placeholder is shown for any image that isn't registered yet, so
 * the carousel works before the screenshots are added.
 */
const PREVIEW_IMAGES: Record<string, any> = {
  "onboarding-1.jpg": require("../../assets/onboarding-1.jpg"),
  "onboarding-2.jpg": require("../../assets/onboarding-2.jpg"),
  "onboarding-3.jpg": require("../../assets/onboarding-3.jpg"),
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
  /** Optional set of preview image filenames rendered as a carousel */
  previewImages?: string[];
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
/** Wider card for steps that render the image carousel. */
const TOOLTIP_PREVIEW_MAX_WIDTH = 460;
const SPOTLIGHT_PADDING = 8;

/**
 * Whether a measured target rect is (fully) inside the visible viewport.
 * Targets that live below the fold measure to coordinates outside the screen,
 * which would otherwise draw the spotlight cutout in empty space. When a target
 * isn't usably on-screen we fall back to a centered, anchorless tooltip.
 */
const isRectOnScreen = (r: LayoutRectangle | null): boolean =>
  !!r &&
  r.width > 0 &&
  r.height > 0 &&
  r.y >= 0 &&
  r.x >= 0 &&
  r.y + r.height <= SCREEN_HEIGHT &&
  r.x + r.width <= SCREEN_WIDTH;

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
  const [tooltipHeight, setTooltipHeight] = useState(160);
  const [activeSlide, setActiveSlide] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);

  const step = steps[currentStep];
  const isLastStep = currentStep === steps.length - 1;
  const progress = `${currentStep + 1}/${steps.length}`;

  // Only anchor to the target when it's actually visible on screen; otherwise
  // render a centered, anchorless tooltip so we never spotlight empty space.
  const effectiveRect = isRectOnScreen(targetRect) ? targetRect : null;

  // Steps with a preview carousel use a larger card so the images render big.
  const hasPreview = Boolean(step?.previewImages?.length || step?.previewImage);
  const tooltipWidth = Math.min(
    hasPreview ? TOOLTIP_PREVIEW_MAX_WIDTH : TOOLTIP_MAX_WIDTH,
    SCREEN_WIDTH - spacing.xl * 2
  );

  // Reset the carousel to the first slide whenever the step changes.
  useEffect(() => {
    setActiveSlide(0);
  }, [currentStep]);

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

    if (!effectiveRect) {
      // No anchor for this step: center the card so it still explains clearly.
      setTooltipLayout({
        x: (SCREEN_WIDTH - tooltipWidth) / 2,
        y: Math.max(spacing.xxl, SCREEN_HEIGHT / 2 - tooltipHeight / 2),
      });
      return;
    }

    const gap = SPOTLIGHT_PADDING + 12;
    let position = step?.tooltipPosition ?? "bottom";

    // Flip vertically if the preferred side lacks room, so the card stays on
    // screen and next to the highlighted element instead of overlapping it.
    const spaceBelow = SCREEN_HEIGHT - (effectiveRect.y + effectiveRect.height);
    const spaceAbove = effectiveRect.y;
    if (position === "bottom" && spaceBelow < tooltipHeight + gap && spaceAbove > spaceBelow) {
      position = "top";
    } else if (position === "top" && spaceAbove < tooltipHeight + gap && spaceBelow > spaceAbove) {
      position = "bottom";
    }

    let x = effectiveRect.x + effectiveRect.width / 2 - tooltipWidth / 2;
    let y = effectiveRect.y + effectiveRect.height + gap;

    // Adjust based on position preference
    if (position === "top") {
      y = effectiveRect.y - tooltipHeight - gap;
    } else if (position === "left") {
      x = effectiveRect.x - tooltipWidth - gap;
      y = effectiveRect.y + effectiveRect.height / 2 - tooltipHeight / 2;
    } else if (position === "right") {
      x = effectiveRect.x + effectiveRect.width + gap;
      y = effectiveRect.y + effectiveRect.height / 2 - tooltipHeight / 2;
    }

    // Clamp to screen bounds
    x = Math.max(spacing.md, Math.min(x, SCREEN_WIDTH - tooltipWidth - spacing.md));
    y = Math.max(spacing.xxl, Math.min(y, SCREEN_HEIGHT - tooltipHeight - spacing.xxl));

    setTooltipLayout({ x, y });
  }, [effectiveRect, step?.tooltipPosition, tooltipHeight, tooltipWidth]);

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
                height: effectiveRect ? effectiveRect.y - SPOTLIGHT_PADDING : SCREEN_HEIGHT / 2,
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
                  width: effectiveRect ? effectiveRect.x - SPOTLIGHT_PADDING : 0,
                  height: effectiveRect ? effectiveRect.height + SPOTLIGHT_PADDING * 2 : 0,
                },
              ]}
            />

            {/* Spotlight cutout (transparent) */}
            {effectiveRect ? (
              <View
                style={[
                  styles.spotlight,
                  {
                    width: effectiveRect.width + SPOTLIGHT_PADDING * 2,
                    height: effectiveRect.height + SPOTLIGHT_PADDING * 2,
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
                  height: effectiveRect ? effectiveRect.height + SPOTLIGHT_PADDING * 2 : 0,
                },
              ]}
            />
          </View>

          {/* Bottom section */}
          <View style={[styles.overlaySection, { flex: 1 }]} />
        </View>

        {/* Tooltip card */}
        <View
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (h > 0 && Math.abs(h - tooltipHeight) > 1) setTooltipHeight(h);
          }}
          style={[
            styles.tooltipCard,
            {
              left: tooltipLayout.x,
              top: tooltipLayout.y,
              maxWidth: tooltipWidth,
              ...(hasPreview ? { width: tooltipWidth } : null),
            },
          ]}
        >
          <View style={styles.tooltipHeader}>
            <Text style={styles.stepCounter}>{progress}</Text>
          </View>

          <Text style={styles.tooltipTitle}>{step.title}</Text>
          <Text style={styles.tooltipDescription}>{step.description}</Text>

          {/* Preview carousel (supports multiple images) */}
          {(() => {
            const previewList =
              step.previewImages ?? (step.previewImage ? [step.previewImage] : []);
            if (previewList.length === 0) return null;

            const slideWidth = carouselWidth || tooltipWidth - spacing.lg * 2;
            // Keep slides at the source 16:9 aspect ratio so images are shown
            // in full (no cropping) and scale with the available width.
            const slideHeight = Math.round(slideWidth * (9 / 16));

            return (
              <View
                style={styles.carousel}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  if (w > 0 && Math.abs(w - carouselWidth) > 1) setCarouselWidth(w);
                }}
              >
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  onMomentumScrollEnd={(e) => {
                    const idx = Math.round(
                      e.nativeEvent.contentOffset.x / Math.max(slideWidth, 1)
                    );
                    setActiveSlide(idx);
                  }}
                >
                  {previewList.map((name, i) => (
                    <View
                      key={`${name}-${i}`}
                      style={[styles.carouselSlide, { width: slideWidth, height: slideHeight }]}
                    >
                      {PREVIEW_IMAGES[name] ? (
                        <Image
                          source={PREVIEW_IMAGES[name]}
                          style={{ width: slideWidth, height: slideHeight }}
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={[styles.previewPlaceholder, styles.carouselPlaceholder, { height: slideHeight }]}>
                          <Text style={styles.previewPlaceholderIcon}>📊</Text>
                          <Text style={styles.previewPlaceholderText}>Preview {i + 1}</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </ScrollView>

                {previewList.length > 1 ? (
                  <View style={styles.carouselDots}>
                    {previewList.map((_, i) => (
                      <View
                        key={i}
                        style={[styles.carouselDot, i === activeSlide && styles.carouselDotActive]}
                      />
                    ))}
                  </View>
                ) : null}
              </View>
            );
          })()}

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
  carousel: {
    marginBottom: spacing.lg,
  },
  carouselSlide: {
    borderRadius: radii.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  carouselPlaceholder: {
    marginBottom: 0,
    borderStyle: "solid",
  },
  carouselDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  carouselDotActive: {
    width: 16,
    backgroundColor: colors.accent,
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

