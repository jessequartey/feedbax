import js from "@eslint/js";
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
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
      parserOptions: { tsconfigRootDir: import.meta.dirname },
    },
  },
);
