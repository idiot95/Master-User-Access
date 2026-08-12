/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  semi: true,
  singleQuote: false,
  trailingComma: "none",
  arrowParens: "avoid",
  bracketSameLine: false,
  jsxSingleQuote: false,
  plugins: ["prettier-plugin-tailwindcss"],
  overrides: [
    { files: "*.json", options: { printWidth: 120 } },
    { files: "packages/tokens/brand.json", options: { printWidth: 200 } }
  ]
};
