import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const htmlPath = path.resolve(import.meta.dirname, "..", "dist", "renderer", "index.html");
const original = await readFile(htmlPath, "utf8");
const rewritten = original
  .replaceAll('src="/assets/', 'src="./assets/')
  .replaceAll('href="/assets/', 'href="./assets/');

if (rewritten !== original) {
  await writeFile(htmlPath, rewritten);
}
