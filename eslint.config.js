// @ts-check
import { defineConfig } from "eslint/config";
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "apps/desktop/build/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/next-env.d.ts",
      "apps/web/src/components/ui/**",
      "data/**",
      "secrets/**",
    ],
  },
  js.configs.recommended,
  tseslint.configs.strict,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  {
    // Read-only browsing (design D4): adapters may only use the ReadOnlyPage wrapper.
    // Interaction and script-injection calls are banned everywhere in packages/sources
    // except the guard itself, which allows pagination clicks only.
    files: ["packages/sources/src/**/*.ts"],
    ignores: ["packages/sources/src/browser/guard.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.property.name=/^(click|dblclick|fill|type|press|pressSequentially|check|uncheck|setChecked|tap|selectOption|setInputFiles|dispatchEvent|dragTo|focus|evaluate|evaluateHandle|evaluateAll|addInitScript|exposeFunction|route)$/]",
          message:
            "Job Radar is read-only on third-party sites: use the ReadOnlyPage wrapper (goto, html, waitFor, scroll, safeClick for pagination).",
        },
        {
          selector: "CallExpression[callee.property.name=/^\\$\\$?eval$/]",
          message:
            "Job Radar is read-only on third-party sites: parse page.html() with cheerio instead of running scripts.",
        },
      ],
    },
  },
  {
    files: [
      "**/*.test.ts",
      "**/test/**/*.ts",
      "**/tests/**/*.ts",
      "apps/*/scripts/**/*.ts",
      "packages/*/scripts/**/*.ts",
    ],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
  prettier,
);
