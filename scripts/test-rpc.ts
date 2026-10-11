async function test() {
  try {
    const res = await fetch("https://api.mainnet-beta.solana.com", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" })
    });
    console.log("Solana status:", res.status);
  } catch (e) {
    console.log("Solana error:", e.code || e.message);
  }
}
test();
