/** Future opt-in Motion patterns; importing this file does not animate a page. */
import type {Variants} from 'motion/react';

export const motionTokens = {
  duration: {fast: .14, normal: .22, slow: .4, cinematic: .85},
  ease: [.22, 1, .36, 1] as [number, number, number, number],
};
export const entrancePatterns = {
  fadeUp: {opacity: 0, y: 12},
  softScale: {opacity: 0, scale: .985},
  panelEntrance: {opacity: 0, y: 12, scale: .985},
};
/** Pass the user's reduced-motion preference when wiring a future Motion component. */
export function entranceVariants(pattern: keyof typeof entrancePatterns, reducedMotion: boolean): Variants {
  return reducedMotion
    ? {initial: {opacity: 1, y: 0, scale: 1}, visible: {opacity: 1, y: 0, scale: 1, transition: {duration: 0}}}
    : {initial: entrancePatterns[pattern], visible: {opacity: 1, y: 0, scale: 1,
      transition: {duration: pattern === 'panelEntrance' ? motionTokens.duration.cinematic : motionTokens.duration.slow, ease: motionTokens.ease}}};
}
