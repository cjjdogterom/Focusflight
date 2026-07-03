// Single-family inline SVG icon set (stroke 1.75, round caps) — replaces all
// emoji glyphs per the design-skill anti-emoji policy.

interface IconProps {
  size?: number
  className?: string
}

function base(size: number, className: string | undefined, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const IconPlus = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="M12 5v14M5 12h14" />)

export const IconMinus = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="M5 12h14" />)

export const IconSoundOn = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" />
    </>,
  )

export const IconSoundOff = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" />
      <path d="m16 9 5 6M21 9l-5 6" />
    </>,
  )

/** north-up follow: crosshair */
export const IconFollow = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>,
  )

/** track-up follow: plane nose-up in ring */
export const IconTrackUp = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6.5v6.8M12 6.5l-3.6 6 3.6-1.6 3.6 1.6-3.6-6ZM10 16.6h4" strokeWidth="1.5" />
    </>,
  )

export const IconExpand = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" />,
  )

export const IconMoon = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="M20 13.5A7.5 7.5 0 0 1 10.5 4 7.9 7.9 0 1 0 20 13.5Z" />)

export const IconGear = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M4.1 7.4l2.1 1.2M17.8 15.4l2.1 1.2M4.1 16.6l2.1-1.2M17.8 8.6l2.1-1.2" />
    </>,
  )

export const IconBack = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="M14.5 5.5 8 12l6.5 6.5" />)

export const IconLog = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <path d="M5 4h11.5A2.5 2.5 0 0 1 19 6.5v13H7a2 2 0 0 1-2-2V4Z" />
      <path d="M5 16.5A2.5 2.5 0 0 1 7.5 14H19M9 8h6" />
    </>,
  )

export const IconCards = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <rect x="3" y="7.5" width="14" height="10" rx="2" />
      <path d="M7 4.5h11.5a2 2 0 0 1 2 2V15M3 11h14" />
    </>,
  )

export const IconPause = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="M9 5.5v13M15 5.5v13" strokeWidth="2.2" />)

export const IconPlay = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="m8 5.5 10 6.5-10 6.5V5.5Z" />)

export const IconX = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="M6 6l12 12M18 6 6 18" />)

export const IconSkipEnd = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="m6 6 7 6-7 6V6ZM17 5.5v13" strokeWidth="2" />)

export const IconChevronRight = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />)

export const IconPlane = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <path d="M10.5 20.5v-2l1.5-1.5 1.5 1.5v2M12 3.5c.7 0 1.2.9 1.2 2.2v3.6l7.3 4.2v1.9l-7.3-2.1v4L12 18.5l-1.2-1.2v-4L3.5 15.4v-1.9l7.3-4.2V5.7c0-1.3.5-2.2 1.2-2.2Z" />,
  )

export const IconDice = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <rect x="4" y="4" width="16" height="16" rx="3.5" />
      <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" />
    </>,
  )

export const IconDownload = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="M12 4v10.5M7.5 11 12 15.5 16.5 11M5 19.5h14" />)

export const IconCheck = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="m5 12.5 4.5 4.5L19 7.5" />)

export const IconReturn = ({ size = 20, className }: IconProps) =>
  base(size, className, <path d="M9.5 6 5 10.5 9.5 15M5 10.5h10a4.5 4.5 0 0 1 0 9H12" />)

export const IconLayers = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <path d="m12 3.5 8.5 4.5L12 12.5 3.5 8 12 3.5Z" />
      <path d="m4.5 12.5 7.5 4 7.5-4M4.5 16.5l7.5 4 7.5-4" strokeWidth="1.5" />
    </>,
  )

export const IconPassport = ({ size = 20, className }: IconProps) =>
  base(
    size,
    className,
    <>
      <rect x="5" y="3" width="14" height="18" rx="2.2" />
      <circle cx="12" cy="10" r="3.1" />
      <path d="M9.2 16.5h5.6" />
    </>,
  )
