import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const roots = ["app", "components", "lib", "tests", "scripts"];
const extensions = new Set([".js", ".mjs", ".ts", ".tsx"]);
const problems = [];

async function visit(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const fullPath = join(path, entry.name);
    if (entry.isDirectory()) {
      await visit(fullPath);
      continue;
    }
    if (!extensions.has(extname(entry.name))) continue;
    const lines = (await readFile(fullPath, "utf8")).split("\n");
    lines.forEach((line, index) => {
      if (/\s+$/.test(line)) problems.push(`${fullPath}:${index + 1}: trailing whitespace`);
      if (/^(<{7}|={7}|>{7})/.test(line)) problems.push(`${fullPath}:${index + 1}: merge marker`);
    });
  }
}

for (const root of roots) await visit(root);

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log("Lint passed");
