import fs from "node:fs";
import path from "node:path";

const contentRoot = path.resolve("public/content");
const pages = fs.readdirSync(contentRoot).filter((name) => name.endsWith(".md")).sort();
const spanishSources = new Set([
  "agent-skill.md", "channels.md", "chatwoot.md", "getting-started.md",
  "inbox-mobile.md", "live-chat.md", "onboarding.md", "supabase-auth.md",
]);
const failures = [];

function localizedPath(language, page) {
  const sourceLanguage = spanishSources.has(page) ? "es" : "en";
  return language === sourceLanguage
    ? path.join(contentRoot, page)
    : path.join(contentRoot, language, page);
}

function inlineCode(markdown) {
  return [...markdown.replace(/```[^\n]*\n[\s\S]*?```/g, "").matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);
}

function technicalTokens(markdown) {
  const tokens = [];
  const patterns = [
    /https?:\/\/[^\s"'`<>]+/g,
    /\$[A-Z][A-Z0-9_]*/g,
    /\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^\s`"']+/g,
    /"([a-z][a-z0-9_.-]*)"\s*:/g,
    /"((?:[a-z][a-z0-9_.-]*)(?:\/[a-z0-9_.*:{}-]+)?)"/g,
  ];
  for (const pattern of patterns) {
    for (const match of markdown.matchAll(pattern)) tokens.push(match[1] ?? match[0]);
  }
  return tokens.sort();
}

function links(markdown) {
  return [...markdown.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);
}

function sameList(a, b) {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

for (const page of pages) {
  const canonical = fs.readFileSync(path.join(contentRoot, page), "utf8");
  for (const language of ["es", "en", "pt-BR"]) {
    const target = localizedPath(language, page);
    if (!fs.existsSync(target)) {
      failures.push(`${language}/${page}: missing page`);
      continue;
    }
    const localized = fs.readFileSync(target, "utf8");
    if (!sameList(technicalTokens(canonical), technicalTokens(localized))) failures.push(`${language}/${page}: technical identifiers changed`);
    if (!sameList(inlineCode(canonical), inlineCode(localized))) failures.push(`${language}/${page}: inline identifiers changed`);
    if (!sameList(links(canonical), links(localized))) failures.push(`${language}/${page}: link destinations changed`);
  }
}

if (failures.length) {
  console.error(`Localization integrity failed (${failures.length}):`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Localization integrity passed: ${pages.length} pages × 3 languages; code, identifiers, and links preserved.`);
