import Mux from "@mux/mux-node";
import { env } from "../config/env.js";

let mux: Mux | null = null;

export function getMux(): Mux {
  if (!mux) {
    const e = env();
    mux = new Mux({
      tokenId: e.MUX_ACCESS_TOKEN_ID,
      tokenSecret: e.MUX_ACCESS_TOKEN_SECRET,
      /** Webhooks page secret; using Signing Keys secret here causes all webhook deliveries to fail verification. */
      webhookSecret: e.MUX_WEBHOOK_SECRET ?? e.MUX_SIGNING_KEY_SECRET,
    });
  }
  return mux;
}
