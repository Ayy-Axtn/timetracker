import { useEffect, useState } from 'react'

// Click-to-edit text cell. Single-line by default: Enter or blur commits (only
// if changed), Esc reverts. In `multiline` mode it edits in a textarea where
// Enter still commits but Shift+Enter inserts a newline, and the display
// preserves line breaks.
export function EditableText({
  value,
  placeholder,
  testid,
  multiline = false,
  onCommit
}: {
  value: string | null
  placeholder: string
  testid?: string
  multiline?: boolean
  onCommit: (next: string) => void
}): React.JSX.Element {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => {
    if (!editing) setDraft(value ?? '')
  }, [value, editing])

  const commit = (): void => {
    setEditing(false)
    if (draft !== (value ?? '')) onCommit(draft)
  }

  if (!editing) {
    return (
      <span
        className={`cell-text${multiline ? ' multiline' : ''}`}
        data-testid={testid}
        onClick={() => setEditing(true)}
      >
        {value ? value : <span className="cell-placeholder">{placeholder}</span>}
      </span>
    )
  }

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault()
      setDraft(value ?? '')
      setEditing(false)
    } else if (e.key === 'Enter' && (!multiline || !e.shiftKey)) {
      e.preventDefault()
      commit()
    }
  }

  if (multiline) {
    return (
      <textarea
        className="cell-input multiline"
        data-testid={testid ? `${testid}-input` : undefined}
        autoFocus
        rows={Math.min(6, Math.max(2, draft.split('\n').length))}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={onKeyDown}
      />
    )
  }

  return (
    <input
      className="cell-input"
      data-testid={testid ? `${testid}-input` : undefined}
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
    />
  )
}
