/**
 * slugify
 *
 * Turns a human puzzle name into a filesystem/URL-safe id.
 * The editor autosaves to public/puzzles/<id>.json, so the id must match
 * the dev endpoint's whitelist (/^[a-zA-Z0-9_-]+$/). Lowercases, replaces
 * runs of non-alphanumerics with a single hyphen, and trims stray hyphens.
 *
 * @param {string} name
 * @returns {string} slug (may be '' for an empty/symbol-only name)
 */
export default function slugify(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
