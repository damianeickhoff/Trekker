import { describe, expect, it } from "vitest";
import { GET } from "@/app/icons/[size]/route";

/**
 * The manifest names /icons/192 and /icons/512 for the home screen; both have
 * to answer a PNG of that size, or an install shows a blank tile.
 */
describe("the app icons", () => {
  for (const size of [192, 512]) {
    it(`answers /icons/${size} with a ${size}px PNG`, async () => {
      const res = await GET(new Request(`http://localhost/icons/${size}`), { params: Promise.resolve({ size: String(size) }) });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("image/png");
      const bytes = new Uint8Array(await res.arrayBuffer());
      // The PNG signature, then the IHDR's width and height, big-endian.
      expect([...bytes.slice(1, 4)].map((b) => String.fromCharCode(b)).join("")).toBe("PNG");
      const view = new DataView(bytes.buffer);
      expect(view.getUint32(16)).toBe(size);
      expect(view.getUint32(20)).toBe(size);
    });
  }
});
