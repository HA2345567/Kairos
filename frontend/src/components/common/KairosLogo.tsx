import React from "react";
import { cn } from "@/lib/utils";

interface KairosLogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number | string;
  variant?: "current" | "white" | "lime" | "silver";
}

export function KairosLogo({
  className,
  size,
  variant = "current",
  ...props
}: KairosLogoProps) {
  const getFill = () => {
    switch (variant) {
      case "white":
        return "#FFFFFF";
      case "lime":
        return "#c5ff4a";
      case "silver":
        return "url(#kairos-silver-gradient)";
      case "current":
      default:
        return "currentColor";
    }
  };

  return (
    <svg
      viewBox="0 0 501 498"
      fill={getFill()}
      xmlns="http://www.w3.org/2000/svg"
      className={cn("inline-block shrink-0", className)}
      style={size ? { width: size, height: size } : undefined}
      aria-label="Kairos Logo"
      {...props}
    >
      <defs>
        <linearGradient
          id="kairos-silver-gradient"
          x1="0"
          y1="0"
          x2="501"
          y2="498"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="#D4D4D4" />
          <stop offset="100%" stopColor="#8A8A8A" />
        </linearGradient>
      </defs>
      <path d="M 0 0 L 164 0 L 165 166 L 322 11 L 336 3 L 347 0 L 500 0 L 164 330 L 316 331 L 337 338 L 374 374 L 487 497 L 341 497 L 319 490 L 298 471 L 165 331 L 164 497 L 0 497 L 0 347 L 3 336 L 9 325 L 84 251 L 78 249 L 0 249 L 0 0 Z" />
    </svg>
  );
}

export default KairosLogo;
