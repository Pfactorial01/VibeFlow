#!/usr/bin/env node
/**
 * Reads ngrok's local API (http://127.0.0.1:4040) and prints the HTTPS webhook URL for Mux.
 * Run after: ngrok http 4000
 */
const maxAttempts = 90;
const delayMs = 1000;

async function main() {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const r = await fetch("http://127.0.0.1:4040/api/tunnels");
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json();
      const tunnels = j.tunnels ?? [];
      const https = tunnels.find((t) => t.proto === "https");
      if (https?.public_url) {
        const base = https.public_url.replace(/\/$/, "");
        console.log("");
        console.log("Set this URL in Mux → Webhooks:");
        console.log(base + "/webhooks/mux");
        console.log("");
        return;
      }
    } catch {
      /* ngrok not ready */
    }
    await new Promise((res) => setTimeout(res, delayMs));
  }
  console.error(
    "Could not reach ngrok local API at http://127.0.0.1:4040 (is `ngrok http 4000` running?)",
  );
  process.exit(1);
}

main();
