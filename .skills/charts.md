# Skill: Charts

## Scope
- `src/components/DonutChart.tsx` — SVG arc donut chart
- `src/components/TimeSeriesChart.tsx` — SVG line + area chart

Both use `react-native-svg` and have zero external chart library dependencies.

---

## DonutChart

### Props
```typescript
interface DonutChartProps {
  slices: { value: number; color: string }[];
  size?: number;        // default 160
  strokeWidth?: number; // default 22
}
```

### How It Works
- Renders a circular SVG arc (`<Path>`) per slice.
- Uses polar-to-Cartesian math to convert percentages to arc start/end angles.
- `describeArc` produces SVG `A` (arc) path data. End angle clamped to 359.99° to prevent full-circle path collapse.
- `largeArc` flag set when the arc spans > 180°.
- `fill="none"` + `strokeWidth` creates the donut "ring" effect.
- When `total === 0` renders a single grey placeholder arc (`#1E2128`).

### Usage Pattern (Dashboard and X-Ray)
```typescript
<DonutChart
  slices={symbolAllocations.map((item, i) => ({
    value: item.allocationPct,
    color: DONUT_PALETTE[i % DONUT_PALETTE.length],
  }))}
  size={160}
  strokeWidth={22}
/>
```

### Colour Palettes in Use
| Context | Palette |
|---|---|
| Symbol allocations | `["#67E8F9", "#6366F1", "#F59E0B", "#22C55E", "#EC4899", "#3B82F6", "#A78BFA", "#F97316", "#14B8A6", "#E879F9"]` |
| Cash bucket | `#374151` |
| India geo | `#F59E0B` |
| US geo | `#6366F1` |
| X-Ray sectors | `["#67E8F9", "#22C55E", "#A78BFA", "#F97316", "#EC4899", "#3B82F6", "#F59E0B"]` |

---

## TimeSeriesChart

### Props
```typescript
interface TimeSeriesChartProps {
  points: TimeSeriesPoint[];           // { label: string; value: number }[]
  color: string;                       // stroke and gradient colour
  yLabel?: string;                     // optional y-axis label (not rendered currently)
  formatValue?: (value: number) => string;
}
```

### Layout Constants
```
WIDTH = 320, HEIGHT = 180
PADDING_X = 14, PADDING_Y = 18
```
The SVG uses `viewBox="0 0 320 180"` with `width="100%"` so it scales to the container.

### How It Works
1. Maps `points[i].value` to pixel coordinates via min/max normalisation.
2. Builds `linePath` (M/L path) and `areaPath` (linePath + bottom-close for gradient fill).
3. Renders:
   - Baseline `<Line>` at bottom.
   - `<LinearGradient>` fill area (35% → 4% opacity).
   - `<Path>` stroke line (2.5 px).
   - Interactive `<Circle>` dots per data point (tap to select).
4. Selected point shown in header (`headerValue` + `headerLabel`). Defaults to the last point.

### Usage Pattern (Timeline screen)
```typescript
<TimeSeriesChart
  points={toSeries(filteredSnapshots, (s) => s.totalPortfolioValue)}
  color={colors.accent}           // "#67E8F9"
  formatValue={(v) => formatMoney(v, rc)}
/>
```

`toSeries` helper in `timeline.tsx`:
```typescript
const toSeries = (snapshots, selector) =>
  snapshots.map((s) => ({ label: compactDate(s.date), value: selector(s) }));
```

### Charts Rendered in Timeline Screen
| Chart | Selector |
|---|---|
| Total portfolio value | `s.totalPortfolioValue` |
| Invested value | `s.investedValue` |
| Gain / Loss | `s.gainLoss` |

---

## Extending Charts

### Adding a new DonutChart variant
No changes to `DonutChart.tsx` needed — pass different `slices` data.

### Adding a new TimeSeriesChart series
Pass a different `selector` to `toSeries`. Change `color` prop to distinguish series visually.

### Adding interactivity to DonutChart
`DonutChart` currently has no touch handling. To add tap-to-highlight:
1. Wrap each `<Path>` in a `<G>` with an `onPress` handler.
2. Track selected index in parent state.
3. Pass selected state back as a prop to adjust `strokeWidth` or `stroke` of the active slice.

### Adding axis labels to TimeSeriesChart
The `yLabel` prop is accepted but not rendered. To implement:
1. Add a `<Text>` SVG element rotated 90° on the left edge.
2. Add X-axis tick labels below the baseline `<Line>`.
3. Reduce `PADDING_X`/`PADDING_Y` as needed to fit labels.

