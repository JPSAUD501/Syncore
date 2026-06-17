/**
 * Shared motion vocabulary for the Substrate design system.
 *
 * Keep these easings/durations in sync with the CSS tokens declared in
 * `app.css` (--ease-out-expo, --duration-*, ...) so that CSS transitions
 * and Framer Motion animations feel identical across the dashboard.
 */
import type { Transition, Variants } from "motion/react";

/* ------------------------------------------------------------------ */
/*  Easings & durations (mirror of the CSS custom properties)          */
/* ------------------------------------------------------------------ */

export const easings = {
  /** Crisp deceleration — the workhorse for most UI motion. */
  outExpo: [0.16, 1, 0.3, 1] as const,
  /** Soft deceleration — for color/opacity cross-fades. */
  outSoft: [0.22, 0.61, 0.36, 1] as const,
  /** Gentle overshoot — for emphasis moments only. */
  spring: [0.34, 1.4, 0.64, 1] as const
};

export const durations = {
  fast: 0.12,
  base: 0.2,
  slow: 0.35
};

/* ------------------------------------------------------------------ */
/*  Reusable transitions                                               */
/* ------------------------------------------------------------------ */

/** Default transition for cross-fades / color / opacity. */
export const softTransition: Transition = {
  duration: durations.base,
  ease: easings.outSoft
};

/** Default transition for positional motion (slide/fade up). */
export const easeOutTransition: Transition = {
  duration: durations.slow,
  ease: easings.outExpo
};

/* ------------------------------------------------------------------ */
/*  Reusable variants                                                  */
/* ------------------------------------------------------------------ */

/** Fade + subtle upward drift. Used by cards, empty states, list rows. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 6 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.base, ease: easings.outSoft }
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: durations.fast, ease: easings.outSoft }
  }
};

/** Pure opacity fade — for overlays, banners, swap-ins. */
export const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: durations.base, ease: easings.outSoft }
  },
  exit: {
    opacity: 0,
    transition: { duration: durations.fast, ease: easings.outSoft }
  }
};

/** Scale + fade — for popovers, dialogs, floating chips. */
export const scaleFade: Variants = {
  hidden: { opacity: 0, scale: 0.96 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: durations.base, ease: easings.outSoft }
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    transition: { duration: durations.fast, ease: easings.outSoft }
  }
};

/**
 * Stagger container — children using `fadeUp`/`fadeIn` animate in sequence.
 * `staggerChildren` is intentionally small (contido / profissional).
 */
export const staggerContainer = (
  stagger = 0.04,
  delayChildren = 0
): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: stagger, delayChildren }
  }
});

/* ------------------------------------------------------------------ */
/*  Route / page transition                                            */
/* ------------------------------------------------------------------ */

/**
 * Page transition applied to the routed <main> in __root.tsx.
 * Contido: short fade + tiny upward drift, no spring overshoot.
 */
export const pageTransition = {
  initial: { opacity: 0, y: 6 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.slow, ease: easings.outExpo }
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: durations.fast, ease: easings.outSoft }
  }
} as const;

/* ------------------------------------------------------------------ */
/*  Layout helper                                                      */
/* ------------------------------------------------------------------ */

/**
 * Shared `layout` transition for FLIP-style reordering (DataTable rows,
 * toast stack, list reordering). Contained — no spring bounce.
 */
export const layoutTransition: Transition = {
  duration: durations.base,
  ease: easings.outSoft
};
