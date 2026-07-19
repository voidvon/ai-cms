import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile(breakpoint = MOBILE_BREAKPOINT) {
  const mediaQuery = `(max-width: ${breakpoint - 1}px)`
  const subscribe = React.useCallback((onChange: () => void) => {
    const mql = window.matchMedia(mediaQuery)
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [mediaQuery])
  const getSnapshot = React.useCallback(
    () => window.matchMedia(mediaQuery).matches,
    [mediaQuery]
  )

  return React.useSyncExternalStore(subscribe, getSnapshot, () => false)
}
