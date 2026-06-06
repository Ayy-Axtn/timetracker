import { useCallback, useEffect, useRef, useState } from 'react'
import type {
  CrashRecoveryPayload,
  EndSummaryPayload,
  NewTaskPayload,
  PickPayload,
  PopupRequest,
  PopupResult,
  ResolveActivePayload,
  StatusPayload
} from '../../../shared/popup'
import { NewTaskForm } from './NewTaskForm'
import { ResolveActivePrompt } from './ResolveActivePrompt'
import { PickerList } from './PickerList'
import { EndSummary } from './EndSummary'
import { CrashRecovery } from './CrashRecovery'
import { StatusView } from './StatusView'

// Hosts the reusable popup window. Listens for the mode main wants to show,
// renders the matching component, and ships the result back. Esc cancels any
// mode; the close button does the same.
export function PopupApp(): React.JSX.Element | null {
  const [request, setRequest] = useState<PopupRequest | null>(null)
  const popupRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const unsubscribe = window.api.popup.onShow(setRequest)
    window.api.popup.ready()
    return unsubscribe
  }, [])

  // Size the popup window to its content (so there's no dead space and it grows
  // with the description field). Measures the .mode content height plus the
  // card's padding/border and asks main to fit the window to it.
  useEffect(() => {
    const popup = popupRef.current
    if (!popup || !request) return
    const report = (): void => {
      const mode = popup.querySelector('.mode')
      if (!mode) return
      const cs = getComputedStyle(popup)
      const chrome =
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) +
        parseFloat(cs.borderBottomWidth)
      window.api.popup.resize(Math.ceil(mode.getBoundingClientRect().height + chrome))
    }
    const mode = popup.querySelector('.mode')
    const observer = new ResizeObserver(report)
    if (mode) observer.observe(mode)
    report()
    return () => observer.disconnect()
  }, [request])

  // Expose the active mode on <body> so the E2E driver can wait for a render.
  useEffect(() => {
    document.body.dataset.popupMode = request?.mode ?? ''
  }, [request])

  const respond = useCallback(
    (result: PopupResult | null) => {
      setRequest((current) => {
        if (current) window.api.popup.respond(current.requestId, result)
        return null
      })
    },
    []
  )

  const cancel = useCallback(() => respond(null), [respond])

  useEffect(() => {
    if (!request) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        cancel()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [request, cancel])

  if (!request) return null

  return (
    <div className="popup" ref={popupRef}>
      <button className="popup-close" data-testid="popup-close" aria-label="Close" onClick={cancel}>
        ×
      </button>
      <Body request={request} respond={respond} />
    </div>
  )
}

function Body({
  request,
  respond
}: {
  request: PopupRequest
  respond: (result: PopupResult | null) => void
}): React.JSX.Element {
  switch (request.mode) {
    case 'newTask':
      return <NewTaskForm payload={request.payload as NewTaskPayload} onSubmit={respond} />
    case 'resolveActive':
      return <ResolveActivePrompt payload={request.payload as ResolveActivePayload} onSubmit={respond} />
    case 'pickOpen':
    case 'pickPaused':
      return <PickerList payload={request.payload as PickPayload} onSubmit={respond} />
    case 'endSummary':
      return <EndSummary payload={request.payload as EndSummaryPayload} onSubmit={respond} />
    case 'crashRecovery':
      return <CrashRecovery payload={request.payload as CrashRecoveryPayload} onSubmit={respond} />
    case 'status':
      return <StatusView payload={request.payload as StatusPayload} onClose={() => respond(null)} />
  }
}
