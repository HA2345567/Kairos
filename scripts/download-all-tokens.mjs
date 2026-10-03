import fs from 'fs';
import path from 'path';

const tokens = [
  { symbol: 'CLOUD', mint: 'CLoUDKc4Ane7HeQcPpE3YHnznRxhMimJ4MyaUqyHFzAu', filename: 'cloud.png' },
  { symbol: 'BP', mint: 'BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy', filename: 'bp.png' },
  { symbol: 'JUP', mint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN', filename: 'jup.png' },
  { symbol: 'JitoSOL', mint: 'J1toso1uCk3RKmWHx4qQCeqAghWvMtPxxDMTjaNaUhS', filename: 'jitosol.png' },
  { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112', filename: 'sol.png' },
  { symbol: 'mSOL', mint: 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So', filename: 'msol.png' },
  { symbol: 'KMNO', mint: 'KMNo3nJsBXfcpJTVhZcXLW7RmTwTt4GVFE7suUBo9sS', filename: 'kmno.png' },
  { symbol: 'RAY', mint: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R', filename: 'ray.png' },
  { symbol: 'ORCA', mint: 'orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE', filename: 'orca.png' },
  { symbol: 'MET', mint: 'METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL', filename: 'met.png' },
  { symbol: 'ARX', mint: 'ARXwZkNAtzPfdcoqQiduJn8EPv9fKiDfGn2KyggyDrFs', filename: 'arx.png' },
  { symbol: 'JTO', mint: 'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL', filename: 'jto.png' },
  { symbol: 'PYTH', mint: 'HZ1JovNiDcZvKhVkW1dhPfDYDA422BX2UStnrD1182BQ', filename: 'pyth.png' },
  { symbol: 'RENDER', mint: 'rndrizKT3MK1iimdxRdWabcF7Zg7AR5T4nud4EkHBof', filename: 'render.png' },
  { symbol: 'BONK', mint: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263', filename: 'bonk.png' },
  { symbol: 'TRUMP', mint: '6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN', filename: 'trump.png' },
  { symbol: 'PENGU', mint: '2zMMhcVQEXDtdE6vsFS7S7D5oUodfJHE8vd1gnBouauv', filename: 'pengu.png' },
  { symbol: 'FARTCOIN', mint: '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump', filename: 'fartcoin.png' },
  { symbol: 'PIPPIN', mint: 'Dfh5DzRgSvvCFDoYc2ciTkMrbDfRKybA4SoFbPmApump', filename: 'pippin.png' },
  { symbol: 'GOAT', mint: 'CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump', filename: 'goat.png' },
  { symbol: 'HNT', mint: 'hntyVP6YFm1Hg25TN9WGLqM12b8TQmcknKrdu1oxWux', filename: 'hnt.png' },
  { symbol: 'IOT', mint: 'iotEVVZLEywoTn1QdwNPddxPWszn3zFhEot3MfL9fns', filename: 'iot.png' },
  { symbol: 'MOBILE', mint: 'mb1eu7TzEc71KxDpsmsKoucSSuuoGLv1drys1oP2jh6', filename: 'mobile.png' }
];

const outDir = path.resolve('frontend/public/tokens');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

async function run() {
  for (const t of tokens) {
    try {
      console.log(`Checking ${t.symbol} (${t.mint})...`);
      let logoUrl = null;

      // 1. Try Jupiter
      const jupRes = await fetch(`https://tokens.jup.ag/token/${t.mint}`).catch(() => null);
      if (jupRes && jupRes.ok) {
        const data = await jupRes.json();
        if (data.logoURI) logoUrl = data.logoURI;
      }

      // 2. Try DexScreener if not found
      if (!logoUrl) {
        const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${t.mint}`).catch(() => null);
        if (dexRes && dexRes.ok) {
          const dexData = await dexRes.json();
          if (dexData.pairs && dexData.pairs[0]?.info?.imageUrl) {
            logoUrl = dexData.pairs[0].info.imageUrl;
          }
        }
      }

      // Known direct high-res official fallbacks
      if (t.symbol === 'BP' && (!logoUrl || logoUrl.includes('placeholder'))) {
        logoUrl = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/BPxxfRCXkUVhig4HS1Lh7kZqV6SPJhzfEk4x6fVBjPCy/logo.png';
      }
      if (t.symbol === 'mSOL' && !logoUrl) {
        logoUrl = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png';
      }
      if (t.symbol === 'JitoSOL' && !logoUrl) {
        logoUrl = 'https://storage.googleapis.com/token-metadata/JitoSOL-256.png';
      }
      if (t.symbol === 'ORCA' && !logoUrl) {
        logoUrl = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png';
      }
      if (t.symbol === 'MET' && !logoUrl) {
        logoUrl = 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/METvsvVRapdj9cFLzq4Tr43xK4tAjQfwX76z3n6mWQL/logo.png';
      }

      console.log(`-> URL for ${t.symbol}:`, logoUrl);
      if (logoUrl) {
        // If IPFS URL, map to public gateway
        if (logoUrl.startsWith('ipfs://')) {
          logoUrl = logoUrl.replace('ipfs://', 'https://cloudflare-ipfs.com/ipfs/');
        }

        const imgRes = await fetch(logoUrl).catch(() => null);
        if (imgRes && imgRes.ok) {
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          if (buffer.length > 500) { // Valid image
            const dest = path.join(outDir, t.filename);
            fs.writeFileSync(dest, buffer);
            console.log(`Saved ${t.symbol} to ${t.filename} (${buffer.length} bytes)`);
          }
        }
      }
    } catch (e) {
      console.error(`Error fetching ${t.symbol}:`, e.message);
    }
  }
}

run();
