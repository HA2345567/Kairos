import { forwardRef, type SVGProps } from "react";
import { cn } from "@/lib/utils";

/**
 * Kairos logo — forwardRef so it can be used as a child of Radix Slot / router Link safely.
 */
export const Logo = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  ({ className, ...props }, ref) => (
    <svg
      ref={ref}
      viewBox="0 0 100 60"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-foreground", className)}
      aria-hidden
      {...props}
    >
      {/* Precision Geometric H Mark */}
      <path 
        d="
          M 38 26 h 24 v 8 h -24 Z
          M 36 26 L 18 26 L 8 16 L 26 16 Z
          M 36 34 L 18 34 L 8 44 L 26 44 Z
          M 64 26 L 82 26 L 92 16 L 74 16 Z
          M 64 34 L 82 34 L 92 44 L 74 44 Z
        " 
        fill="currentColor" 
      />
    </svg>
  ),
);
Logo.displayName = "Logo";
