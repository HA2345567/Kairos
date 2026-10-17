import { mkdir } from "node:fs/promises";
import { chromium } from "@playwright/test";

const baseURL = process.env.KAIROS_DEMO_URL ?? "http://127.0.0.1:8080";
const apiURL = process.env.KAIROS_API_URL ?? "http://127.0.0.1:3001";
const navigationTimeoutMs = Number(process.env.KAIROS_DEMO_TIMEOUT_MS ?? 120_000);
const renderTimeoutMs = Number(process.env.KAIROS_DEMO_RENDER_TIMEOUT_MS ?? 60_000);
const browser = await chromium.launch({
  channel: process.env.KAIROS_BROWSER_CHANNEL ?? (process.platform === "win32" ? "msedge" : undefined),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors: string[] = [];
page.on("pageerror", error => errors.push(error.message));
await mkdir("target/demo", { recursive: true });
try {
   const health = await page.request.get(`${apiURL}/health`);
  if (!health.ok()) throw new Error(`Backend health returned ${health.status()}`);
  console.log("Backend", await health.json());
  for (const route of ["/", "/markets", "/portfolio", "/labs", "/admin"]) {
    errors.length = 0;
     const response = await page.goto(`${baseURL}${route}`, { waitUntil: "commit", timeout: navigationTimeoutMs });
    if (!response?.ok()) throw new Error(`${route} returned ${response?.status()}`);
    try {
       await page.waitForFunction(() => (document.querySelector("#root")?.textContent?.trim().length ?? 0) > 80, undefined, { timeout: renderTimeoutMs });
    } finally {
      await page.screenshot({ path: `target/demo/${route.replaceAll("/", "") || "home"}.png`, fullPage: true });
    }
    if (errors.length) throw new Error(`${route}: ${errors.join("; ")}`);
    console.log(`${route}: rendered`, (await page.locator("#root").innerText()).slice(0, 650));
  }
} catch (error) {
  console.error("Browser errors:", errors);
  throw error;
} finally {
  await browser.close();
}
