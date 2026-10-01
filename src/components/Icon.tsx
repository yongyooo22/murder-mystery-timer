/**
 * 선형 아이콘 세트(24×24, 선 굵기 1.8, 둥근 끝). 모든 아이콘이 같은 스타일을 쓴다.
 * 점(•)은 작은 원을 채워서 그린다.
 */
type Shape = { d: string } | { cx: number; cy: number; r: number; fill?: boolean };

const ICONS = {
  plus: [{ d: 'M12 5v14M5 12h14' }],
  minus: [{ d: 'M5 12h14' }],
  close: [{ d: 'M6 6l12 12M18 6 6 18' }],
  more: [
    { cx: 5, cy: 12, r: 1.5, fill: true },
    { cx: 12, cy: 12, r: 1.5, fill: true },
    { cx: 19, cy: 12, r: 1.5, fill: true },
  ],
  refresh: [{ d: 'M20 12a8 8 0 1 1-2.34-5.66' }, { d: 'M13.66 6.34h4v-4' }],
  restore: [{ d: 'M4 12a8 8 0 1 0 2.34-5.66' }, { d: 'M10.34 6.34h-4v-4' }],
  settings: [{ d: 'M4 7h9M17 7h3M4 17h3M11 17h9' }, { cx: 15, cy: 7, r: 2 }, { cx: 9, cy: 17, r: 2 }],
  trash: [
    { d: 'M4 7h16M9.5 7V4.5h5V7' },
    { d: 'M6.5 7l.8 12.1a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7' },
    { d: 'M10 11v5.5M14 11v5.5' },
  ],
  copy: [
    { d: 'M10 8h8.5A1.5 1.5 0 0 1 20 9.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 8 18.5V10a2 2 0 0 1 2-2z' },
    { d: 'M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8' },
  ],
  edit: [{ d: 'M4 20l1-4.5L15.5 5a2.12 2.12 0 0 1 3 3L8 18.5 4 20z' }, { d: 'M13.5 7l3.5 3.5' }],
  play: [{ d: 'M7.5 5.2v13.6a.8.8 0 0 0 1.22.68l10.7-6.8a.8.8 0 0 0 0-1.36L8.72 4.52a.8.8 0 0 0-1.22.68z' }],
  pause: [{ d: 'M8.5 5v14M15.5 5v14' }],
  'chevron-left': [{ d: 'M14.5 6l-6 6 6 6' }],
  'chevron-right': [{ d: 'M9.5 6l6 6-6 6' }],
  'chevron-down': [{ d: 'M6 9.5l6 6 6-6' }],
  'chevron-up': [{ d: 'M6 14.5l6-6 6 6' }],
  'arrow-left': [{ d: 'M19 12H5M11 6l-6 6 6 6' }],
  'arrow-up': [{ d: 'M12 19V5M6 11l6-6 6 6' }],
  'arrow-down': [{ d: 'M12 5v14M6 13l6 6 6-6' }],
  grip: [
    { cx: 9, cy: 6, r: 1.5, fill: true },
    { cx: 15, cy: 6, r: 1.5, fill: true },
    { cx: 9, cy: 12, r: 1.5, fill: true },
    { cx: 15, cy: 12, r: 1.5, fill: true },
    { cx: 9, cy: 18, r: 1.5, fill: true },
    { cx: 15, cy: 18, r: 1.5, fill: true },
  ],
  maximize: [
    { d: 'M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4' },
  ],
  minimize: [
    { d: 'M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4' },
  ],
  list: [
    { d: 'M9 6h11M9 12h11M9 18h11' },
    { cx: 4.5, cy: 6, r: 1.2, fill: true },
    { cx: 4.5, cy: 12, r: 1.2, fill: true },
    { cx: 4.5, cy: 18, r: 1.2, fill: true },
  ],
  clock: [{ cx: 12, cy: 12, r: 8.5 }, { d: 'M12 7.5V12l3 2' }],
  alert: [
    { d: 'M10.27 4.9a2 2 0 0 1 3.46 0l7.36 12.6a2 2 0 0 1-1.73 3H4.64a2 2 0 0 1-1.73-3z' },
    { d: 'M12 9.8v4.2' },
    { cx: 12, cy: 17, r: 1.1, fill: true },
  ],
  info: [{ cx: 12, cy: 12, r: 8.5 }, { d: 'M12 11v5' }, { cx: 12, cy: 8, r: 1.1, fill: true }],
  check: [{ d: 'M5 12.5l4.5 4.5L19 7.5' }],
  offline: [
    { d: 'M9 15.5a4.2 4.2 0 0 1 6 0M6 12.5a8.5 8.5 0 0 1 12 0M3 9.5a12.7 12.7 0 0 1 18 0' },
    { cx: 12, cy: 18.6, r: 1.2, fill: true },
    { d: 'M4 4l16 16' },
  ],
  template: [{ d: 'M12 3.5L20.5 8 12 12.5 3.5 8z' }, { d: 'M3.5 12L12 16.5 20.5 12M3.5 16L12 20.5 20.5 16' }],
  flag: [{ d: 'M5.5 21V4.5h11.5l-2.5 4 2.5 4H5.5' }],
  'skip-forward': [{ d: 'M6 6.5v11l8.5-5.5z' }, { d: 'M18 6v12' }],
  'skip-back': [{ d: 'M18 6.5v11l-8.5-5.5z' }, { d: 'M6 6v12' }],
  exit: [
    { d: 'M10 4.5H6A1.5 1.5 0 0 0 4.5 6v12A1.5 1.5 0 0 0 6 19.5h4' },
    { d: 'M15 8l4 4-4 4M19 12H9.5' },
  ],
  volume: [
    { d: 'M4.5 9.5v5H8l4.5 4v-13L8 9.5z' },
    { d: 'M16 9a4.2 4.2 0 0 1 0 6M18.5 6.5a7.8 7.8 0 0 1 0 11' },
  ],
  bell: [
    { d: 'M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5z' },
    { d: 'M10 20.5a2.2 2.2 0 0 0 4 0' },
  ],
  vibrate: [{ d: 'M9.5 4h5A1.5 1.5 0 0 1 16 5.5v13a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 8 18.5v-13A1.5 1.5 0 0 1 9.5 4z' }, { d: 'M4.5 9v6M19.5 9v6' }],
  sun: [
    { cx: 12, cy: 12, r: 3.5 },
    { d: 'M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6' },
  ],
  users: [
    { cx: 9, cy: 8.5, r: 3.2 },
    { d: 'M3.5 19a5.5 5.5 0 0 1 11 0' },
    { d: 'M15.8 5.6a3 3 0 0 1 0 5.8M17.5 14.3A5.2 5.2 0 0 1 20.5 19' },
  ],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 20, className, strokeWidth = 1.8 }: IconProps) {
  const shapes: Shape[] = ICONS[name];
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {shapes.map((shape, i) =>
        'd' in shape ? (
          <path key={i} d={shape.d} />
        ) : (
          <circle
            key={i}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={shape.fill ? 'currentColor' : 'none'}
            stroke={shape.fill ? 'none' : 'currentColor'}
          />
        ),
      )}
    </svg>
  );
}
