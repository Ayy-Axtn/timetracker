import { useEffect, useState } from 'react'

// Click-to-edit text cell: Enter or blur commits (only if changed), Esc reverts.
export function EditableText({
  value,
  placeholder,
  testid,
  onCommit
}: {
  value: string | null
  placeholder: string
  testid?: string
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
      <span className="cell-text" data-testid={testid} onClick={() => setEditing(true)}>
        {value ? value : <span className="cell-placeholder">{placeholder}</span>}
      </span>
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
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        } else if (e.key === 'Escape') {
          e.preventDefault()
          setDraft(value ?? '')
          setEditing(false)
        }
      }}
    />
  )
}
