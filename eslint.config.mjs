import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Next's own <Link> prefetches by default, and every route here reads
    // cookies, so each link that scrolls into view costs a server render.
    // The shared wrapper turns that off; this keeps anyone from going round it.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/components/link.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/link",
              message: "Import Link from @/components/link, which does not prefetch by default.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/generated/**", "public/sw.js"]),
]);

export default eslintConfig;
