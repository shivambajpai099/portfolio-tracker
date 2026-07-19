import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { View, type LayoutRectangle, type ViewProps } from "react-native";
import { useRouter } from "expo-router";
import { SpotlightTour, type TourStep } from "./SpotlightTour";

/**
 * Tour steps for the onboarding experience.
 * Each step highlights a key feature of the app.
 */
const ONBOARDING_TOUR_STEPS: TourStep[] = [
  {
    key: "accounts-add",
    title: "Start by adding an account",
    description:
      "Add your broker accounts (like INDmoney, Groww, Zerodha, or Fidelity) right here. You can add as many accounts as you like — including SAVINGS accounts to track cash balances — and manage them all from one place.",
    targetTab: "index",
    tooltipPosition: "bottom",
  },
  {
    key: "holdings-add",
    title: "Import your transactions",
    description:
      "Once an account is added, tap Import to bring in your transactions. For the most accurate overview of your equity investments, import your entire transaction statement — cost basis, realized gains, and holding periods are then calculated automatically. Heads up: corporate actions like stock splits and bonus issues may not appear in every statement, which can throw off quantities. You can review and fix these anytime under Settings → Stock Splits. Prefer to enter things yourself? Use Add to record holdings manually.",
    targetTab: "index",
    tooltipPosition: "bottom",
  },
  {
    key: "overview",
    title: "Your whole portfolio at a glance",
    description:
      "Your holdings from every account are combined into one consolidated view — total value, allocation breakdown, and performance across all accounts and geographies, side by side.",
    targetTab: "index",
    tooltipPosition: "bottom",
    previewImages: ["onboarding-1.jpg", "onboarding-2.jpg", "onboarding-3.jpg"],
  },
  {
    key: "insights",
    title: "Discover portfolio insights",
    description:
      "See concentration risk, geographic allocation, and performance & behavior analytics — win rate, best and worst performers, and more. Spot imbalances before they become problems.",
    targetTab: "insights",
    tooltipPosition: "bottom",
  },
  {
    key: "settings",
    title: "Customize your experience",
    description:
      "Set your preferred currency (INR or USD), fetch the live exchange rate, and choose whether uninvested cash from savings accounts is included in your percentage allocation. You can also export or import your data here.",
    targetTab: "settings",
    tooltipPosition: "top",
  },
];

interface TourTargetRefs {
  [key: string]: LayoutRectangle | null;
}

interface OnboardingTourContextValue {
  /** Whether the tour is currently visible */
  isActive: boolean;
  /** Current step index */
  currentStep: number;
  /** Total number of steps */
  totalSteps: number;
  /** Current step data */
  currentStepData: TourStep | null;
  /** Start the tour */
  startTour: () => void;
  /** Skip/cancel the tour */
  skipTour: () => void;
  /** Complete the tour */
  completeTour: () => void;
  /** Go to next step */
  nextStep: () => void;
  /** Register a target ref for a tour step */
  registerTarget: (key: string, rect: LayoutRectangle | null) => void;
  /** Whether the tour has been seen/completed */
  tourSeen: boolean;
}

const OnboardingTourContext = createContext<OnboardingTourContextValue | null>(null);

/**
 * Hook to access the onboarding tour context.
 * Returns a no-op fallback if used outside the provider (safe for initial renders).
 */
export function useOnboardingTour(): OnboardingTourContextValue {
  const context = useContext(OnboardingTourContext);
  if (!context) {
    // Return a no-op fallback for components that render before the provider mounts
    return {
      isActive: false,
      currentStep: 0,
      totalSteps: 0,
      currentStepData: null,
      startTour: () => {},
      skipTour: () => {},
      completeTour: () => {},
      nextStep: () => {},
      registerTarget: () => {},
      tourSeen: true,
    };
  }
  return context;
}

interface OnboardingTourProviderProps {
  children: React.ReactNode;
  /** Whether the tour has been completed (from settings) */
  tourSeen: boolean;
  /** Called when the tour is completed or skipped */
  onTourComplete: () => void;
  /** Whether to auto-start tour for new users (no accounts) */
  shouldAutoStart: boolean;
}

