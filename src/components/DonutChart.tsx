import { G, Path, Svg } from "react-native-svg";

interface Slice {
  value: number;
  color: string;
}

interface DonutChartProps {
  slices: Slice[];
  size?: number;
  strokeWidth?: number;
}

const polarToCartesian = (cx: number, cy: number, r: number, angleDeg: number) => {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
};

const describeArc = (cx: number, cy: number, r: number, startDeg: number, endDeg: number): string => {
  // Clamp to avoid full-circle path collapse
  const clampedEnd = endDeg >= 360 ? 359.99 : endDeg;
  const start = polarToCartesian(cx, cy, r, clampedEnd);
  const end = polarToCartesian(cx, cy, r, startDeg);
  const largeArc = clampedEnd - startDeg > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
};

export function DonutChart({ slices, size = 160, strokeWidth = 22 }: DonutChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;

  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total === 0) {
    return (
      <Svg width={size} height={size}>
        <Path
          d={describeArc(cx, cy, r, 0, 359.99)}
          stroke="#1E2128"
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
        />
      </Svg>
    );
  }

  const paths: { d: string; color: string }[] = [];
  let cursor = 0;

  for (const slice of slices) {
    const deg = (slice.value / total) * 360;
    if (deg === 0) {
      continue;
    }
    paths.push({ d: describeArc(cx, cy, r, cursor, cursor + deg), color: slice.color });
    cursor += deg;
  }

  return (
    <Svg width={size} height={size}>
      <G>
        {paths.map((p, i) => (
          <Path
            key={i}
            d={p.d}
            stroke={p.color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="butt"
          />
        ))}
      </G>
    </Svg>
  );
}

