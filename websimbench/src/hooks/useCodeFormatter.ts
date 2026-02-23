import prettier from "prettier/standalone";
import parserBabel from "prettier/plugins/babel";
import parserEstree from "prettier/plugins/estree";
import parserGraphql from "prettier/plugins/graphql";
import { useCallback } from "react";

/**
 * Hook to format JavaScript and GraphQL code using Prettier entirely within the browser.
 */
export const useCodeFormatter = () => {
  const formatCode = useCallback(
    async (code: string, parser: "babel" | "graphql" = "babel") => {
      try {
        return await prettier.format(code, {
          parser,
          plugins: [parserBabel, parserEstree, parserGraphql],
          semi: true,
          singleQuote: true,
        });
      } catch (e) {
        return code; // Fallback to unformatted code on error
      }
    },
    [],
  );

  return { formatCode };
};
