import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const required = [
  "index.html", "styles.css", "src/game.js", "src/relay-core.js",
  "assets/favicon.svg", "assets/social-preview.svg", "assets/social-preview.png", "README.md", "LICENSE",
];

for (const path of required) {
  const info = await stat(new URL(path, root));
  if (!info.isFile() || info.size === 0) throw new Error(`${path} is missing or empty`);
}

const html = await readFile(new URL("index.html", root), "utf8");
const moduleMatch = html.match(/<script type="module" src="([^"]+)"/u);
if (!moduleMatch) throw new Error("index.html has no module entry point");
await stat(new URL(moduleMatch[1], root));

for (const attribute of ["aria-label", "aria-live", "viewport-fit=cover", "theme-color"]) {
  if (!html.includes(attribute)) throw new Error(`index.html is missing ${attribute}`);
}

if (/(?:src|href)="https?:\/\//u.test(html)) throw new Error("index.html loads a remote runtime asset");

const imports = [...(await readFile(new URL("src/game.js", root), "utf8")).matchAll(/from\s+"(\.\/[^"?]+)"/gu)];
for (const match of imports) await stat(new URL(`src/${match[1].slice(2)}`, root));

const runtime = await readFile(new URL("src/game.js", root), "utf8");
for (const forbidden of ["fetch(", "XMLHttpRequest", "WebSocket(", "eval(", ".innerHTML"]) {
  if (runtime.includes(forbidden)) throw new Error(`Runtime contains forbidden network or injection primitive: ${forbidden}`);
}
for (const requiredControl of ["pointerdown", "keydown", "visibilitychange", "prefers-reduced-motion", "navigator.share"]) {
  if (!runtime.includes(requiredControl)) throw new Error(`Runtime is missing expected control path: ${requiredControl}`);
}

const packageJson = JSON.parse(await readFile(new URL("package.json", root), "utf8"));
if (packageJson.dependencies || packageJson.devDependencies) throw new Error("Runtime or development dependencies were introduced");

const totalBytes = (await Promise.all(required.slice(0, 6).map(async (path) => (await stat(new URL(path, root))).size))).reduce((a, b) => a + b, 0);
if (totalBytes > 500_000) throw new Error(`Core payload is too large: ${totalBytes} bytes`);
console.log(`Project checks passed; core static payload ${totalBytes.toLocaleString("en-US")} bytes.`);
