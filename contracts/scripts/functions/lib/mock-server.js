"use strict";
// Tiny local HTTP server used to simulate the operator's data sources (node `http` only).
// Routes are keyed by pathname (query string ignored): `{ "/price-a.test/VERRA_VCS": { status: 200, json: {...} } }`.
// Unknown paths answer 404 `{"error":"not found"}`. Every request is recorded in `hits` ({ path, headers }).

const http = require("node:http");

/**
 * @param {Record<string, {status?: number, json?: unknown, body?: string}>} routes mutable: tests may change it between runs
 * @returns {Promise<{port:number, baseUrl:string, routes:object, hits:Array<{path:string, headers:object}>, close:()=>Promise<void>}>}
 */
async function startMockServer(routes = {}) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const { pathname } = new URL(req.url, "http://127.0.0.1");
    hits.push({ path: pathname, headers: req.headers });
    const route = routes[pathname];
    if (!route) {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }
    const body = route.body ?? JSON.stringify(route.json ?? {});
    res.writeHead(route.status ?? 200, { "content-type": "application/json" });
    res.end(body);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    routes,
    hits,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

module.exports = { startMockServer };
