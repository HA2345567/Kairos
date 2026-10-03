import { useEffect, useState, useMemo, useRef } from "react";

interface RealtimeSparklineProps {
  id: string;
  initialData?: number[];
  isPositive?: boolean;
  width?: number;
  height?: number;
  className?: string;
  enableLiveTicks?: boolean;
}

export function RealtimeSparkline({
  id,
  initialData,
  isPositive = true,
  width = 150,
  height = 42,
  className = "",
  enableLiveTicks = true,
}: RealtimeSparklineProps) {
  // Seed initial data points
  const defaultData = useMemo(() => {
    if (initialData && initialData.length >= 6) return initialData;
    return [24, 26, 25, 29, 31, 30, 35, 38, 36, 42, 45, 43, 49, 52, 55];
  }, [initialData]);

  const [points, setPoints] = useState<number[]>(defaultData);
  const [pulse, setPulse] = useState(false);
  const tickRef = useRef<number | null>(null);

  // Real-time live ticking effect — simulates active WebSocket price stream
  useEffect(() => {
    if (!enableLiveTicks) return;

    // Stagger intervals slightly per basket id so they don't all tick at the exact same millisecond
    const seed = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const intervalTime = 2000 + (seed % 1200); // Between 2000ms and 3200ms

    const interval = setInterval(() => {
      setPoints((prev) => {
        const lastVal = prev[prev.length - 1];
        // Micro fluctuation: -0.6% to +0.8%
        const deltaPct = (Math.random() - 0.46) * 0.015;
        const newVal = Math.max(1, +(lastVal * (1 + deltaPct)).toFixed(2));

        // Slide the window: drop first point, add new point
        const next = [...prev.slice(1), newVal];
        return next;
      });

      // Trigger a subtle beacon pulse
      setPulse(true);
      if (tickRef.current) clearTimeout(tickRef.current);
      tickRef.current = window.setTimeout(() => setPulse(false), 800);
    }, intervalTime);

    return () => {
      clearInterval(interval);
      if (tickRef.current) clearTimeout(tickRef.current);
    };
  }, [id, enableLiveTicks]);

  // Compute SVG coordinates
  const { linePath, areaPath, lastPt, strokeColor } = useMemo(() => {
    const minVal = Math.min(...points);
    const maxVal = Math.max(...points);
    const range = maxVal - minVal || 1;
    const paddingY = 4;
    const paddingX = 4;
    const usableWidth = width - paddingX * 2;
    const usableHeight = height - paddingY * 2;

    const coords = points.map((val, i) => {
      const x = paddingX + (i / (points.length - 1)) * usableWidth;
      const y = height - paddingY - ((val - minVal) / range) * usableHeight;
      return { x, y };
    });

    // Build smooth cubic bezier curve
    const path = coords.reduce((acc, pt, i, arr) => {
      if (i === 0) return `M ${pt.x},${pt.y}`;
      const prev = arr[i - 1];
      const midX = (prev.x + pt.x) / 2;
      return `${acc} C ${midX},${prev.y} ${midX},${pt.y} ${pt.x},${pt.y}`;
    }, "");

    const lastCoord = coords[coords.length - 1];
    const area = `${path} L ${lastCoord.x},${height} L ${coords[0].x},${height} Z`;

    const color = isPositive ? "#10B981" : "#EF4444";

    return {
      linePath: path,
      areaPath: area,
      lastPt: lastCoord,
      strokeColor: color,
    };
  }, [points, width, height, isPositive]);

  const gradientId = `realtime-sparkline-grad-${id}`;

  return (
    <div className={`relative shrink-0 flex items-center ${className}`} style={{ width, height }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible transition-all duration-300"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.28} />
            <stop offset="60%" stopColor={strokeColor} stopOpacity={0.08} />
            <stop offset="100%" stopColor={strokeColor} stopOpacity={0.0} />
          </linearGradient>
        </defs>

        {/* Gradient fill area */}
        <path
          d={areaPath}
          fill={`url(#${gradientId})`}
          className="transition-all duration-500 ease-out"
        />

        {/* Neon Glowing Line */}
        <path
          d={linePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="transition-all duration-500 ease-out"
          style={{
            filter: isPositive
              ? "drop-shadow(0 0 3px rgba(16, 185, 129, 0.45))"
              : "drop-shadow(0 0 3px rgba(239, 68, 68, 0.45))",
          }}
        />

        {/* Live Beacon Dot at Latest Tick (Red Circle in User Screenshot) */}
        {lastPt && (
          <g className="transition-all duration-300 ease-out">
            {/* Outer expanding ping ring */}
            <circle
              cx={lastPt.x}
              cy={lastPt.y}
              r={pulse ? "6.5" : "4.5"}
              fill={strokeColor}
              opacity={pulse ? "0.8" : "0.35"}
              className="animate-ping origin-center"
              style={{ transformBox: "fill-box" }}
            />

            {/* Glowing solid dot */}
            <circle
              cx={lastPt.x}
              cy={lastPt.y}
              r="3.2"
              fill={strokeColor}
              style={{
                filter: `drop-shadow(0 0 5px ${strokeColor})`,
              }}
            />

            {/* Bright center highlight */}
            <circle cx={lastPt.x} cy={lastPt.y} r="1.3" fill="#FFFFFF" />
          </g>
        )}
      </svg>
    </div>
  );
}
