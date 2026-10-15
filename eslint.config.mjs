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
);
