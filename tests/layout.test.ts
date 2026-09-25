import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The desktop column sits centred in what the sidebar leaves: the space from
 * the sidebar's right edge to the content equals the space from the content
 * to the window's right edge, below the `wide` breakpoint and past it, with
 * the sidebar out or folded to its rail. Layout is not measurable without a
 * browser, so this reads the custom properties in `globals.css`, evaluates
 * them at a given window width, and places the column the way the layout
 * does: `mx-auto` with `--column-w` as its most.
 */

const root = path.resolve(import.meta.dirname, "..");
const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
const layout = readFileSync(path.join(root, "src/app/(app)/layout.tsx"), "utf8");

/** The `:root` block that carries the column's numbers. */
const block = css.match(/:root \{\n {2}--sidebar-w:[\s\S]*?\n\}/)?.[0] ?? "";
const wideBlock = block.match(/@variant wide \{([\s\S]*?)\}/)?.[1] ?? "";
const collapsedSidebar = css.match(/\[data-sidebar="collapsed"\] \{\s*--sidebar-w:\s*([^;]+);/)?.[1] ?? "";
const breakpoint = css.match(/--breakpoint-wide:\s*([\d.]+)rem/)?.[1];

function declarations(source: string) {
  const out = new Map<string, string>();
  for (const m of source.matchAll(/^\s*(--[\w-]+):\s*([^;]+);/gm)) out.set(m[1], m[2].trim());
  return out;
}

/** Enough of CSS `calc` for these rules: px, rem, vw, the four operators, min and max. */
function evaluate(expr: string, vars: Map<string, string>, vw: number, depth = 0): number {
  if (depth > 20) throw new Error(`circular: ${expr}`);
  const resolved = expr.replace(/var\((--[\w-]+)\)/g, (_, name: string) => {
    const value = vars.get(name);
    if (value === undefined) throw new Error(`no ${name}`);
    return `(${evaluate(value, vars, vw, depth + 1)})`;
  });
  const js = resolved
    .replace(/calc\(/g, "(")
    .replace(/\bmin\(/g, "Math.min(")
    .replace(/\bmax\(/g, "Math.max(")
    .replace(/([\d.]+)rem\b/g, (_, n: string) => String(Number(n) * 16))
    .replace(/([\d.]+)vw\b/g, (_, n: string) => String((Number(n) * vw) / 100))
    .replace(/([\d.]+)px\b/g, "$1");
  if (!/^[\d.\s+\-*/(),Mathminax]*$/.test(js)) throw new Error(`cannot evaluate: ${expr}`);
  return Function(`return (${js});`)() as number;
}

function margins(vw: number, collapsed: boolean) {
  const vars = declarations(block.replace(/@variant wide \{[\s\S]*?\}/, ""));
  if (vw >= Number(breakpoint) * 16) for (const [k, v] of declarations(wideBlock)) vars.set(k, v);
  if (collapsed) vars.set("--sidebar-w", collapsedSidebar);
  const at = (name: string) => evaluate(`var(${name})`, vars, vw);

  const sidebar = at("--sidebar-w");
  const available = vw - sidebar;
  const column = Math.min(at("--column-w"), available);
  const content = at("--content-w");
  const gutter = at("--gutter-desk");
  // `mx-auto` splits what the column leaves; the content starts a gutter in.
  const left = (available - column) / 2 + gutter;
  const right = vw - sidebar - left - content;
  return { left, right, content };
}

describe("the desktop content column", () => {
  it("is placed by the layout from --column-w alone, centred", () => {
    expect(layout).toContain("lg:mx-auto lg:max-w-(--column-w)");
    expect(layout).not.toMatch(/wide:m[lr]-/);
  });

  it.each([
    [1440, "out", 40, 1136],
    [1440, "a rail", 82, 1200],
    [1920, "out", 228, 1240],
    [1920, "a rail", 302, 1240],
    [2560, "out", 228, 1880],
    [2560, "a rail", 302, 1880],
  ])("at %ipx with the sidebar %s, has equal margins either side", (vw, sidebar, margin, width) => {
    const m = margins(vw, sidebar === "a rail");
    expect(m.left).toBeCloseTo(m.right, 6);
    expect(m.left).toBeCloseTo(margin, 6);
    expect(m.content).toBeCloseTo(width, 6);
  });
});
