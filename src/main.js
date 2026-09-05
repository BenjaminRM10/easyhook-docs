import DOMPurify from "dompurify";
import { marked } from "marked";
import { Check, ChevronDown, ChevronRight, Clipboard, ExternalLink, Menu, Moon, Search, Sun, X } from "lucide";
import "./styles.css";

const pages = [
  { group: "start", slug: "getting-started", label: ["Empezar", "Getting started", "Começar"] },
  { group: "start", slug: "onboarding", label: ["Conectar WhatsApp", "Connect WhatsApp", "Conectar WhatsApp"] },
  { group: "start", slug: "channels", label: ["Canales", "Channels", "Canais"] },
  { group: "product", slug: "inbox-mobile", label: ["Inbox y app móvil", "Inbox and mobile app", "Inbox e aplicativo móvel"] },
  { group: "product", slug: "live-chat", label: ["Live Chat", "Live Chat", "Live Chat"] },
  { group: "api", slug: "api-reference", label: ["Referencia completa", "Complete reference", "Referência completa"] },
  { group: "api", slug: "telecom", label: ["Telefonía", "Telephony", "Telefonia"] },
  { group: "events", slug: "webhooks", label: ["Webhooks", "Webhooks", "Webhooks"] },
  { group: "integrations", slug: "n8n", label: ["n8n", "n8n", "n8n"] },
  { group: "integrations", slug: "ai-agents", label: ["Agentes y MCP", "Agents and MCP", "Agentes e MCP"] },
  { group: "integrations", slug: "agent-skill", label: ["Skill para agentes", "Agent skill", "Skill para agentes"] },
  { group: "integrations", slug: "chatwoot", label: ["Chatwoot", "Chatwoot", "Chatwoot"] },
  { group: "integrations", slug: "supabase-auth", label: ["Supabase Auth", "Supabase Auth", "Supabase Auth"] },
];

const languageIndex = { es: 0, en: 1, "pt-BR": 2 };
const copy = {
  groups: { start: ["Primeros pasos", "Getting started", "Primeiros passos"], product: ["Producto", "Product", "Produto"], api: ["API", "API", "API"], events: ["Eventos", "Events", "Eventos"], integrations: ["Integraciones", "Integrations", "Integrações"] },
  openNavigation: ["Abrir navegación", "Open navigation", "Abrir navegação"],
  changeTheme: ["Cambiar tema", "Change theme", "Alterar tema"],
  search: ["Buscar...", "Search...", "Buscar..."],
  searchDocs: ["Buscar documentación", "Search documentation", "Buscar na documentação"],
  searchPlaceholder: ["Buscar en la documentación", "Search the documentation", "Buscar na documentação"],
  support: ["Soporte", "Support", "Suporte"],
  loading: ["Cargando documentación...", "Loading documentation...", "Carregando documentação..."] ,
  copyPage: ["Copiar página", "Copy page", "Copiar página"],
  copied: ["Copiado", "Copied", "Copiado"],
  copyCode: ["Copiar código", "Copy code", "Copiar código"],
  onThisPage: ["En esta página", "On this page", "Nesta página"],
  loadError: ["No se pudo cargar esta página", "This page could not be loaded", "Não foi possível carregar esta página"],
  noResults: ["Sin resultados", "No results", "Nenhum resultado"],
};

function text(value) { return value[languageIndex[state.language]]; }
function pageLabel(page) { return text(page.label); }

const app = document.querySelector("#app");
const savedTheme = localStorage.getItem("easyhook-docs-theme");
const state = {
  page: currentSlug(),
  theme: savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light",
  language: storedLanguage(),
  mobileOpen: false,
};
document.documentElement.dataset.theme = state.theme;
document.documentElement.lang = state.language === "pt-BR" ? "pt-BR" : state.language === "en" ? "en" : "es-MX";

marked.use({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = tokens.map((token) => token.raw || token.text || "").join("");
      const id = slugify(plain);
      return `<h${depth} id="${id}">${text}<a class="heading-link" href="#${id}" aria-label="${state.language === "en" ? "Link to this section" : state.language === "pt-BR" ? "Link para esta seção" : "Enlace a esta sección"}">#</a></h${depth}>`;
    },
  },
});

function storedLanguage() {
  const stored = localStorage.getItem("easyhook.language");
  if (stored === "es" || stored === "en" || stored === "pt-BR") return stored;
  const browser = navigator.language.toLowerCase();
  if (browser.startsWith("pt")) return "pt-BR";
  return browser.startsWith("en") ? "en" : "es";
}

