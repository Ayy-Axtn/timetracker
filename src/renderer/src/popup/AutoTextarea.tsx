import { useLayoutEffect, useRef } from 'react'

// A textarea that grows to fit its content (up to MAX_HEIGHT, then scrolls).
// Used for the free-text "description" fields; PopupApp watches the resulting
// content size and fits the popup window to it.
const MAX_HEIGHT = 200

export function AutoTextarea({
  value,
  onChange,
  ...rest
}: {
  value: string
  onChange: (value: string) => void
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'>): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    // Measure the natural content height, then clamp between the CSS min-height
    // floor and MAX_HEIGHT. Adding the border delta keeps the
    // box-sizing:border-box element from clipping itself by 1–2px.
    el.style.height = 'auto'
    const border = el.offsetHeight - el.clientHeight
    const min = parseFloat(getComputedStyle(el).minHeight) || 0
    const full = Math.max(el.scrollHeight + border, min)
    const capped = Math.min(full, MAX_HEIGHT)
    el.style.height = `${capped}px`
    el.style.overflowY = full > MAX_HEIGHT ? 'auto' : 'hidden'
  }, [value])

  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
}
