// Same rule as the widget loader (apps/widget/src/color.ts), so the preview's label color
// matches the real button. Kept in sync by the shared test cases in color.test.ts.

function channel(hex: string, start: number): number {
  const c = parseInt(hex.slice(start, start + 2), 16) / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Black or white, whichever contrasts more with `#rrggbb`. */
export function readableTextColor(background: string): "#000000" | "#ffffff" {
  const l = 0.2126 * channel(background, 1) + 0.7152 * channel(background, 3) + 0.0722 * channel(background, 5);
  return (l + 0.05) / 0.05 >= 1.05 / (l + 0.05) ? "#000000" : "#ffffff";
}
