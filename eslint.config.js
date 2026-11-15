import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import { defineConfig, globalIgnores } from "eslint/config";

export default defineConfig([
  globalIgnores(["dist", "coverage"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // Leading underscore marks a binding that exists only to be discarded,
      // e.g. omitting a key via rest destructuring: `const { completed: _, ...rest }`.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // Every page loads its data in an effect and sets state from the result,
      // which this rule flags. Rewriting all of them is a data-layer refactor,
      // not a fix; keep it visible as a warning so new code can avoid it.
      "react-hooks/set-state-in-effect": "warn",
      // Fast-refresh hint only (a file exporting a component plus a hook or
      // variants still works, it just reloads fully). Not a correctness issue.
      "react-refresh/only-export-components": "warn",
    },
  },
  {
    // Edge functions run on Deno, not in the browser.
    files: ["supabase/functions/**/*.ts"],
    languageOptions: {
      globals: { ...globals.deno },
    },
  },
]);
