import { buildApp } from "./app.js";

const app = await buildApp();
await app.listen({ host: "0.0.0.0", port: app.appContext.config.port });

const shutdown = async () => {
  await app.close();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
