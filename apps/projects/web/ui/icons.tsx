import type { ReactNode, SVGProps } from 'react';

// One consistent icon set: 16px grid, 1.5 stroke, round caps/joins.
const ICONS = {
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  pin: <path d="M6 2.5h4l-.6 4.2L12 9H4l2.6-2.3L6 2.5ZM8 9v4.5" />,
  search: <><circle cx="7.2" cy="7.2" r="4.2" /><path d="M10.4 10.4l3.1 3.1" /></>,
  bell: <path d="M4 6.5a4 4 0 0 1 8 0c0 3 1 4 1.5 4.5h-11C3 10.5 4 9.5 4 6.5ZM6.5 13a1.5 1.5 0 0 0 3 0" />,
  chevronDown: <path d="M4 6l4 4 4-4" />,
  chevronUp: <path d="M4 10l4-4 4 4" />,
  chevronRight: <path d="M6 4l4 4-4 4" />,
  chevronLeft: <path d="M10 4L6 8l4 4" />,
  chevronsUpDown: <path d="M5 6.2L8 3.2l3 3M5 9.8l3 3 3-3" />,
  check: <path d="M3.5 8.5l3 3 6-7" />,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  home: <path d="M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V7.5ZM6.5 13.5v-4h3v4" />,
  checkCircle: <><circle cx="8" cy="8" r="5.6" /><path d="M5.6 8.2l1.8 1.8 3.1-3.5" /></>,
  users: <><circle cx="6" cy="5.8" r="2.3" /><path d="M2 13c0-2.2 1.8-3.5 4-3.5s4 1.3 4 3.5M10.4 3.7a2.3 2.3 0 0 1 0 4.2M12 9.7c1.3.5 2 1.6 2 3.3" /></>,
  user: <><circle cx="8" cy="5.5" r="2.5" /><path d="M3 13.5c0-2.5 2.2-4 5-4s5 1.5 5 4" /></>,
  bars: <path d="M3.5 13V7.5M8 13V3M12.5 13V9.5" />,
  workload: <path d="M2.5 4h7M2.5 8h11M2.5 12h8.5" />,
  trash: <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5M7 7v3.5M9 7v3.5" />,
  sun: <><circle cx="8" cy="8" r="2.6" /><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1" /></>,
  moon: <path d="M12.8 9.6A5.2 5.2 0 0 1 6.4 3.2a5.2 5.2 0 1 0 6.4 6.4Z" />,
  menu: <path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11" />,
  folder: <path d="M2 4.5a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1v5.5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-7Z" />,
  calendar: <><rect x="2.5" y="3.5" width="11" height="10" rx="1.6" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></>,
  flag: <path d="M4 14V2.5M4 3h7.5L10 5.8l1.5 2.7H4" />,
  more: <><circle cx="3.5" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="8" cy="8" r="1" fill="currentColor" stroke="none" /><circle cx="12.5" cy="8" r="1" fill="currentColor" stroke="none" /></>,
  edit: <path d="M10.5 3l2.5 2.5L6 12.5l-3 .5.5-3L10.5 3Z" />,
  copy: <><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" /><path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" /></>,
  archive: <><rect x="2" y="3" width="12" height="3" rx="1" /><path d="M3 6v6.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6M6.5 9h3" /></>,
  link: <path d="M6.8 9.2a2.5 2.5 0 0 0 3.5 0l2.2-2.2a2.5 2.5 0 0 0-3.5-3.5l-.6.6M9.2 6.8a2.5 2.5 0 0 0-3.5 0L3.5 9a2.5 2.5 0 0 0 3.5 3.5l.6-.6" />,
  doc: <path d="M4 2.5h5l3 3v8H4v-11ZM9 2.5v3h3M6 8.5h4M6 11h4" />,
  whiteboard: <><rect x="2" y="2.8" width="12" height="8.2" rx="1.5" /><path d="M5 14l1.4-3M11 14l-1.4-3M5.2 8.4l2-2 1.6 1.6 2-2" /></>,
  clock: <><circle cx="8" cy="8" r="5.6" /><path d="M8 4.6V8l2.2 1.4" /></>,
  play: <path d="M5.5 3.5v9l7-4.5-7-4.5Z" />,
  stop: <rect x="4.5" y="4.5" width="7" height="7" rx="1.3" />,
  logOut: <path d="M6.5 13.5H4A1.5 1.5 0 0 1 2.5 12V4A1.5 1.5 0 0 1 4 2.5h2.5M10 5l3 3-3 3M13 8H6.5" />,
  panelLeft: <><rect x="2" y="3" width="12" height="10" rx="1.6" /><path d="M6 3v10" /></>,
  filter: <path d="M2.5 4h11M4.5 8h7M6.5 12h3" />,
  alert: <path d="M8 2.5L14 13H2L8 2.5ZM8 6.6v3M8 11.4h.01" />,
  info: <><circle cx="8" cy="8" r="5.6" /><path d="M8 7.4v3.4M8 5.2h.01" /></>,
  restore: <path d="M3 8a5 5 0 1 0 1.6-3.7M3 2.8v2.6h2.6" />,
  external: <path d="M9 3h4v4M13 3L7.5 8.5M11 9v3.5a.5.5 0 0 1-.5.5h-7a.5.5 0 0 1-.5-.5v-7a.5.5 0 0 1 .5-.5H7" />,
  overview: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  list: <><path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5" /><circle cx="3" cy="4.5" r=".6" fill="currentColor" /><circle cx="3" cy="8" r=".6" fill="currentColor" /><circle cx="3" cy="11.5" r=".6" fill="currentColor" /></>,
  board: <><rect x="2.5" y="3" width="3.2" height="10" rx="1" /><rect x="6.4" y="3" width="3.2" height="6.5" rx="1" /><rect x="10.3" y="3" width="3.2" height="8" rx="1" /></>,
  timeline: <path d="M2.5 4.5h6M5.5 8h8M4 11.5h5.5" />,
  building: <><rect x="3.5" y="2.5" width="9" height="11" rx="1.2" /><path d="M6 5.5h1M9 5.5h1M6 8.2h1M9 8.2h1M7 13.5v-2.3h2v2.3" /></>,
  arrowRight: <path d="M3 8h10M9 4.5L12.5 8 9 11.5" />,
  download: <path d="M8 2.5v8M4.5 7.2L8 10.7l3.5-3.5M3 13.5h10" />,
  upload: <path d="M8 10.5v-8M4.5 5.8L8 2.3l3.5 3.5M3 13.5h10" />,
  undo: <path d="M4.2 6.5H9.5a3 3 0 0 1 0 6H6M6.7 3.6L3.7 6.5l3 2.9" />,
  command: <path d="M5.5 5.5v5M10.5 5.5v5M5.5 5.5h5M5.5 10.5h5M5.5 5.5a1.75 1.75 0 1 1-1.75-1.75M10.5 5.5a1.75 1.75 0 1 0 1.75-1.75M5.5 10.5a1.75 1.75 0 1 0-1.75 1.75M10.5 10.5a1.75 1.75 0 1 1 1.75 1.75" />,
  star: <path d="M8 2.2l1.8 3.7 4 .6-2.9 2.8.7 4-3.6-1.9-3.6 1.9.7-4L2.2 6.5l4-.6L8 2.2Z" />,
  lock: <><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" /></>,
  taskAdd: <><path d="M12.6 8.6A5.4 5.4 0 1 1 7.4 2.6" /><path d="M5.2 7.8l1.8 1.8 3.2-3.6M12.5 2.5v4M10.5 4.5h4" /></>,
  folderPlus: <><path d="M8 12.5H3a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3l1.5 1.5H13a1 1 0 0 1 1 1V8" /><path d="M12 10v4M10 12h4" /></>,
  keyboard: <><rect x="1.8" y="3.8" width="12.4" height="8.4" rx="1.6" /><path d="M4.5 6.6h.01M7 6.6h.01M9.5 6.6h.01M12 6.6h.01M4.5 9.6h7" /></>,
  globe: <><circle cx="8" cy="8" r="5.6" /><path d="M2.4 8h11.2M8 2.4c1.7 1.7 2.4 3.5 2.4 5.6S9.7 11.9 8 13.6C6.3 11.9 5.6 10.1 5.6 8S6.3 4.1 8 2.4Z" /></>,
  image: <><rect x="2.2" y="3" width="11.6" height="10" rx="1.6" /><circle cx="5.8" cy="6.4" r="1.1" /><path d="M2.6 11.8l3.4-3.2 2.4 2.2 2-1.8 3 2.8" /></>,
  video: <><rect x="2" y="3.6" width="8.4" height="8.8" rx="1.6" /><path d="M10.4 7l3.6-2v6l-3.6-2" /></>,
  activity: <path d="M1.8 8h3l1.8-4.6 2.8 9.2L11 8h3.2" />,
  grid: <><rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="9" y="2.5" width="4.5" height="4.5" rx="1" /><rect x="2.5" y="9" width="4.5" height="4.5" rx="1" /><rect x="9" y="9" width="4.5" height="4.5" rx="1" /></>,
  embed: <path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9.2 3.2L6.8 12.8" />,
  sheet: <><rect x="2.5" y="2.8" width="11" height="10.4" rx="1.4" /><path d="M2.5 6.4h11M2.5 9.8h11M6.4 6.4v6.8" /></>,
  filePlus: <><path d="M9 2.5H4.5v11h7v-7L9 2.5ZM9 2.5v4h2.5" /><path d="M8 8.6v3.4M6.3 10.3h3.4" /></>,
  layers: <path d="M8 2.5l6 3.2-6 3.2-6-3.2 6-3.2ZM2 8.4l6 3.2 6-3.2M2 11l6 3.2 6-3.2" />,
  chevronsRight: <path d="M3 4l4 4-4 4M9 4l4 4-4 4" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> { name: IconName; size?: number }

export function Icon({ name, size = 16, className, ...rest }: IconProps) {
  return (
    <svg
      className={className ? `pm-icon ${className}` : 'pm-icon'}
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {ICONS[name]}
    </svg>
  );
}

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--pm-accent)" />
      <path d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="var(--pm-on-accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
