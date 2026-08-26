import { loadEnv } from "./config/env.js";
import { createContainer } from "./container.js";

async function main() {
  const env = loadEnv();
  const container = await createContainer(env);

  await container.app.listen({ port: env.port, host: "0.0.0.0" });
  console.log(
    `[traverior-api] fastify modular monolith listening on :${env.port} (auth=${env.authMode})`,
  );
  console.log(`[traverior-api] providers`, env.providers);
  console.log(`[traverior-api] logs → ${env.logDir}/app.log , ${env.logDir}/error.log`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
