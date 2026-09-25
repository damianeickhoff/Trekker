// Stamps the service worker with a version and writes it where Next serves
// static files. A new version on every build is what makes browsers install
// the new worker and drop the previous build's caches.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const source = readFileSync(path.join(root, "src/sw/sw.js"), "utf8");

const version =
  process.env.SW_VERSION ||
  new Date().toISOString().replace(/[-:TZ]/g, "").replace(/\.\d+$/, "");

if (!source.includes("__SW_VERSION__")) {
  throw new Error("src/sw/sw.js has no __SW_VERSION__ placeholder to stamp.");
}

mkdirSync(path.join(root, "public"), { recursive: true });
writeFileSync(path.join(root, "public/sw.js"), source.replace("__SW_VERSION__", version));
console.log(`service worker ${version}`);
