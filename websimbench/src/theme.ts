import { extendTheme } from '@chakra-ui/react';

const colors = {
  brand: {
    900: '#1f363d', // jet-black
    700: '#40798c', // cerulean
    500: '#70a9a1', // tropical-teal
    300: '#9ec1a3', // muted-teal
    100: '#cfe0c3', // tea-green
  },
  // Mapping to semantic names if needed
  jetBlack: '#1f363d',
  cerulean: '#40798c',
  tropicalTeal: '#70a9a1',
  mutedTeal: '#9ec1a3',
  teaGreen: '#cfe0c3',
};

const theme = extendTheme({
  colors,
  styles: {
    global: {
      body: {
        bg: 'jetBlack',
        color: 'teaGreen',
      },
    },
  },
  components: {
    Button: {
      baseStyle: {
        fontWeight: 'bold',
      },
      variants: {
        solid: {
          bg: 'cerulean',
          color: 'white',
          _hover: {
            bg: 'tropicalTeal',
          },
        },
      },
    },
  },
});

export default theme;

