import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Reject Tailwind size utilities keyed by our custom spacing-token names
 * (2xs / xs / sm / md / lg / xl / 2xl / 3xl). These keys are defined in
 * globals.css as `--spacing-*`, which Tailwind v4 also routes through the
 * size utility scale (`max-w-*`, `w-*`, `h-*`, `min-w-*`, `min-h-*`,
 * `size-*`). The result is that `max-w-sm` silently resolves to 12px
 * instead of the expected 24rem. Issue #34 tracks a long-term rename;
 * until then use an arbitrary value (e.g. `max-w-[384px]`).
 *
 * Padding / margin / gap utilities (`p-sm`, `mt-lg`, `gap-md`, …) are the
 * intended consumer of these tokens and are not matched here.
 */
const BAD_SIZE_UTIL_RE = String.raw`(?<![\w-])(?:max-w|min-w|min-h|size|[wh])-(?:2xs|xs|sm|md|lg|xl|2xl|3xl)(?![\w-])`;
const BAD_SIZE_UTIL_MSG =
  "Tailwind size utilities with custom spacing-token keys (max-w-sm / w-md / h-lg / min-w-xl / size-2xl …) resolve to pixel values from globals.css, not Tailwind's default scale. Use an arbitrary value instead — e.g. `max-w-[384px]`. See the comment on the --spacing-* block in globals.css and issue #34.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: `Literal[value=/${BAD_SIZE_UTIL_RE}/]`,
          message: BAD_SIZE_UTIL_MSG,
        },
        {
          selector: `TemplateElement[value.raw=/${BAD_SIZE_UTIL_RE}/]`,
          message: BAD_SIZE_UTIL_MSG,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
