interface BasketSparklineProps {
  values: number[];
  isPositive: boolean;
  width?: number;
  height?: number;
  className?: string;
}

export function BasketSparkline({
  values,
  isPositive,
  width = 150,
  height = 42,
  className = "",
}: BasketSparklineProps) {
  const data = values.filter((value) => Number.isFinite(value));
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const range = Math.max(...data) - min || 1;
  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * (height - 8) - 4;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      role="img"
      aria-label={`Historical basket performance, ${isPositive ? "up" : "down"}`}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      width={width}
      height={height}
      preserveAspectRatio="none"
    >
      <polyline
        points={points}
        fill="none"
        stroke={isPositive ? "#10B981" : "#EF4444"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
