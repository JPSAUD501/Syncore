import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const rootDirectory = path.resolve(process.argv[2] ?? ".");
const port = Number(process.argv[3] ?? "3210");

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(
    `Syncore static server listening on http://127.0.0.1:${port} serving ${rootDirectory}\n`
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}

async function resolveExistingPath(relativePath: string): Promise<string> {
  const normalizedPath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, "");
  const directPath = path.join(rootDirectory, normalizedPath);
  if (await exists(directPath)) {
    return directPath;
  }

  const htmlPath = path.join(rootDirectory, `${normalizedPath}.html`);
  if (await exists(htmlPath)) {
    return htmlPath;
  }

  const fallback = path.join(rootDirectory, "index.html");
  if (await exists(fallback)) {
    return fallback;
  }

  throw new Error(`Unable to resolve "${relativePath}" from "${rootDirectory}".`);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function contentTypeFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  switch (extension) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".wasm":
      return "application/wasm";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
    const requestedPath = decodeURIComponent(url.pathname);
    const relativePath = requestedPath === "/" ? "index.html" : requestedPath.slice(1);

    const filePath = await resolveExistingPath(relativePath);
    const body = await readFile(filePath);

    response.writeHead(200, {
      "content-type": contentTypeFor(filePath),
      "cache-control": "no-store"
    });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}
