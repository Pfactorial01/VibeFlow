/**
 * Uploads video files from the repository root to Mux (Direct Uploads API).
 * This does NOT create VibeFlow `Video` rows — those only come from POST /videos/upload-url
 * + webhook. Prefer uploading from the app so metadata stays in sync.
 *
 * Usage from repo root: node --env-file=.env ./node_modules/.bin/tsx scripts/upload-videos-to-mux.ts
 */
import { readdirSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import Mux from "@mux/mux-node";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const tokenId = process.env.MUX_ACCESS_TOKEN_ID;
const tokenSecret = process.env.MUX_ACCESS_TOKEN_SECRET;
const webOriginRaw = process.env.WEB_ORIGIN ?? "http://localhost:5173";
const webOrigin = webOriginRaw.split(",")[0]?.trim() ?? "http://localhost:5173";

if (!tokenId || !tokenSecret) {
  console.error("Missing MUX_ACCESS_TOKEN_ID or MUX_ACCESS_TOKEN_SECRET in environment.");
  process.exit(1);
}

const mux = new Mux({ tokenId, tokenSecret });

const VIDEO_EXT = /\.(mp4|mov|webm|mkv|avi)$/i;

async function main(): Promise<void> {
  const files = readdirSync(root).filter((f) => VIDEO_EXT.test(f));
  if (files.length === 0) {
    console.log("No video files found in project root.");
    return;
  }
  console.log(`Uploading ${files.length} file(s) to Mux from ${root}\n`);

  for (const name of files) {
    const full = join(root, name);
    const buf = readFileSync(full);
    console.log(`→ ${name} (${(buf.length / 1e6).toFixed(2)} MB)`);
    const upload = await mux.video.uploads.create({
      cors_origin: webOrigin,
      new_asset_settings: {
        playback_policy: ["public"],
        passthrough: name.slice(0, 255),
      },
    });
    const res = await fetch(upload.url, {
      method: "PUT",
      body: buf,
      headers: { "Content-Type": "video/mp4" },
    });
    if (!res.ok) {
      console.error(`  PUT failed: ${res.status} ${await res.text()}`);
      continue;
    }
    console.log(`  Direct upload id: ${upload.id}`);
    console.log(`  Processing in Mux; asset will appear in the dashboard shortly.\n`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
