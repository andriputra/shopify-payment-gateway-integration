"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.docsBridgeRoutes = docsBridgeRoutes;
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
const express_1 = require("express");
const marked_1 = require("marked");
const DOC_RELATIVE = node_path_1.default.join("docs", "PUBLIC-BRIDGE-API.md");
function escapeHtml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
function renderDocPage(title, bodyHtml) {
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-light.min.css" crossorigin="anonymous" />
  <style>
    body { margin: 0; background: #f6f8fa; }
    .page-header { background: #24292f; color: #fff; padding: 12px 24px; font-family: system-ui, sans-serif; font-size: 14px; }
    .page-header a { color: #58a6ff; }
    .markdown-body { box-sizing: border-box; min-width: 200px; max-width: 980px; margin: 0 auto; padding: 32px 24px 64px; background: #fff; min-height: calc(100vh - 48px); }
  </style>
</head>
<body>
  <header class="page-header">
    <strong>${escapeHtml(title)}</strong>
    · <a href="/app">App</a>
    · <a href="/">Home</a>
  </header>
  <article class="markdown-body">
${bodyHtml}
  </article>
</body>
</html>`;
}
/**
 * Renders `docs/PUBLIC-BRIDGE-API.md` as HTML (GitHub-style). Mount at `/docs` so `GET /docs/bridge` works.
 * Deploy must include the `docs/` folder next to `process.cwd()` (same layout as the repo).
 */
function docsBridgeRoutes() {
    const router = (0, express_1.Router)();
    router.get("/bridge", async (_req, res) => {
        const docPath = node_path_1.default.join(process.cwd(), DOC_RELATIVE);
        try {
            const md = node_fs_1.default.readFileSync(docPath, "utf8");
            const raw = marked_1.marked.parse(md);
            const bodyHtml = typeof raw === "string" ? raw : await raw;
            const html = renderDocPage("Public bridge API", bodyHtml);
            res.type("html").send(html);
        }
        catch {
            res
                .status(404)
                .type("html")
                .send(`<!doctype html><html lang="en"><head><meta charset="UTF-8"/><title>Docs not found</title></head><body style="font-family:system-ui;padding:2rem;"><p>Documentation file not found.</p><p>Expected <code>${escapeHtml(docPath)}</code> (include the <code>docs/</code> directory when deploying).</p><p><a href="/app">Back to app</a></p></body></html>`);
        }
    });
    return router;
}
