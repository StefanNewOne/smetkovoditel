import path from "node:path";
import { Font } from "@react-pdf/renderer";

/**
 * Register a Cyrillic-capable font for invoice PDFs (Master Plan §7 — кирилична типографија is
 * mandatory). Manrope (the design font) subset, bundled in assets/fonts. Registered once.
 */
let registered = false;

export function registerFonts() {
  if (registered) return;
  const dir = path.join(process.cwd(), "assets", "fonts");
  Font.register({
    family: "Manrope",
    fonts: [
      { src: path.join(dir, "manrope-cyrillic-400.ttf"), fontWeight: 400 },
      { src: path.join(dir, "manrope-cyrillic-600.ttf"), fontWeight: 600 },
      { src: path.join(dir, "manrope-cyrillic-700.ttf"), fontWeight: 700 },
      { src: path.join(dir, "manrope-cyrillic-800.ttf"), fontWeight: 800 },
    ],
  });
  registered = true;
}
