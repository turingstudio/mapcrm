// Minimal template engine in the spirit of jQuery Templates: ${expr} for HTML-escaped
// interpolation, {{each(i, item) list}}...{{/each}} for loops. Templates live under
// template/ and are fetched by name, cached, then compiled to a render function.
const templateSources = new Map();
const compiledTemplates = new Map();

const TOKEN_PATTERN = /\{\{each\(([^,]+),\s*([^)]+)\)\s+([^}]+)\}\}|\{\{\/each\}\}|\$\{([^}]+)\}/g;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function compile(source) {
  let body = "let __out = [];\n";
  let cursor = 0;
  let match;

  TOKEN_PATTERN.lastIndex = 0;
  while ((match = TOKEN_PATTERN.exec(source))) {
    const text = source.slice(cursor, match.index);
    if (text) body += `__out.push(${JSON.stringify(text)});\n`;

    if (match[0] === "{{/each}}") {
      body += "});\n";
    } else if (match[3] !== undefined) {
      const [, index, item, list] = match;
      body += `(${list}).forEach(function (${item}, ${index}) {\n`;
    } else {
      body += `__out.push(__escapeHtml(${match[4]}));\n`;
    }
    cursor = TOKEN_PATTERN.lastIndex;
  }
  body += `__out.push(${JSON.stringify(source.slice(cursor))});\n`;
  body += "return __out.join('');\n";

  // `with` gives templates direct access to data properties (e.g. `practices`
  // rather than `data.practices`), matching the ergonomics of ${} templates.
  return new Function("__escapeHtml", "data", `with (data) {\n${body}\n}`);
}

async function loadTemplateSource(templateName) {
  if (!templateSources.has(templateName)) {
    // .tmpl, not .html - Tauri's dev server treats any .html request as an SPA
    // navigation and always serves index.html for it, ignoring the real file.
    const response = await fetch(`/template/${templateName}.tmpl`);
    templateSources.set(templateName, await response.text());
  }
  return templateSources.get(templateName);
}

export const RenderUtil = {
  async render(templateName, templateValues) {
    if (!compiledTemplates.has(templateName)) {
      compiledTemplates.set(templateName, compile(await loadTemplateSource(templateName)));
    }
    return compiledTemplates.get(templateName)(escapeHtml, templateValues ?? {});
  },
};
