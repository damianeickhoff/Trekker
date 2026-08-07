/**
 * Panels that are positioned from a rect measured when they opened have to close
 * when that rect moves — otherwise they hang in the wrong place. Scrolling is
 * the usual cause, so both the notification bell and the user menu listen for it
 * in the capture phase, which is the only way to hear about scrolling on a
 * nested element at all.
 *
 * That is also the trap: *every* scrolling element in the page reaches those
 * listeners, including ones that have nothing to do with the trigger. A poster
 * carousel sliding to its next frame — on its own, on a timer — was closing an
 * open menu on the other side of the screen.
 *
 * A scroll only moves the trigger if it was the page itself, or an element the
 * trigger sits inside. Everything else is somewhere else on the page and can be
 * ignored.
 */
export function scrollMovedAnchor(event: Event, anchor: Element | null) {
  const target = event.target;

  if (
    target === document ||
    target === document.documentElement ||
    target === document.body
  ) {
    return true;
  }

  return Boolean(anchor && target instanceof Node && target.contains(anchor));
}
