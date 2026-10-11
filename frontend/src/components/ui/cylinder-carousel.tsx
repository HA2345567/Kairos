"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";

export interface CarouselImage {
  src: string;
  alt?: string;
  title?: string;
}

export interface CylinderCarouselProps<T = any>
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  images?: CarouselImage[];
  items?: T[];
  renderItem?: (item: T, index: number) => React.ReactNode;
  children?: React.ReactNode;
  containerClassName?: string;
  cardClassName?: string;
  animationDuration?: number; // in seconds (default 36)
  cardWidth?: number; // in pixels (default 245)
  cardHeight?: number; // in pixels (default 360)
  radius?: number; // custom radius in pixels
  perspective?: string; // CSS value (default '2000px' for convex, '35em' for concave)
  faceMode?: "convex" | "concave"; // convex = cards face outward toward viewer (default), concave = inside drum
  reverseRotation?: boolean; // reverse spin direction
  showControls?: boolean;
}

export function CylinderCarousel<T = any>({
  images,
  items,
  renderItem,
  children,
  className,
  containerClassName,
  cardClassName,
  animationDuration = 36,
  cardWidth = 250,
  cardHeight = 360,
  radius: userRadius,
  perspective,
  faceMode = "convex",
  reverseRotation = true,
  showControls = true,
  ...props
}: CylinderCarouselProps<T>) {
  const rawChildren = React.Children.toArray(children);
  const itemCount = images?.length || items?.length || rawChildren.length || 0;
  const N = Math.max(1, itemCount);

  // Exact mathematical polygon apothem so card edges touch flush edge-to-edge ("sata kar")
  const theta = (2 * Math.PI) / N;
  const halfWidth = cardWidth / 2;
  const edgeTouchGap = 2; // small 2px breathing gap between card edges
  const exactRadius = userRadius ?? (halfWidth + edgeTouchGap) / Math.tan(theta / 2);

  const translateZPx = faceMode === "convex" ? exactRadius : -1 * exactRadius;

  const effectivePerspective =
    perspective || (faceMode === "convex" ? "1800px" : "35em");

  // Interactive rotation state (when user clicks prev/next or drags)
  const [manualOffset, setManualOffset] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const dragStartOffset = useRef(0);

  const stepAngle = 360 / N;

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartX.current = e.clientX;
    dragStartOffset.current = manualOffset;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const deltaX = e.clientX - dragStartX.current;
    // Map drag pixels to cylinder degrees
    const sensitivity = faceMode === "convex" ? 0.25 : -0.25;
    setManualOffset(dragStartOffset.current + deltaX * sensitivity);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  };

  const handlePrev = useCallback(() => {
    setManualOffset((prev) => prev - stepAngle);
  }, [stepAngle]);

  const handleNext = useCallback(() => {
    setManualOffset((prev) => prev + stepAngle);
  }, [stepAngle]);

  const renderContent = (index: number) => {
    if (items && renderItem) {
      return renderItem(items[index], index);
    }
    if (images && images[index]) {
      return (
        <img
          src={images[index].src}
          alt={images[index].alt || `Card ${index}`}
          className="w-full h-full object-cover rounded-2xl select-none"
          draggable={false}
        />
      );
    }
    if (rawChildren[index]) {
      return rawChildren[index];
    }
    return null;
  };

  // Rotation direction:
  // If reverseRotation is true, spin clockwise so cards move forward left-to-right
  const animKeyframes = reverseRotation
    ? `
      @keyframes ry {
        0% { transform: rotateY(0deg); }
        100% { transform: rotateY(-360deg); }
      }
    `
    : `
      @keyframes ry {
        0% { transform: rotateY(0deg); }
        100% { transform: rotateY(360deg); }
      }
    `;

  return (
    <div
      className={cn(
        "group relative w-full overflow-hidden select-none pt-0 pb-3 flex flex-col items-center",
        className
      )}
      {...props}
    >
      <style>
        {`
          ${animKeyframes}
          .cylinder-track-anim {
            animation: ry ${animationDuration}s linear infinite;
          }
          .cylinder-track-anim.is-paused,
          .group:hover .cylinder-track-anim {
            animation-play-state: paused;
          }
        `}
      </style>

      {/* 3D Viewport — full bleed horizontal span with gradient mask on edges */}
      <div
        className="w-full min-h-[460px] pt-1 pb-4 grid place-items-center overflow-hidden cursor-grab active:cursor-grabbing"
        style={{
          perspective: effectivePerspective,
          WebkitPerspective: effectivePerspective,
          maskImage:
            "linear-gradient(90deg, transparent 0%, #000 10%, #000 90%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(90deg, transparent 0%, #000 10%, #000 90%, transparent 100%)",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Manual offset rotational wrapper for drag/step controls */}
        <div
          className="w-fit h-fit [transform-style:preserve-3d] transition-transform duration-300 ease-out"
          style={{
            transform: `rotateY(${manualOffset}deg)`,
          }}
        >
          {/* Continuous auto-rotating cylinder track */}
          <div
            className={cn(
              "grid place-items-center [transform-style:preserve-3d] cylinder-track-anim motion-reduce:!animation-none",
              isPaused && "is-paused",
              containerClassName
            )}
            style={{
              width: `${cardWidth}px`,
              height: `${cardHeight}px`,
            }}
          >
            {Array.from({ length: N }).map((_, i) => {
              const cardAngle = (360 / N) * i;
              return (
                <div
                  key={i}
                  className={cn(
                    "[grid-area:1/1] [transform-style:preserve-3d] [backface-visibility:hidden] will-change-transform",
                    cardClassName
                  )}
                  style={{
                    width: `${cardWidth}px`,
                    height: `${cardHeight}px`,
                    transform: `rotateY(${cardAngle}deg) translateZ(${translateZPx.toFixed(
                      2
                    )}px)`,
                  }}
                >
                  {renderContent(i)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Optional Navigation Controls */}
      {showControls && (
        <div className="mt-3 flex items-center justify-center gap-3 relative z-20 pointer-events-auto">
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Previous basket"
            className="flex items-center justify-center size-9 rounded-full border border-border/50 bg-background/80 hover:bg-neutral-800 text-foreground transition-all duration-150 hover:scale-105 active:scale-95 shadow-md backdrop-blur-md cursor-pointer"
          >
            <ChevronLeft className="size-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsPaused((prev) => !prev)}
            aria-label={isPaused ? "Play auto rotation" : "Pause auto rotation"}
            className="flex items-center justify-center size-9 rounded-full border border-border/50 bg-background/80 hover:bg-neutral-800 text-muted-foreground hover:text-foreground transition-all duration-150 hover:scale-105 active:scale-95 shadow-md backdrop-blur-md cursor-pointer"
          >
            {isPaused ? <Play className="size-3.5 fill-current" /> : <Pause className="size-3.5" />}
          </button>

          <button
            type="button"
            onClick={handleNext}
            aria-label="Next basket"
            className="flex items-center justify-center size-9 rounded-full border border-border/50 bg-background/80 hover:bg-neutral-800 text-foreground transition-all duration-150 hover:scale-105 active:scale-95 shadow-md backdrop-blur-md cursor-pointer"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}

export default CylinderCarousel;
