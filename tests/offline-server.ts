import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

// A dedicated origin lets offline tests stop the real network server. WebKit's
// setOffline emulation rejects SW responses: microsoft/playwright#42775.
export async function startOfflineServer() {
  const root = resolve("dist");
  const types: Record<string, string> = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".json": "application/json",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
  };
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
      const relative = decodeURIComponent(
        pathname.replace(/^\/gym-tracker\//, ""),
      );
      const path = resolve(root, relative || "index.html");
      if (!path.startsWith(root + sep)) {
        res.writeHead(404).end();
        return;
      }
      const data = await readFile(path);
      res
        .writeHead(200, {
          "Content-Type": types[extname(path)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
        })
        .end(data);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test origin");
  return {
    url: `http://127.0.0.1:${address.port}/gym-tracker/`,
    stop: async () => {
      if (!server.listening) return;
      const closed = new Promise<void>((done, fail) =>
        server.close((err) => (err ? fail(err) : done())),
      );
      server.closeAllConnections();
      await closed;
    },
  };
}
