import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // Reglas básicas deshabilitadas
      "@typescript-eslint/no-explicit-any": "off",
      "react/no-unescaped-entities": "off",

      // Variables no usadas - deshabilitado completamente
      "@typescript-eslint/no-unused-vars": "off",

      // Imágenes Next.js - permite usar <img> en lugar de <Image />
      "@next/next/no-img-element": "off",

      // React Hooks - permite dependencias opcionales
      "react-hooks/exhaustive-deps": "off"
    }
  }
];

export default eslintConfig;
