import { useState } from "react";
import { cn } from "@/lib/utils";

interface TokenAvatarProps {
  symbol: string;
  src?: string;
  name?: string;
  className?: string;
  size?: "xs" | "sm" | "md" | "lg";
}

// Custom fallback styling per Solana ecosystem token
const TOKEN_STYLES: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  SOL: {
    bg: "bg-gradient-to-tr from-[#9945FF] to-[#14F195]",
    text: "text-black font-extrabold",
    label: "SOL",
  },
  JUP: {
    bg: "bg-gradient-to-tr from-[#24AE8F] to-[#00BEF0]",
    text: "text-black font-extrabold",
    label: "JUP",
  },
  JTO: {
    bg: "bg-gradient-to-tr from-[#00FFA3] to-[#01A3FF]",
    text: "text-black font-extrabold",
    label: "JTO",
  },
  RAY: {
    bg: "bg-gradient-to-tr from-[#2978F4] to-[#51F3D1]",
    text: "text-white font-extrabold",
    label: "RAY",
  },
  BONK: {
    bg: "bg-gradient-to-tr from-[#F5A13B] to-[#F15A24]",
    text: "text-white font-extrabold",
    label: "BONK",
  },
  WIF: {
    bg: "bg-gradient-to-tr from-[#C38D9E] to-[#E27D60]",
    text: "text-white font-extrabold",
    label: "WIF",
  },
  RENDER: {
    bg: "bg-gradient-to-tr from-[#E51B24] to-[#7F0E12]",
    text: "text-white font-extrabold",
    label: "RNDR",
  },
  HNT: {
    bg: "bg-gradient-to-tr from-[#06B6D4] to-[#3B82F6]",
    text: "text-white font-extrabold",
    label: "HNT",
  },
  PYTH: {
    bg: "bg-gradient-to-tr from-[#6C5CE7] to-[#A29BFE]",
    text: "text-white font-extrabold",
    label: "PYTH",
  },
  KMNO: {
    bg: "bg-gradient-to-tr from-[#00D2FF] to-[#3A7BD5]",
    text: "text-black font-extrabold",
    label: "KMNO",
  },
  TRUMP: {
    bg: "bg-gradient-to-tr from-[#E53935] to-[#FFD54F]",
    text: "text-white font-extrabold",
    label: "TRMP",
  },
  PENGU: {
    bg: "bg-gradient-to-tr from-[#70D6FF] to-[#00A6FB]",
    text: "text-black font-extrabold",
    label: "PNGU",
  },
  FARTCOIN: {
    bg: "bg-gradient-to-tr from-[#39FF14] to-[#00FFA3]",
    text: "text-black font-extrabold",
    label: "FART",
  },
  PIPPIN: {
    bg: "bg-gradient-to-tr from-[#FF61D2] to-[#9945FF]",
    text: "text-white font-extrabold",
    label: "PIPN",
  },
  GOAT: {
    bg: "bg-gradient-to-tr from-[#FFD700] to-[#FF8C00]",
    text: "text-black font-extrabold",
    label: "GOAT",
  },
  IOT: {
    bg: "bg-gradient-to-tr from-[#24D605] to-[#00A3FF]",
    text: "text-black font-extrabold",
    label: "IOT",
  },
  MOBILE: {
    bg: "bg-gradient-to-tr from-[#00C9FF] to-[#92FE9D]",
    text: "text-black font-extrabold",
    label: "MOBL",
  },
};

export function TokenAvatar({
  symbol,
  src,
  name,
  className,
  size = "sm",
}: TokenAvatarProps) {
  const [hasError, setHasError] = useState(false);

  // Normalize fallback symbol
  const cleanSymbol = symbol ? symbol.toUpperCase() : "TOKEN";
  const style = TOKEN_STYLES[cleanSymbol] || {
    bg: "bg-gradient-to-tr from-amber-500 to-yellow-600",
    text: "text-black font-extrabold",
    label: cleanSymbol.slice(0, 3),
  };

  // Determine image source - prioritize provided src, then standard /tokens/ path
  const imageSource =
    src && src.trim().length > 0
      ? src
      : `/tokens/${cleanSymbol.toLowerCase()}.png`;

  if (hasError) {
    return (
      <div
        title={name || cleanSymbol}
        className={cn(
          "rounded-full flex items-center justify-center shrink-0 shadow-sm select-none border border-white/20",
          style.bg,
          style.text,
          size === "xs" && "size-4 text-[7px]",
          size === "sm" && "size-5 sm:size-5.5 text-[8px]",
          size === "md" && "size-7 text-[10px]",
          size === "lg" && "size-9 text-xs",
          className
        )}
      >
        {style.label.slice(0, 3)}
      </div>
    );
  }

  return (
    <img
      src={imageSource}
      alt={name || cleanSymbol}
      title={name ? `${name} (${cleanSymbol})` : cleanSymbol}
      onError={() => setHasError(true)}
      loading="lazy"
      className={cn(
        "rounded-full object-cover shrink-0 select-none bg-black/20 border border-white/20 shadow-sm",
        size === "xs" && "size-4",
        size === "sm" && "size-5 sm:size-5.5",
        size === "md" && "size-7",
        size === "lg" && "size-9",
        className
      )}
    />
  );
}
