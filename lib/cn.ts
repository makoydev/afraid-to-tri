/**
 * Joins class names, dropping anything falsy.
 *
 * Deliberately tiny — we have no need for tailwind-merge yet, and it is not
 * worth the bytes against the budget in docs/05 until conflicting classes
 * actually become a problem.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}