function currentSlug() {
  const slug = location.pathname.replace(/^\/+|\/+$/g, "");
  return pages.some((page) => page.slug === slug) ? slug : "getting-started";
}

function slugify(value) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function iconSvg(icon, size = 18) {
  const [tag, attrs, children] = icon;
  const render = ([childTag, childAttrs]) => `<${childTag} ${Object.entries(childAttrs).map(([key, value]) => `${key}="${value}"`).join(" ")}></${childTag}>`;
  return `<${tag} ${Object.entries({ ...attrs, width: size, height: size }).map(([key, value]) => `${key}="${value}"`).join(" ")}>${children.map(render).join("")}</${tag}>`;
}

function shell() {
  const groups = [...new Set(pages.map((page) => page.group))];
  app.innerHTML = `
    <header class="mobile-header">
      <button class="icon-button" data-menu aria-label="${text(copy.openNavigation)}">${iconSvg(Menu)}</button>
      <div class="mobile-brand"><img src="/easyhook-icon.png" alt="" /><strong>Easyhook Docs</strong></div>
      <button class="icon-button" data-theme-toggle aria-label="${text(copy.changeTheme)}">${iconSvg(state.theme === "dark" ? Sun : Moon)}</button>
    </header>
    <aside class="sidebar ${state.mobileOpen ? "open" : ""}">
      <div class="brand"><img src="/easyhook-icon.png" alt="" /><strong>Easyhook <span>Docs</span></strong></div>
      <button class="search-button" data-search>${iconSvg(Search)}<span>${text(copy.search)}</span><kbd>⌘ K</kbd></button>
      <nav>${groups.map((group) => `<section><h2>${text(copy.groups[group])}</h2>${pages.filter((page) => page.group === group).map((page) => `<a href="/${page.slug}" data-page="${page.slug}" class="${state.page === page.slug ? "active" : ""}">${pageLabel(page)}</a>`).join("")}</section>`).join("")}</nav>
      <footer><div class="language-switcher" aria-label="Language">${["es", "en", "pt-BR"].map((language) => `<button type="button" data-language="${language}" class="${state.language === language ? "active" : ""}">${language === "pt-BR" ? "PT" : language.toUpperCase()}</button>`).join("")}</div><a href="https://easyhook.dev/portal" target="_blank">Portal ${iconSvg(ExternalLink, 15)}</a><a href="mailto:soporte@easyhook.dev">${text(copy.support)}</a></footer>
    </aside>
    <div class="scrim ${state.mobileOpen ? "visible" : ""}" data-close></div>
    <main class="content-shell">
      <div class="topbar"><div class="language-switcher" aria-label="Language">${["es", "en", "pt-BR"].map((language) => `<button type="button" data-language="${language}" class="${state.language === language ? "active" : ""}">${language === "pt-BR" ? "PT" : language.toUpperCase()}</button>`).join("")}</div><button class="search-button compact" data-search>${iconSvg(Search)}<span>${text(copy.searchDocs)}</span><kbd>⌘ K</kbd></button><button class="icon-button" data-theme-toggle aria-label="${text(copy.changeTheme)}">${iconSvg(state.theme === "dark" ? Sun : Moon)}</button></div>
      <div class="reader"><article id="doc"><div class="loading">${text(copy.loading)}</div></article><aside id="toc"></aside></div>
    </main>
    <dialog id="search-dialog"><div class="search-dialog-head">${iconSvg(Search)}<input autofocus placeholder="${text(copy.searchPlaceholder)}" /><button class="icon-button" data-search-close>${iconSvg(X)}</button></div><div class="search-results"></div></dialog>`;
  bindShell();
}

function bindShell() {
  document.querySelectorAll("[data-page]").forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    navigate(link.dataset.page);
  }));
  document.querySelector("[data-menu]")?.addEventListener("click", () => setMobileMenu(true));
  document.querySelector("[data-close]")?.addEventListener("click", () => setMobileMenu(false));
  document.querySelectorAll("button[data-theme-toggle]").forEach((button) => button.addEventListener("click", toggleTheme));
  document.querySelectorAll("[data-search]").forEach((button) => button.addEventListener("click", openSearch));
  document.querySelector("[data-search-close]")?.addEventListener("click", () => document.querySelector("#search-dialog").close());
  document.querySelector("#search-dialog input")?.addEventListener("input", (event) => runSearch(event.target.value));
  document.querySelectorAll("[data-language]").forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.language)));
}

function setLanguage(language) {
  if (!(language in languageIndex) || state.language === language) return;
  state.language = language;
  localStorage.setItem("easyhook.language", language);
  document.documentElement.lang = language === "pt-BR" ? "pt-BR" : language === "en" ? "en" : "es-MX";
  shell();
  loadPage();
}

