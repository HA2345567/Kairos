import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";
import "@solana/wallet-adapter-react-ui/styles.css";

// Polyfill Buffer for libraries that expect it globally
if (typeof window !== "undefined") {
  window.Buffer = window.Buffer || Buffer;
}

createRoot(document.getElementById("root")!).render(<App />);
