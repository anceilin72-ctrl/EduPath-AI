/**
 * Escape a user-supplied string so it can be used literally inside a RegExp.
 *
 * Search boxes receive things like "c++", "node.js" and "(hons)". Without this,
 * those characters are interpreted as regex syntax and either match the wrong
 * documents or throw an "invalid regular expression" error from Mongo.
 */
export default function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