function navigate(slug) {
  if (!pages.some((page) => page.slug === slug)) return;
  state.page = slug;
  setMobileMenu(false);
  history.pushState({}, "", `/${slug}`);
  updateNavigation();
  loadPage();
  scrollTo({ top: 0 });
}

function setMobileMenu(open) {
  state.mobileOpen = open;
  document.querySelector(".sidebar")?.classList.toggle("open", open);
  document.querySelector(".scrim")?.classList.toggle("visible", open);
}

function updateNavigation() {
  document.querySelectorAll("[data-page]").forEach((link) => {
    link.classList.toggle("active", link.dataset.page === state.page);
  });
}

async function loadPage() {
  const article = document.querySelector("#doc");
  try {
    let response = await fetch(`/content/${state.language}/${state.page}.md`);
    if (!response.ok) response = await fetch(`/content/${state.page}.md`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    article.innerHTML = `<div class="page-actions"><button data-copy-page>${iconSvg(Clipboard)}<span>${text(copy.copyPage)}</span></button></div>${DOMPurify.sanitize(marked.parse(markdown), { ADD_ATTR: ["target"] })}`;
    article.querySelectorAll("pre").forEach(addCopyButton);
    article.querySelector("[data-copy-page]")?.addEventListener("click", (event) => copyText(markdown, event.currentTarget));
    buildToc(article);
    document.title = `${pageLabel(pages.find((page) => page.slug === state.page)) || "Docs"} | Easyhook Docs`;
  } catch (error) {
    article.innerHTML = `<div class="error"><h1>${text(copy.loadError)}</h1><p>${error.message}</p></div>`;
  }
}

function addCopyButton(block) {
  const button = document.createElement("button");
  button.className = "copy-code";
  button.innerHTML = iconSvg(Clipboard, 16);
  button.setAttribute("aria-label", text(copy.copyCode));
  button.addEventListener("click", () => copyText(block.innerText, button));
  block.append(button);
}

async function copyText(value, button) {
  await navigator.clipboard.writeText(value);
  const original = button.innerHTML;
  button.innerHTML = `${iconSvg(Check, 16)}${button.matches(".page-actions button") ? `<span>${text(copy.copied)}</span>` : ""}`;
  setTimeout(() => { button.innerHTML = original; }, 1400);
}

function buildToc(article) {
  const headings = [...article.querySelectorAll("h2")].slice(0, 14);
  document.querySelector("#toc").innerHTML = headings.length ? `<p>${text(copy.onThisPage)}</p>${headings.map((heading) => `<a href="#${heading.id}">${heading.textContent.replace("#", "")}</a>`).join("")}` : "";
}

function toggleTheme() {
  state.theme = state.theme === "dark" ? "light" : "dark";
  localStorage.setItem("easyhook-docs-theme", state.theme);
  document.documentElement.dataset.theme = state.theme;
  document.querySelectorAll("button[data-theme-toggle]").forEach((button) => {
    button.innerHTML = iconSvg(state.theme === "dark" ? Sun : Moon);
  });
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    state.theme === "dark" ? "#0b1020" : "#ffffff",
  );
}

async function openSearch() {
  const dialog = document.querySelector("#search-dialog");
  dialog.showModal();
  dialog.querySelector("input").focus();
  await runSearch("");
}

async function runSearch(query) {
  const target = document.querySelector(".search-results");
  const normalized = query.trim().toLowerCase();
  const documents = await Promise.all(pages.map(async (page) => ({ ...page, text: await fetch(`/content/${state.language}/${page.slug}.md`).then((response) => response.ok ? response.text() : fetch(`/content/${page.slug}.md`).then((fallback) => fallback.text())) })));
  const matches = documents.filter((document) => !normalized || `${pageLabel(document)} ${document.text}`.toLowerCase().includes(normalized)).slice(0, 12);
  target.innerHTML = matches.map((match) => `<button data-result="${match.slug}"><strong>${pageLabel(match)}</strong><span>${text(copy.groups[match.group])}</span>${iconSvg(ChevronRight, 16)}</button>`).join("") || `<p class="empty-search">${text(copy.noResults)}</p>`;
  target.querySelectorAll("[data-result]").forEach((button) => button.addEventListener("click", () => { document.querySelector("#search-dialog").close(); navigate(button.dataset.result); }));
}

window.addEventListener("popstate", () => {
  state.page = currentSlug();
  setMobileMenu(false);
  updateNavigation();
  loadPage();
});
window.addEventListener("keydown", (event) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); openSearch(); } });

shell();
loadPage();
