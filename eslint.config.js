import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "*.cjs",
      "coverage/**",
      "dist/**",
      "docs/**",
      "extensions/**",
      "node_modules/**",
      "vendor/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      "no-console": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ]
    }
  },
  {
    files: ["**/*.ts"],
    languageOptions: {}
  }
);
