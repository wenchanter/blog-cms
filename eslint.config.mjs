import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".open-next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "cloudflare-env.d.ts",
    // Vendored Tiptap UI components, installed by `@tiptap/cli`. Third-party
    // source we do not maintain — linting it only produces noise that cannot
    // be fixed without diverging from upstream.
    "components/tiptap-**",
    "hooks/**",
    "lib/tiptap-utils.ts",
    "scss.d.ts",
  ]),
]);

export default eslintConfig;
