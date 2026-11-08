// Next.js flat config (core web vitals + TypeScript) plus jsx-a11y's
// stricter recommended rules and the repo-wide conventions.
import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "error",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
      "jsx-a11y/no-autofocus": "error",
      "jsx-a11y/label-has-associated-control": "off",
      "jsx-a11y/anchor-is-valid": "error",
      "jsx-a11y/no-noninteractive-tabindex": ["error", { roles: ["tabpanel"], tags: ["svg"] }],
    },
  },
  globalIgnores([".next/**", "dist/**", "out/**", "build/**", "next-env.d.ts", "coverage/**"]),
]);
