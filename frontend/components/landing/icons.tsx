import type {ReactNode, SVGProps} from 'react';

const glyphs = {
  branch: <><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="6.5" r="2"/><path d="M6 7v10M18 8.5c0 5.5-7.5 3.5-11.6 8.6"/></>,
  merge: <><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="12" r="2"/><path d="M6 7v10M6 7c0 3.5 3.5 5 10 5"/></>,
  file: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5"/>,
  checkCircle: <><circle cx="12" cy="12" r="9"/><path d="M8 12.4l2.8 2.8L16.2 9.6"/></>,
  alert: <><path d="M10.3 4.2L2.9 17.5A2 2 0 0 0 4.6 20.5h14.8a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z"/><path d="M12 9.5v4.2M12 17h.01"/></>,
  shield: <><path d="M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z"/><path d="M9 12l2.2 2.2L15.2 10"/></>,
  flask: <><path d="M9 3h6M10 3v6.2L5.2 17.6A2.3 2.3 0 0 0 7.2 21h9.6a2.3 2.3 0 0 0 2-3.4L14 9.2V3"/><path d="M7.4 15h9.2"/></>,
  sparkle: <><path d="M10 4l1.6 4.4L16 10l-4.4 1.6L10 16l-1.6-4.4L4 10l4.4-1.6z"/><path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z"/></>,
  play: <path d="M8.5 5.8v12.4a.8.8 0 0 0 1.2.7l9.8-6.2a.8.8 0 0 0 0-1.4L9.7 5.1a.8.8 0 0 0-1.2.7z" fill="currentColor" stroke="none"/>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
  package: <><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5l8 4.5 8-4.5M12 12v9"/></>,
  service: <><path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="3"/></>,
  database: <><ellipse cx="12" cy="5.5" rx="7" ry="2.5"/><path d="M5 5.5v13c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5v-13M5 12c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5"/></>,
  layers: <><path d="M12 3l9 4.5-9 4.5-9-4.5z"/><path d="M3 12l9 4.5 9-4.5M3 16.5L12 21l9-4.5"/></>,
  bulb: <><path d="M9.5 18h5M10.5 21h3"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.4 1.1 2.2h5c0-.8.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></>,
  chart: <path d="M5 20v-8M10 20V5M15 20v-6M20 20v-10"/>,
  regression: <><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><path d="M6 7v10M8 5h5a4 4 0 0 1 4 4v8"/><path d="M14 14l3 3 3-3"/></>,
  graph: <><circle cx="6" cy="6" r="2.4"/><circle cx="18" cy="8" r="2.4"/><circle cx="10" cy="18" r="2.4"/><path d="M8.3 6.5l7.3 1M7 8.2l2.2 7.5M16.4 10l-4.8 6.1"/></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></>,
  radar: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12l5.5-5.5"/></>,
  message: <><path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8.5 10.5l2 2 4-4"/></>,
  spinner: <><path d="M12 3a9 9 0 1 0 9 9" opacity=".95"/><path d="M21 12a9 9 0 0 0-9-9" opacity=".25"/></>,
  github: <path fill="currentColor" stroke="none" d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-1.9c-3.12.68-3.78-1.5-3.78-1.5-.5-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.68.08-.68 1.12.08 1.72 1.16 1.72 1.16 1 1.72 2.63 1.22 3.27.93.1-.73.39-1.22.71-1.5-2.49-.28-5.11-1.25-5.11-5.55 0-1.22.44-2.22 1.16-3-.12-.29-.5-1.43.1-2.98 0 0 .95-.3 3.08 1.15a10.7 10.7 0 0 1 5.62 0c2.14-1.45 3.08-1.15 3.08-1.15.61 1.55.23 2.7.11 2.98.72.78 1.16 1.78 1.16 3 0 4.31-2.63 5.26-5.13 5.54.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8z"/>,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof glyphs;

export function Icon({name, size = 16, ...props}: {name: IconName; size?: number | string} & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {glyphs[name]}
    </svg>
  );
}
