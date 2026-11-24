// Tap targets (§13 Responsive): at least 44 px on phones (< 640 px) and on any device with a touch screen
// (`any-pointer-coarse`, so a touchscreen laptop with a mouse counts too).
// Desktop with a mouse keeps each control's base size. Add the class next to the base size,
// e.g. `h-10 ${TAP_HEIGHT}`: Tailwind emits variants after base utilities, so these win.

/** 44 px tall on phones and touch screens. */
export const TAP_HEIGHT = "max-sm:h-11 any-pointer-coarse:h-11";

/** 44 × 44 px on phones and touch screens (square icon buttons). */
export const TAP_SIZE = "max-sm:size-11 any-pointer-coarse:size-11";

/** At least 44 × 44 px on phones and touch screens, for links whose content is smaller (logo, badge, back link). */
export const TAP_MIN = "max-sm:min-h-11 max-sm:min-w-11 any-pointer-coarse:min-h-11 any-pointer-coarse:min-w-11";
