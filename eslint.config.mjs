import js from "@eslint/js";
import boundaries from "eslint-plugin-boundaries";
import tseslint from "typescript-eslint";

const typedFiles = ["src/**/*.ts"];
const typedConfigs = [
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked
].map((config) => ({ ...config, files: typedFiles }));

export default [
  {
    ignores: ["dist/**", "node_modules/**", "reports/**", "tmp/**"]
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended.languageOptions,
      globals: {
        AbortController: "readonly",
        Buffer: "readonly",
        console: "readonly",
        crypto: "readonly",
        document: "readonly",
        performance: "readonly",
        process: "readonly",
        ReadableStream: "readonly",
        setTimeout: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        URL: "readonly",
        window: "readonly"
      }
    }
  },
  ...typedConfigs,
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        project: "./tsconfig.build.json",
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: { boundaries },
    settings: {
      "boundaries/elements": [
        { type: "public", pattern: "src/public/**" },
        { type: "internal", pattern: "src/internal/**" }
      ]
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" }
      ],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            {
              from: { element: { types: "public" } },
              allow: { to: { element: { types: { anyOf: ["public", "internal"] } } } }
            },
            {
              from: { element: { types: "internal" } },
              allow: { to: { element: { types: "internal" } } }
            }
          ]
        }
      ]
    }
  },
  {
    files: ["src/internal/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["../public", "../public/*", "../../public", "../../public/*"],
              message: "Internal modules must not import the public layer."
            }
          ]
        }
      ]
    }
  }
];
