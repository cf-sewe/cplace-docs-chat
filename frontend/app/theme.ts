// theme.ts
import { extendTheme } from "@chakra-ui/react";

const theme = extendTheme({
  colors: {
    primary: {
      blue: "#00207A",
      sky: "#0058D4",
      mint: "#0CE796",
      mintLight: "#7FFAC9",
      white: "#FFFFFF",
    },
    secondary: {
      magenta: "#FF3393",
      lilac: "#A84AF0",
      orange: "#FA6D64",
      sunny: "#FF9900",
      magentaLight: "#FF5EA1",
      lilacLight: "#BB68FE",
      orangeLight: "#FF7F6B",
      sunnyLight: "#FFAF38",
    },
  },
  fonts: {
    heading: `'Inter', 'QuickSand', sans-serif`,
    body: `'Inter', 'QuickSand', sans-serif`,
  },
  styles: {
    global: {
      // Global styles
      body: {
        bg: "primary.white",
        color: "secondary.midnight",
      },
      a: {
        color: "#2d7bd4",
        _hover: {
          borderBottom: "1px solid",
        },
      },
      h1: {
        color: "#211f6b",
      },
      h2: {
        color: "#211f6b",
      },
      h3: {
        color: "#211f6b",
      },
      p: {
        margin: "8px 0",
      },
      code: {
        color: "#ffa500",
      },
      li: {
        padding: "4px",
      },
    },
  },
});

export default theme;
