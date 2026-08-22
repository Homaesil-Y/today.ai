import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // 밑줄로 시작하는 인자는 "의도적으로 쓰지 않음"의 관례다. 캐시 키를 회전시키기 위해
      // 값을 쓰지 않고 받기만 하는 `_bucket` 같은 인자가 여기에 해당한다.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  globalIgnores([".next/**", "next-env.d.ts"]),
]);
