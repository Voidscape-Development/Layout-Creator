/**
 * Animation model.
 *
 * Every official layout builds its intro the same way: a paused GSAP timeline
 * of `.from()` tweens against semantic classes, replayed by `Start()`. We model
 * that shape directly rather than inventing a new one, so emitted JS reads like
 * the rest of the repo and stays hand-editable.
 */

export type EaseName =
  | 'none'
  | 'power1.out'
  | 'power2.out'
  | 'power3.out'
  | 'power4.out'
  | 'power2.in'
  | 'power2.inOut'
  | 'back.out(1.7)'
  | 'elastic.out(1, 0.5)'
  | 'expo.out'
  | 'circ.out'
  | 'sine.inOut'
  | 'bounce.out';

export const EASES: readonly { value: EaseName; label: string }[] = [
  { value: 'power2.out', label: 'Smooth (default)' },
  { value: 'none', label: 'Linear' },
  { value: 'power1.out', label: 'Gentle' },
  { value: 'power3.out', label: 'Snappy' },
  { value: 'power4.out', label: 'Very snappy' },
  { value: 'power2.in', label: 'Accelerate' },
  { value: 'power2.inOut', label: 'Ease both ends' },
  { value: 'expo.out', label: 'Sharp arrival' },
  { value: 'circ.out', label: 'Circular' },
  { value: 'sine.inOut', label: 'Soft' },
  { value: 'back.out(1.7)', label: 'Overshoot' },
  { value: 'elastic.out(1, 0.5)', label: 'Springy' },
  { value: 'bounce.out', label: 'Bouncy' },
] as const;

export type PresetId =
  | 'fade'
  | 'fade_up'
  | 'fade_down'
  | 'fade_left'
  | 'fade_right'
  | 'scale_in'
  | 'scale_out'
  | 'custom';

export interface PresetDef {
  id: PresetId;
  label: string;
  description: string;
  /** Whether the `distance` control is meaningful for this preset. */
  usesDistance: boolean;
  /** Whether the `scaleFrom` control is meaningful. */
  usesScale: boolean;
  /** Class the emitter attaches to targets, matching repo naming. */
  cssClass: string;
}

export const PRESETS: readonly PresetDef[] = [
  {
    id: 'fade',
    label: 'Fade in',
    description: 'Appears in place.',
    usesDistance: false,
    usesScale: false,
    cssClass: 'fade',
  },
  {
    id: 'fade_up',
    label: 'Rise in',
    description: 'Slides up into place while fading in.',
    usesDistance: true,
    usesScale: false,
    cssClass: 'fade_up',
  },
  {
    id: 'fade_down',
    label: 'Drop in',
    description: 'Slides down into place while fading in.',
    usesDistance: true,
    usesScale: false,
    cssClass: 'fade_down',
  },
  {
    id: 'fade_left',
    label: 'Slide in from left',
    description: 'Enters from the left edge.',
    usesDistance: true,
    usesScale: false,
    cssClass: 'fade_right',
  },
  {
    id: 'fade_right',
    label: 'Slide in from right',
    description: 'Enters from the right edge.',
    usesDistance: true,
    usesScale: false,
    cssClass: 'fade_left',
  },
  {
    id: 'scale_in',
    label: 'Grow in',
    description: 'Scales up from smaller than final size.',
    usesDistance: false,
    usesScale: true,
    cssClass: 'scale_in',
  },
  {
    id: 'scale_out',
    label: 'Settle in',
    description: 'Snaps down from oversized — good for logos.',
    usesDistance: false,
    usesScale: true,
    cssClass: 'scale_out',
  },
  {
    id: 'custom',
    label: 'Custom GSAP',
    description: 'Hand-written tween vars, for anything the presets miss.',
    usesDistance: false,
    usesScale: false,
    cssClass: 'anim_custom',
  },
] as const;

export function presetDef(id: PresetId): PresetDef {
  const found = PRESETS.find((p) => p.id === id);
  // `custom` is guaranteed present; the fallback keeps this total.
  return found ?? PRESETS[PRESETS.length - 1]!;
}

export type StaggerFrom = 'start' | 'end' | 'center' | 'edges' | 'random';

export interface StaggerConfig {
  /** Seconds between each target starting. */
  each: number;
  from: StaggerFrom;
}

export interface Tween {
  id: string;
  /** Shown on the timeline strip. */
  name: string;
  /** Node ids this tween animates. */
  targetIds: string[];
  /**
   * Extra raw selector appended to the target list, for reaching generated
   * DOM inside smart components (e.g. `.bracket_set`).
   */
  targetSelector?: string;
  preset: PresetId;
  duration: number;
  /** Timeline position in seconds. 0 means "with the start of the timeline". */
  position: number;
  ease: EaseName;
  /** Travel distance in px for the directional presets. */
  distance: number;
  /** Starting scale for the scale presets. */
  scaleFrom: number;
  stagger?: StaggerConfig;
  /**
   * Skip targets whose bound data came back empty, via the repo's
   * `:not(.text_empty)` guard. Prevents animating invisible placeholders.
   */
  skipEmpty: boolean;
  /** Raw GSAP vars object source, used when `preset` is `custom`. */
  customVars?: string;
  enabled: boolean;
}

export function defaultTween(partial: Partial<Tween> = {}): Tween {
  return {
    id: '',
    name: 'Tween',
    targetIds: [],
    preset: 'fade',
    duration: 0.2,
    position: 0,
    ease: 'power2.out',
    distance: 20,
    scaleFrom: 1.28,
    skipEmpty: true,
    enabled: true,
    ...partial,
  };
}

export interface AnimationSpec {
  tweens: Tween[];
  /**
   * Global multiplier applied to the emitted timeline. Lets a user slow an
   * entire intro down without touching every tween.
   */
  timeScale: number;
  /**
   * Re-run the intro whenever the OBS source becomes visible. globals.js wires
   * this up already; turning it off emits a `Start()` that no-ops on re-show.
   */
  replayOnShow: boolean;
}

export function defaultAnimation(): AnimationSpec {
  return { tweens: [], timeScale: 1, replayOnShow: true };
}

/** Total timeline length, used to size the scrubber. */
export function animationDuration(spec: AnimationSpec): number {
  return spec.tweens
    .filter((t) => t.enabled)
    .reduce((max, t) => {
      const staggerTail = t.stagger
        ? t.stagger.each * Math.max(0, t.targetIds.length - 1)
        : 0;
      return Math.max(max, t.position + t.duration + staggerTail);
    }, 0);
}