export function OnboardingTourProvider({
  children,
  tourSeen,
  onTourComplete,
  shouldAutoStart,
}: OnboardingTourProviderProps) {
  const router = useRouter();
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRefs, setTargetRefs] = useState<TourTargetRefs>({});

  // Navigate to the target tab for the given step
  const navigateToStepTab = useCallback((step: TourStep) => {
    if (step.targetTab) {
      // Use `navigate` (not `push`) so we switch tabs in place instead of
      // stacking screens — otherwise Skip/Done leaves the user deep in a
      // navigation stack on the last visited tab.
      const route = step.targetTab === "index" ? "/(tabs)" : `/(tabs)/${step.targetTab}`;
      router.navigate(route as never);
    }
  }, [router]);

  // Auto-start tour for new users who haven't seen it
  useEffect(() => {
    if (shouldAutoStart && !tourSeen && !isActive) {
      // Small delay to let the UI render first
      const timer = setTimeout(() => {
        setIsActive(true);
        setCurrentStep(0);
        // Navigate to the first step's tab
        const firstStep = ONBOARDING_TOUR_STEPS[0];
        if (firstStep) {
          navigateToStepTab(firstStep);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [shouldAutoStart, tourSeen, isActive, navigateToStepTab]);

  const startTour = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
    // Navigate to the first step's tab
    const firstStep = ONBOARDING_TOUR_STEPS[0];
    if (firstStep) {
      navigateToStepTab(firstStep);
    }
  }, [navigateToStepTab]);

  const skipTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    onTourComplete();
  }, [onTourComplete]);

  const completeTour = useCallback(() => {
    setIsActive(false);
    setCurrentStep(0);
    onTourComplete();
  }, [onTourComplete]);

  const nextStep = useCallback(() => {
    if (currentStep < ONBOARDING_TOUR_STEPS.length - 1) {
      const nextStepIndex = currentStep + 1;
      const nextStepData = ONBOARDING_TOUR_STEPS[nextStepIndex];
      setCurrentStep(nextStepIndex);
      // Navigate to the next step's tab
      if (nextStepData) {
        navigateToStepTab(nextStepData);
      }
    } else {
      completeTour();
    }
  }, [currentStep, completeTour, navigateToStepTab]);

  const registerTarget = useCallback((key: string, rect: LayoutRectangle | null) => {
    setTargetRefs((prev) => {
      if (prev[key] === rect) return prev;
      return { ...prev, [key]: rect };
    });
  }, []);

  const currentStepData = ONBOARDING_TOUR_STEPS[currentStep] ?? null;
  const currentTargetRect = currentStepData ? targetRefs[currentStepData.key] ?? null : null;

  const contextValue = useMemo<OnboardingTourContextValue>(
    () => ({
      isActive,
      currentStep,
      totalSteps: ONBOARDING_TOUR_STEPS.length,
      currentStepData,
      startTour,
      skipTour,
      completeTour,
      nextStep,
      registerTarget,
      tourSeen,
    }),
    [isActive, currentStep, currentStepData, startTour, skipTour, completeTour, nextStep, registerTarget, tourSeen]
  );

  return (
    <OnboardingTourContext.Provider value={contextValue}>
      {children}
      <SpotlightTour
        visible={isActive}
        steps={ONBOARDING_TOUR_STEPS}
        currentStep={currentStep}
        targetRect={currentTargetRect}
        onNext={nextStep}
        onSkip={skipTour}
        onComplete={completeTour}
      />
    </OnboardingTourContext.Provider>
  );
}

/**
 * Wrapper component that registers its layout as a tour target.
 * Use this to wrap elements that should be highlighted during the tour.
 */
interface TourTargetProps extends ViewProps {
  /** The tour step key this target corresponds to */
  tourKey: string;
  children: React.ReactNode;
}

export function TourTarget({ tourKey, children, style, ...props }: TourTargetProps) {
  const { registerTarget, isActive, currentStepData } = useOnboardingTour();
  const viewRef = useRef<View>(null);

  // Measure and register position when tour is active and this is the current target
  useEffect(() => {
    if (!isActive || currentStepData?.key !== tourKey) {
      return;
    }

    const measure = () => {
      viewRef.current?.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) {
          registerTarget(tourKey, { x, y, width, height });
        }
      });
    };

    // Measure after a brief delay to ensure layout is complete
    const timer = setTimeout(measure, 100);
    return () => clearTimeout(timer);
  }, [isActive, currentStepData?.key, tourKey, registerTarget]);

  return (
    <View ref={viewRef} style={style} {...props} collapsable={false}>
      {children}
    </View>
  );
}

