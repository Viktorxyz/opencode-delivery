/**
 * GitHub driver contract.
 *
 * The production driver shells out to the GitHub CLI (`gh`); the test
 * driver is implemented* a concrete driver.
 */

export function parseRepoSlug(slug) {
  const slash = slug.indexOf("/");
  if (slash <= 0 || slash === slug.length - 1) return null;
  return { owner: slug.slice(0, slash), name: slug.slice(slash + 1) };
}
