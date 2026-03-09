import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillOpacity?: number;
  strokeWidth?: number;
  className?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 24,
  color = "var(--color-accent)",
  fillOpacity = 0.15,
  strokeWidth = 1.5,
  className
}: SparklineProps) {
  const path = useMemo(() => {
    if (data.length < 2) return null;

    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const padding = 1;

    const points = data.map((v, i) => ({
      x: padding + (i / (data.length - 1)) * (width - padding * 2),
      y: padding + (1 - (v - min) / range) * (height - padding * 2)
    }));

    // Line path
    const linePath = points
      .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
      .join(" ");

    // Fill path (close to bottom)
    const last = points[points.length - 1]!;
    const first = points[0]!;
    const fillPath = `${linePath} L ${last.x} ${height} L ${first.x} ${height} Z`;

    return { linePath, fillPath };
  }, [data, width, height]);

  if (!path) {
    return (
      <div
        className={cn("flex items-center justify-center", className)}
        style={{ width, height }}
      >
        <div className="w-full h-px bg-border" />
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      className={cn("shrink-0", className)}
    >
      <path d={path.fillPath} fill={color} opacity={fillOpacity} />
      <path
        d={path.linePath}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
