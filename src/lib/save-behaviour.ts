/**
 * What Save on a title page does. Pure, so the title page's client button and
 * the tests share one rule.
 */

/** A manual list as Save's menu shows it. */
export type SaveList = { id: string; name: string; holds: boolean };

/**
 * With no lists of your own there is nothing to choose between, so Save is a
 * plain watchlist toggle, exactly as before lists existed; with any, it opens
 * a menu of the watchlist and each manual list. No lists given at all (the
 * episode page) is the toggle too.
 */
export function saveBehaviour(lists: SaveList[] | undefined): "toggle" | "menu" {
  return lists && lists.length > 0 ? "menu" : "toggle";
}
