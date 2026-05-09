// Thin wrapper around lucide for inline use.
// Lucide v0.544 stores icons in PascalCase as arrays of [tag, attrs] tuples.
const L = (window.lucide && window.lucide.icons) ? window.lucide.icons : {};

function toPascal(name) {
  return name
    .split("-")
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
}

const ICON_ALIASES = {
  // explicit map for kebab names whose PascalCase doesn't match exactly
};

function resolveIcon(name) {
  if (!name) return null;
  const pascal = ICON_ALIASES[name] || toPascal(name);
  if (L[pascal]) return L[pascal];
  if (L[name]) return L[name];
  return null;
}

function attrsToString(attrs) {
  return Object.keys(attrs)
    .map((k) => `${k}="${String(attrs[k]).replace(/"/g, "&quot;")}"`)
    .join(" ");
}

function buildSvg(children, { size, strokeWidth, className }) {
  const inner = (children || [])
    .map(([tag, attrs]) => `<${tag} ${attrsToString(attrs || {})}/>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${className || ""}">${inner}</svg>`;
}

function Icon({ name, size = 16, strokeWidth = 1.75, className = "", ...rest }) {
  const node = resolveIcon(name);
  if (!node) {
    return <span style={{ width: size, height: size, display: "inline-block" }} />;
  }
  const html = buildSvg(node, { size, strokeWidth, className });
  return (
    <span
      dangerouslySetInnerHTML={{ __html: html }}
      {...rest}
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 0 }}
    />
  );
}

window.Icon = Icon;
