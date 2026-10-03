import fs from "fs";
import path from "path";

const targetDir = path.resolve(process.cwd(), "public/baskets");
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const uploadsDir = "C:/Users/Harsh/.gemini/antigravity-ide/brain/2ad5240c-5df0-4a00-9f13-9876cf8955c7/.user_uploaded";

fs.copyFileSync(path.join(uploadsDir, "media_1790453838877.jpg"), path.join(targetDir, "solana-spartan.jpg"));
fs.copyFileSync(path.join(uploadsDir, "media_1790451647859.png"), path.join(targetDir, "solana-orb.png"));
fs.copyFileSync(path.join(uploadsDir, "media_1790452637281.jpg"), path.join(targetDir, "solana-purple.jpg"));

console.log("Successfully copied basket images to public/baskets:");
console.log(fs.readdirSync(targetDir));
