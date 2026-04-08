import http from "node:http";
import next from "next";
import { initializeApplication } from "@/server/bootstrap";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

async function start() {
  await initializeApplication();
  await app.prepare();

  const server = http.createServer((req, res) => handle(req, res));
  server.listen(port, hostname, () => {
    console.log(`Bitflow listening on http://${hostname}:${port}`);
  });
}

start().catch((error) => {
  console.error("Failed to start Bitflow", error);
  process.exit(1);
});
