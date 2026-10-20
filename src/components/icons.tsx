// Line icons used across the phone layout (stroke = currentColor)

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const Eye = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
)
export const EyeOff = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.1M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
)
export const Plus = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2.8}><path d="M12 5v14M5 12h14" /></svg>
)
export const Search = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
)
export const SignOut = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
)
export const HomeIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...base}><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
)
export const CalendarIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...base}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
)
export const CardIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...base}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20M6 15h4" /></svg>
)
export const WalletIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" {...base}><path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2" /><path d="M22 11h-6a2 2 0 0 0 0 4h6z" /></svg>
)
export const PlaneIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" {...base} strokeWidth={2}><path d="M17.8 19.2L16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" /></svg>
)
export const ChevronIcon = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg width="18" height="18" viewBox="0 0 24 24" {...base} strokeWidth={2.4}><path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>
)
