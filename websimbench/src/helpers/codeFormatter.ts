import prettier from 'prettier/standalone';
import parserBabel from 'prettier/plugins/babel';
import parserEstree from 'prettier/plugins/estree';
import parserGraphql from 'prettier/plugins/graphql';

export const formatCode = async (code: string, parser: 'babel' | 'graphql' = 'babel') => {
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
};

