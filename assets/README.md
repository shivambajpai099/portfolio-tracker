# Assets

This folder contains static assets used in the app.

## Onboarding Tour Preview

The onboarding tour "overview" step shows a 3-image carousel. Place these
screenshots here (already included):

- `onboarding-1.jpg` — Portfolio dashboard
- `onboarding-2.jpg` — Insights / allocation
- `onboarding-3.jpg` — Holdings & performance

- **Recommended size**: 640x360px (16:9 aspect ratio) or similar
- **Format**: JPG or PNG

These are registered in `src/components/SpotlightTour.tsx` (`PREVIEW_IMAGES`)
and referenced by the `overview` step's `previewImages` array in
`src/components/OnboardingTourProvider.tsx`. Any image not registered falls back
to a styled "Preview N" placeholder.

