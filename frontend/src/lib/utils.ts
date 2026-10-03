import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const getAvatar = (seed: string, isAgent?: boolean) => {
  if (isAgent) {
    return `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=0a0a0a&colors=00ffbd`;
  }
  return `https://api.dicebear.com/7.x/identicon/svg?seed=${seed}`;
};
