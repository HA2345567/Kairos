import fs from "fs";
import path from "path";

const TOKENS: Record<string, string> = {
  // Official, reliable URLs or CoinGecko / Jupiter / official raw sources
  SOL: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
  JUP: "https://static.jup.ag/jup/icon.png",
  JTO: "https://metadata.jito.network/token/jto/icon.png",
  RAY: "https://raw.githubusercontent.com/raydium-io/media-assets/master/logo.png",
  BONK: "https://arweave.net/hQiPZOsRZXGXBJd_82PhVdlM_hACsT_q6wqwf5c90TU",
  WIF: "https://bafkreibk3covs5ltyqxa272uodhculift6nlxfygqc2sf2esrgpddyus6q.ipfs.nftstorage.link",
  RENDER: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof/icon.png",
  HNT: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux/logo.png",
  PYTH: "https://pyth.network/token.svg"
};

// Fallback high-reputation public CDNs
const FALLBACK_URLS: Record<string, string[]> = {
  SOL: [
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png",
    "https://assets.coingecko.com/coins/images/4128/large/solana.png"
  ],
  JUP: [
    "https://assets.coingecko.com/coins/images/34188/large/jup.png",
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN/logo.png"
  ],
  JTO: [
    "https://assets.coingecko.com/coins/images/33228/large/jto.png",
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL/logo.png"
  ],
  RAY: [
    "https://assets.coingecko.com/coins/images/13928/large/Raydium_Logo.png",
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R/logo.png"
  ],
  BONK: [
    "https://assets.coingecko.com/coins/images/28600/large/bonk.jpg",
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/logo.png"
  ],
  WIF: [
    "https://assets.coingecko.com/coins/images/33566/large/dogwifhat.jpg",
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm/logo.png"
  ],
  RENDER: [
    "https://assets.coingecko.com/coins/images/11636/large/rndr.png",
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof/logo.png"
  ],
  HNT: [
    "https://assets.coingecko.com/coins/images/4284/large/Helium_HNT.png",
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux/logo.png"
  ],
  PYTH: [
    "https://assets.coingecko.com/coins/images/31924/large/pyth.png",
    "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/assets/HZ1JovNiDcZvKhVkW1dhPfDYDA422BX2UStnrD1182BQ/logo.png"
  ]
};

async function download() {
  const destDir = path.resolve(process.cwd(), "public/tokens");
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  for (const [symbol, primaryUrl] of Object.entries(TOKENS)) {
    const urlsToTry = [primaryUrl, ...(FALLBACK_URLS[symbol] || [])];
    let downloaded = false;

    for (const url of urlsToTry) {
      try {
        console.log(`Trying ${symbol} from ${url}...`);
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (res.ok) {
          const buffer = await res.arrayBuffer();
          if (buffer.byteLength > 100) {
            const ext = url.endsWith(".svg") ? "svg" : url.endsWith(".jpg") ? "jpg" : "png";
            const filePath = path.join(destDir, `${symbol.toLowerCase()}.${ext}`);
            fs.writeFileSync(filePath, Buffer.from(buffer));
            console.log(`✔ Successfully saved ${symbol} (${buffer.byteLength} bytes) to ${filePath}`);
            downloaded = true;
            break;
          }
        }
      } catch (e: any) {
        console.warn(`Failed ${symbol} from ${url}:`, e?.message);
      }
    }

    if (!downloaded) {
      console.error(`❌ Could not download token logo for ${symbol}`);
    }
  }
}

download();
