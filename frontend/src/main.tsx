import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";
import "@solana/wallet-adapter-react-ui/styles.css";

// Optional remote fonts must not block the first render on a slow connection.
// Use an external-script listener rather than an inline handler (CSP-safe).
const optionalFonts = document.getElementById("optional-fonts") as HTMLLinkElement | null;
if (optionalFonts) {
  const enableFonts = () => { optionalFonts.media = "all"; };
  if (optionalFonts.sheet) enableFonts();
  else optionalFonts.addEventListener("load", enableFonts, { once: true });
}

// Polyfill Buffer for libraries that expect it globally
if (typeof window !== "undefined") {
  window.Buffer = window.Buffer || Buffer;
}

createRoot(document.getElementById("root")!).render(<App />);
