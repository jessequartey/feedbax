import js from "@eslint/js";
import { plugin as shadcn } from "@shadcn/lint";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.source/**",
      "**/.wrangler/**",
      "**/.output/**",
      "**/routeTree.gen.ts",
      "**/coverage/**",
      "packages/create-feedbax/template/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { shadcn },
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["**/*.{jsx,tsx}"],
    rules: {
      "shadcn/no-raw-colors": "error",
      // Cloudflare's script discovers these challenge containers by class name.
      "shadcn/no-unknown-classes": ["error", { allow: ["cf-turnstile"] }],
      "shadcn/require-static-classes": "error",
    },
  },
  {
    // Shared primitives own their class forwarding; application usage is checked.
    files: ["packages/ui/src/components/**", "src/components/ui/**"],
    rules: { "shadcn/require-static-classes": "off" },
  },
  {
    // The upstream Sonner wrapper keeps this marker for toast customization.
    files: ["**/components/sonner.tsx"],
    rules: {
      "shadcn/no-unknown-classes": ["error", { allow: ["toaster"] }],
    },
  },
);
