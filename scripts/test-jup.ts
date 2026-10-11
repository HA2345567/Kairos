async function test() {
  const url = "https://quote-api.jup.ag/v6/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=So11111111111111111111111111111111111111112&amount=500000&slippageBps=50";
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }
  });
  console.log("Status:", res.status);
  const data = await res.text();
  console.log("Body:", data.slice(0, 200));
}
test();
