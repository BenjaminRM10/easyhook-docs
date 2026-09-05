const spanishSources = new Set([
  "agent-skill", "channels", "chatwoot", "getting-started",
  "inbox-mobile", "live-chat", "onboarding", "supabase-auth",
]);

export function contentPath(language, slug) {
  const sourceLanguage = spanishSources.has(slug) ? "es" : "en";
  return language === sourceLanguage
    ? `/content/${slug}.md`
    : `/content/${language}/${slug}.md`;
}
