import DOMPurify from "dompurify";
import { marked } from "marked";
import { Check, ChevronDown, ChevronRight, Clipboard, ExternalLink, Menu, Moon, Search, Sun, X } from "lucide";
import "./styles.css";

const pages = [
  { group: "Primeros pasos", slug: "getting-started", label: "Empezar" },
  { group: "Primeros pasos", slug: "onboarding", label: "Conectar WhatsApp" },
  { group: "Primeros pasos", slug: "channels", label: "Canales" },
  { group: "Canales", slug: "google-business-profile", label: "Google Reviews" },
  { group: "API", slug: "api-reference", label: "Referencia completa" },
  { group: "Eventos", slug: "webhooks", label: "Webhooks" },
  { group: "Integraciones", slug: "n8n", label: "n8n" },
  { group: "Integraciones", slug: "ai-agents", label: "Agentes y MCP" },
  { group: "Integraciones", slug: "agent-skill", label: "Skill para agentes" },
  { group: "Integraciones", slug: "chatwoot", label: "Chatwoot" },
];

const app = document.querySelector("#app");
const savedTheme = localStorage.getItem("easyhook-docs-theme");
const state = {
  page: currentSlug(),
  theme: savedTheme === "dark" || savedTheme === "light" ? savedTheme : "light",
  mobileOpen: false,
};
document.documentElement.dataset.theme = state.theme;

marked.use({
  gfm: true,
  renderer: {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens);
      const plain = tokens.map((token) => token.raw || token.text || "").join("");
      const id = slugify(plain);
      return `<h${depth} id="${id}">${text}<a class="heading-link" href="#${id}" aria-label="Enlace a esta sección">#</a></h${depth}>`;
    },
  },
});

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
      <button class="icon-button" data-menu aria-label="Abrir navegación">${iconSvg(Menu)}</button>
      <div class="mobile-brand"><img src="/easyhook-icon.png" alt="" /><strong>Easyhook Docs</strong></div>
      <button class="icon-button" data-theme-toggle aria-label="Cambiar tema">${iconSvg(state.theme === "dark" ? Sun : Moon)}</button>
    </header>
    <aside class="sidebar ${state.mobileOpen ? "open" : ""}">
      <div class="brand"><img src="/easyhook-icon.png" alt="" /><strong>Easyhook <span>Docs</span></strong></div>
      <button class="search-button" data-search>${iconSvg(Search)}<span>Buscar...</span><kbd>⌘ K</kbd></button>
      <nav>${groups.map((group) => `<section><h2>${group}</h2>${pages.filter((page) => page.group === group).map((page) => `<a href="/${page.slug}" data-page="${page.slug}" class="${state.page === page.slug ? "active" : ""}">${page.label}</a>`).join("")}</section>`).join("")}</nav>
      <footer><a href="https://easyhook.dev/portal" target="_blank">Portal ${iconSvg(ExternalLink, 15)}</a><a href="mailto:soporte@easyhook.dev">Soporte</a></footer>
    </aside>
    <div class="scrim ${state.mobileOpen ? "visible" : ""}" data-close></div>
    <main class="content-shell">
      <div class="topbar"><button class="search-button compact" data-search>${iconSvg(Search)}<span>Buscar documentación</span><kbd>⌘ K</kbd></button><button class="icon-button" data-theme-toggle aria-label="Cambiar tema">${iconSvg(state.theme === "dark" ? Sun : Moon)}</button></div>
      <div class="reader"><article id="doc"><div class="loading">Cargando documentación...</div></article><aside id="toc"></aside></div>
    </main>
    <dialog id="search-dialog"><div class="search-dialog-head">${iconSvg(Search)}<input autofocus placeholder="Buscar en la documentación" /><button class="icon-button" data-search-close>${iconSvg(X)}</button></div><div class="search-results"></div></dialog>`;
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
    const response = await fetch(`/content/${state.page}.md`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const markdown = await response.text();
    article.innerHTML = `<div class="page-actions"><button data-copy-page>${iconSvg(Clipboard)}<span>Copiar página</span></button></div>${DOMPurify.sanitize(marked.parse(markdown), { ADD_ATTR: ["target"] })}`;
    article.querySelectorAll("pre").forEach(addCopyButton);
    article.querySelector("[data-copy-page]")?.addEventListener("click", (event) => copyText(markdown, event.currentTarget));
    buildToc(article);
    document.title = `${pages.find((page) => page.slug === state.page)?.label || "Docs"} | Easyhook Docs`;
  } catch (error) {
    article.innerHTML = `<div class="error"><h1>No se pudo cargar esta página</h1><p>${error.message}</p></div>`;
  }
}

function addCopyButton(block) {
  const button = document.createElement("button");
  button.className = "copy-code";
  button.innerHTML = iconSvg(Clipboard, 16);
  button.setAttribute("aria-label", "Copiar código");
  button.addEventListener("click", () => copyText(block.innerText, button));
  block.append(button);
}

async function copyText(value, button) {
  await navigator.clipboard.writeText(value);
  const original = button.innerHTML;
  button.innerHTML = `${iconSvg(Check, 16)}${button.matches(".page-actions button") ? "<span>Copiado</span>" : ""}`;
  setTimeout(() => { button.innerHTML = original; }, 1400);
}

function buildToc(article) {
  const headings = [...article.querySelectorAll("h2")].slice(0, 14);
  document.querySelector("#toc").innerHTML = headings.length ? `<p>En esta página</p>${headings.map((heading) => `<a href="#${heading.id}">${heading.textContent.replace("#", "")}</a>`).join("")}` : "";
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
  const documents = await Promise.all(pages.map(async (page) => ({ ...page, text: await fetch(`/content/${page.slug}.md`).then((response) => response.text()) })));
  const matches = documents.filter((document) => !normalized || `${document.label} ${document.text}`.toLowerCase().includes(normalized)).slice(0, 12);
  target.innerHTML = matches.map((match) => `<button data-result="${match.slug}"><strong>${match.label}</strong><span>${match.group}</span>${iconSvg(ChevronRight, 16)}</button>`).join("") || `<p class="empty-search">Sin resultados</p>`;
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
