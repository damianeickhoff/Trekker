/**
 * Two columns that read downwards: the first half down the left, the rest
 * down the right, so E01 to E04 sit over each other and E05 starts the second
 * column. An odd one out goes on the left, which is where the eye starts. On
 * phones the two stack, and the order is the plain one.
 */
export function fillDown<T>(items: T[]): [T[], T[]] {
  const split = Math.ceil(items.length / 2);
  return [items.slice(0, split), items.slice(split)];
}
