import { env } from "./config/env.js";
import { createApp } from "./app.js";
import { logger } from "./lib/logger.js";

const e = env();
const app = createApp();

app.listen(e.PORT, () => {
  logger.info({ port: e.PORT }, "VibeFlow API listening");
});
