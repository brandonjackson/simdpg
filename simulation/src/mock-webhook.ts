/**
 * A stand-in for an OpenFn webhook, used to measure what the delivery pool can
 * actually push (`npm run sim:bench`).
 *
 * It exists because the number this measures is the *pool's* rate, and pointing
 * a benchmark at a real OpenFn project would measure OpenFn's ingestion instead.
 * It must run somewhere the worker containers can reach — hence the compose
 * service, not a host process.
 *
 *   PORT              listen port (default 3010)
 *   MOCK_LATENCY_MS   artificial delay per request (default 0)
 */

import http from "node:http";
import { log } from "./utils.js";

const port = Number.parseInt(process.env.PORT ?? "3010", 10) || 3010;
const latencyMs = Number.parseInt(process.env.MOCK_LATENCY_MS ?? "0", 10) || 0;

let received = 0;
let lastReport = 0;

const server = http.createServer((req, res) => {
  // Drain the body: an unread request body stalls the socket and would show up
  // as pool slowness rather than as what it is.
  req.resume();
  req.on("end", () => {
    received += 1;
    const respond = (): void => { res.writeHead(204).end(); };
    if (latencyMs > 0) setTimeout(respond, latencyMs);
    else respond();
  });
});

setInterval(() => {
  const delta = received - lastReport;
  lastReport = received;
  if (delta > 0) log(`mock-webhook: ${delta}/sec (${received} total)`);
}, 1000).unref();

server.listen(port, () => log(`mock-webhook listening on ${port} (latency ${latencyMs}ms)`));
