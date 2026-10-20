import { useEffect, useState } from 'react'

const QUERY = '(max-width: 767px)'

/** True on phone-width screens; Runway switches to the phone layout there. */
export function useIsPhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setPhone(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return phone
}
