import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";

const contentDir = resolve("public/content");
const publicDir = resolve("public");
const files = readdirSync(contentDir).filter((file) => file.endsWith(".md"));
const routes = new Set(files.map((file) => `/${file.replace(/\.md$/, "")}`));
const errors = [];

function validateRoute(file, target) {
  const clean = target.split("#")[0].split("?")[0];
  if (!clean) return;

  if (clean.startsWith("https://docs.easyhook.dev/")) {
    const route = new URL(clean).pathname.replace(/\/$/, "");
    if (!routes.has(route)) errors.push(`${file}: unknown docs route ${target}`);
    return;
  }

  if (clean.startsWith("/downloads/") || clean.startsWith("/brand/")) {
    if (!existsSync(join(publicDir, clean))) errors.push(`${file}: missing public asset ${target}`);
    return;
  }

  if (clean.startsWith("/")) {
    if (!routes.has(clean.replace(/\/$/, ""))) errors.push(`${file}: unknown docs route ${target}`);
    return;
  }

  if (clean.startsWith("./") || clean.startsWith("../")) {
    const destination = resolve(dirname(join(contentDir, file)), clean);
    if (!existsSync(destination)) errors.push(`${file}: missing relative target ${target}`);
  }
}

for (const file of files) {
  const source = readFileSync(join(contentDir, file), "utf8");
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].trim().replace(/^<|>$/g, "");
    if (!target || target.startsWith("#") || target.startsWith("mailto:") || target.startsWith("http://") || (target.startsWith("https://") && !target.startsWith("https://docs.easyhook.dev/"))) continue;
    validateRoute(file, target);
  }
}

if (errors.length) {
  console.error("Broken documentation links:\n" + errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log(`Validated links in ${files.length} documentation pages.`);
