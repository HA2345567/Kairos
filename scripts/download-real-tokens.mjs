import fs from 'fs';
import path from 'path';

const downloads = [
  { file: 'cloud.png', url: 'https://s2.coinmarketcap.com/static/img/coins/128x128/32299.png' },
  { file: 'bp.png', url: 'https://s2.coinmarketcap.com/static/img/coins/128x128/39686.png' },
  { file: 'jitosol.png', url: 'https://s2.coinmarketcap.com/static/img/coins/128x128/22533.png' },
  { file: 'msol.png', url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So/logo.png' },
  { file: 'orca.png', url: 'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE/logo.png' },
  { file: 'met.png', url: 'https://s2.coinmarketcap.com/static/img/coins/128x128/38353.png' },
  { file: 'arx.png', url: 'https://s2.coinmarketcap.com/static/img/coins/128x128/40098.png' },
  { file: 'kmno.png', url: 'https://s2.coinmarketcap.com/static/img/coins/128x128/30986.png' }
];

const destDir = path.resolve('frontend/public/tokens');

async function main() {
  for (const item of downloads) {
    try {
      console.log(`Downloading ${item.file} from ${item.url}...`);
      const res = await fetch(item.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      const dest = path.join(destDir, item.file);
      fs.writeFileSync(dest, buf);
      console.log(`Successfully saved ${item.file} (${buf.length} bytes)`);
    } catch (e) {
      console.error(`Failed ${item.file}:`, e.message);
    }
  }
}

main();
