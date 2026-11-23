import { build } from "esbuild";
import {
  mkdir,
  readFile,
  readdir,
  writeFile,
  copyFile,
} from "node:fs/promises";
import path from "node:path";
const assets = {};
async function collect(dir, relative = "") {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = path.join(dir, entry.name),
      rel = relative + "/" + entry.name;
    if (entry.isDirectory()) {
      if (entry.name !== "server" && entry.name !== ".openai")
        await collect(name, rel);
    } else
      assets[rel] = {
        type: entry.name.endsWith(".html")
          ? "text/html; charset=utf-8"
          : entry.name.endsWith(".css")
            ? "text/css; charset=utf-8"
            : "text/javascript; charset=utf-8",
        data: (await readFile(name)).toString("base64"),
      };
  }
}
await collect("dist");
await mkdir(".runtime", { recursive: true });
await writeFile(
  ".runtime/hosted-assets.js",
  "export const assets=" + JSON.stringify(assets) + ";\n",
);
await mkdir("dist/server", { recursive: true });
await mkdir("dist/.openai", { recursive: true });
await build({
  entryPoints: ["hosted/worker/index.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  minify: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
});
await copyFile(".openai/hosting.json", "dist/.openai/hosting.json");
console.log(
  `Built Sites Worker with ${Object.keys(assets).length} embedded frontend assets`,
);
