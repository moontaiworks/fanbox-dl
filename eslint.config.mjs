// @ts-check
import eslint from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import { flatConfigs as eslintPluginImportX } from "eslint-plugin-import-x";
import perfectionist from "eslint-plugin-perfectionist";
import { defineConfig } from "eslint/config";
import { configs as tsConfigs } from "typescript-eslint";

export default [
  {
    ignores: ["node_modules", "dist", "build", "docs", "coverage", "examples"],
  },
  eslint.configs.recommended,
  eslintPluginImportX.recommended,
  eslintPluginImportX.typescript,
  perfectionist.configs["recommended-natural"],
  {
    rules: {
      "perfectionist/sort-imports": [
        "error",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
            ["object", "unknown"],
          ],
          internalPattern: [/^(~\/|#)/.source],
        },
      ],
    },
  },
  ...defineConfig({
    extends: [
      ...tsConfigs.strictTypeChecked,
      ...tsConfigs.stylisticTypeChecked,
    ],
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: [
          "./src/tsconfig.json",
          "./tests/tsconfig.check.json",
          "./tsconfig.check.json",
        ],
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { disallowTypeAnnotations: false },
      ],
      "@typescript-eslint/no-import-type-side-effects": "error",
      "@typescript-eslint/no-invalid-void-type": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/restrict-template-expressions": [
        "error",
        { allowNumber: true },
      ],
    },
    settings: {
      "import/resolver": {
        node: {
          tryExtensions: [".ts", ".d.ts", "/index.ts", "/index.d.ts"],
        },
      },
    },
  }),
];
