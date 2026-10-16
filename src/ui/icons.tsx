import React from 'react';

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function createIcon(path: React.ReactNode) {
  return function Icon({ size = 18, className, strokeWidth = 1.8 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
        aria-hidden="true"
      >
        {path}
      </svg>
    );
  };
}

export const SearchIcon = createIcon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </>
);
export const ArrowLeftIcon = createIcon(<path d="M19 12H5m7-7-7 7 7 7" />);
export const RefreshIcon = createIcon(
  <>
    <path d="M20 5v6h-6" />
    <path d="M4 19v-6h6" />
    <path d="M18 11a7 7 0 0 0-12-3m0 8a7 7 0 0 0 12 3" />
  </>
);
export const CheckSquareIcon = createIcon(
  <>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="m8.5 12 2.2 2.2 4.8-5.2" />
  </>
);
export const DownloadIcon = createIcon(
  <>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 20h14" />
  </>
);
export const TrashIcon = createIcon(
  <>
    <path d="M4 7h16" />
    <path d="M9 7V4h6v3" />
    <path d="M7 7l1 13h8l1-13" />
  </>
);
export const FolderIcon = createIcon(
  <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
);
export const FolderPlusIcon = createIcon(
  <>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z" />
    <path d="M12 11v5" />
    <path d="M9.5 13.5h5" />
  </>
);
export const ChevronRightIcon = createIcon(<path d="m9 6 6 6-6 6" />);
export const ChevronDownIcon = createIcon(<path d="m6 9 6 6 6-6" />);
export const EditIcon = createIcon(
  <>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L8 18l-4 1 1-4z" />
  </>
);
export const ExternalLinkIcon = createIcon(
  <>
    <path d="M14 5h5v5" />
    <path d="M10 14 19 5" />
    <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
  </>
);
export const SparkIcon = createIcon(
  <>
    <path d="m12 3 1.8 4.7L18.5 9 13.8 10.7 12 15.5l-1.8-4.8L5.5 9l4.7-1.3z" />
    <path d="m18 15 .8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8z" />
  </>
);
export const MessageSquareIcon = createIcon(
  <>
    <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4h9A2.5 2.5 0 0 1 19 6.5v6A2.5 2.5 0 0 1 16.5 15H10l-4 4v-4H7.5A2.5 2.5 0 0 1 5 12.5z" />
  </>
);
export const FileStackIcon = createIcon(
  <>
    <path d="M8 4h9a2 2 0 0 1 2 2v9" />
    <path d="M6 8h9a2 2 0 0 1 2 2v9a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V9a1 1 0 0 1 1-1Z" />
  </>
);
export const CircleDotIcon = createIcon(
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
  </>
);
export const BrainIcon = createIcon(
  <>
    <path d="M9.5 4A3.5 3.5 0 0 0 6 7.5v1A2.5 2.5 0 0 0 4 11v1a2.5 2.5 0 0 0 2 2.45V16a3 3 0 0 0 3 3h1.5" />
    <path d="M14.5 4A3.5 3.5 0 0 1 18 7.5v1A2.5 2.5 0 0 1 20 11v1a2.5 2.5 0 0 1-2 2.45V16a3 3 0 0 1-3 3H13.5" />
    <path d="M9.5 4v16" />
    <path d="M14.5 4v16" />
  </>
);
export const PanelLeftIcon = createIcon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </>
);
export const CheckIcon = createIcon(<path d="m5 12 4 4L19 6" />);
export const XIcon = createIcon(
  <>
    <path d="m18 6-12 12" />
    <path d="m6 6 12 12" />
  </>
);
export const LoaderIcon = createIcon(
  <>
    <path d="M12 2v4" />
    <path d="M12 18v4" />
    <path d="m4.93 4.93 2.83 2.83" />
    <path d="m16.24 16.24 2.83 2.83" />
    <path d="M2 12h4" />
    <path d="M18 12h4" />
    <path d="m4.93 19.07 2.83-2.83" />
    <path d="m16.24 7.76 2.83-2.83" />
  </>
);
export const SettingsIcon = createIcon(
  <>
    <path d="M12 3.5 13.7 5l2.3-.4 1 2.1 2.1 1-.4 2.3L20.5 12l-1.5 1.7.4 2.3-2.1 1-1 2.1-2.3-.4L12 20.5l-1.7-1.5-2.3.4-1-2.1-2.1-1 .4-2.3L3.5 12 5 10.3l-.4-2.3 2.1-1 1-2.1 2.3.4z" />
    <circle cx="12" cy="12" r="3" />
  </>
);
export const ServerIcon = createIcon(
  <>
    <rect x="4" y="4" width="16" height="6" rx="2" />
    <rect x="4" y="14" width="16" height="6" rx="2" />
    <path d="M8 7h.01" />
    <path d="M8 17h.01" />
  </>
);
export const KeyIcon = createIcon(
  <>
    <circle cx="7.5" cy="15.5" r="3.5" />
    <path d="M11 15.5h9" />
    <path d="M16 15.5v-3" />
    <path d="M19 15.5v-2" />
  </>
);

export function BrandGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none" aria-hidden="true">
      <rect x="4" y="4" width="40" height="40" rx="14" fill="url(#brandGlyphGradient)" />
      <path
        d="M15 30V18h5.2l4.1 7.3L28.4 18H33v12h-3.8v-5.7l-3.2 5.7h-3.5l-3.2-5.8V30z"
        fill="white"
      />
      <defs>
        <linearGradient
          id="brandGlyphGradient"
          x1="8"
          y1="7"
          x2="40"
          y2="41"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#0F766E" />
          <stop offset="1" stopColor="#164E63" />
        </linearGradient>
      </defs>
    </svg>
  );
}
