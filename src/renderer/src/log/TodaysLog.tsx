import { useCallback, useEffect, useMemo, useState } from 'react'
import type { BackdateInput, BlockWithTask } from '../../../shared/models'
import { formatClipboardLine, formatClock, formatDuration } from '../../../shared/format'
import { EditableText } from './EditableText'
import { BackdateForm } from './BackdateForm'

const noonOf = (ms: number): number => {
  const d = new Date(ms)
  d.setHours(12, 0, 0, 0)
  return d.getTime()
}
const dayInputValue = (ms: number): string => {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
const parseDayInput = (value: string): number => {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0, 0).getTime()
}
const timeInputValue = (ms: number): string => {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}
const blockDuration = (block: BlockWithTask, now: number): number =>
  (block.endTime ?? now) - block.startTime

export function TodaysLog(): React.JSX.Element {
  const [dayMs, setDayMs] = useState(() => noonOf(Date.now()))
  const [blocks, setBlocks] = useState<BlockWithTask[]>([])
  const [now, setNow] = useState(Date.now())
  const [showBackdate, setShowBackdate] = useState(false)
  const [splittingId, setSplittingId] = useState<number | null>(null)
  const [splitTime, setSplitTime] = useState('')
  const [copiedId, setCopiedId] = useState<number | null>(null)

  const load = useCallback(async (): Promise<void> => {
    setBlocks(await window.api.getBlocksForDay(dayMs))
  }, [dayMs])

  useEffect(() => {
    void load()
  }, [load])

  // Refetch the viewed day whenever the main process reports a change (a
  // start/pause/resume/end transition, or an edit from another path).
  useEffect(() => window.api.onBlocksChanged(() => void load()), [load])

  // Tick so the active block's live duration advances.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const totals = useMemo(() => {
    const byTask = new Map<string, number>()
    let total = 0
    for (const block of blocks) {
      const ms = blockDuration(block, now)
      total += ms
      byTask.set(block.taskName, (byTask.get(block.taskName) ?? 0) + ms)
    }
    return { total, byTask: [...byTask.entries()].sort((a, b) => b[1] - a[1]) }
  }, [blocks, now])

  const isToday = dayInputValue(dayMs) === dayInputValue(Date.now())

  const copyRow = async (block: BlockWithTask): Promise<void> => {
    const line = formatClipboardLine({
      durationMs: blockDuration(block, now),
      ticketId: block.ticketId,
      text: block.summary || block.taskName
    })
    await window.api.copyToClipboard(line)
    setCopiedId(block.id)
    setTimeout(() => setCopiedId((c) => (c === block.id ? null : c)), 1500)
  }

  const confirmSplit = async (block: BlockWithTask): Promise<void> => {
    const [h, m] = splitTime.split(':').map(Number)
    const at = new Date(block.startTime)
    at.setHours(h || 0, m || 0, 0, 0)
    await window.api.splitBlock(block.id, at.getTime())
    setSplittingId(null)
    await load()
  }

  const onBackdate = async (input: BackdateInput): Promise<void> => {
    await window.api.backdateBlock(input)
    setShowBackdate(false)
    await load()
  }

  return (
    <main className="log">
      <header className="log-header">
        <div className="day-nav">
          <button className="btn" onClick={() => setDayMs((d) => d - 86_400_000)} aria-label="Previous day">
            ‹
          </button>
          <input
            type="date"
            className="day-input"
            data-testid="day-input"
            value={dayInputValue(dayMs)}
            onChange={(e) => e.target.value && setDayMs(parseDayInput(e.target.value))}
          />
          <button className="btn" onClick={() => setDayMs((d) => d + 86_400_000)} aria-label="Next day">
            ›
          </button>
          {!isToday && (
            <button className="btn" onClick={() => setDayMs(noonOf(Date.now()))}>
              Today
            </button>
          )}
        </div>
        <button className="btn" data-testid="add-block" onClick={() => setShowBackdate((s) => !s)}>
          + Add block
        </button>
      </header>

      {showBackdate && (
        <BackdateForm dayMs={dayMs} onSubmit={onBackdate} onCancel={() => setShowBackdate(false)} />
      )}

      <table className="log-table">
        <thead>
          <tr>
            <th>Start</th>
            <th>End</th>
            <th>Duration</th>
            <th>Task</th>
            <th>Ticket</th>
            <th>Notes</th>
            <th>Summary</th>
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {blocks.map((block, index) => {
            const prev = blocks[index - 1]
            const canMergeUp =
              !!prev && prev.taskId === block.taskId && prev.state === 'ended' && block.state === 'ended'
            return (
              <tr key={block.id} data-testid="log-row" className={`row ${block.state}`}>
                <td className="mono">{formatClock(block.startTime)}</td>
                <td className="mono">{block.endTime ? formatClock(block.endTime) : '—'}</td>
                <td className="mono">
                  {formatDuration(blockDuration(block, now))}
                  <span className={`state-dot ${block.state}`} title={block.state} />
                </td>
                <td>
                  <EditableText
                    value={block.taskName}
                    placeholder="(unnamed)"
                    testid={`task-${block.id}`}
                    onCommit={(v) => window.api.updateTask(block.taskId, { name: v }).then(load)}
                  />
                </td>
                <td>
                  <EditableText
                    value={block.ticketId}
                    placeholder="—"
                    testid={`ticket-${block.id}`}
                    onCommit={(v) => window.api.updateTask(block.taskId, { ticketId: v || null }).then(load)}
                  />
                </td>
                <td>
                  <EditableText
                    value={block.taskNotes}
                    placeholder="—"
                    testid={`notes-${block.id}`}
                    onCommit={(v) => window.api.updateTask(block.taskId, { notes: v || null }).then(load)}
                  />
                </td>
                <td>
                  <EditableText
                    value={block.summary}
                    placeholder="—"
                    testid={`summary-${block.id}`}
                    onCommit={(v) => window.api.updateBlock(block.id, { summary: v || null }).then(load)}
                  />
                </td>
                <td className="actions">
                  {splittingId === block.id ? (
                    <span className="split-inline">
                      <input
                        type="time"
                        className="field time"
                        data-testid={`split-time-${block.id}`}
                        value={splitTime}
                        onChange={(e) => setSplitTime(e.target.value)}
                      />
                      <button
                        className="icon-btn"
                        data-testid={`split-confirm-${block.id}`}
                        onClick={() => confirmSplit(block)}
                      >
                        ✓
                      </button>
                      <button className="icon-btn" onClick={() => setSplittingId(null)}>
                        ✗
                      </button>
                    </span>
                  ) : (
                    <>
                      <button
                        className="icon-btn"
                        data-testid={`copy-${block.id}`}
                        title="Copy for Autotask"
                        onClick={() => copyRow(block)}
                      >
                        {copiedId === block.id ? '✓' : '⧉'}
                      </button>
                      {canMergeUp && (
                        <button
                          className="icon-btn"
                          data-testid={`mergeup-${block.id}`}
                          title="Merge into the row above"
                          onClick={() => prev && window.api.mergeBlocks(prev.id, block.id).then(load)}
                        >
                          ↥
                        </button>
                      )}
                      {block.state === 'ended' && (
                        <button
                          className="icon-btn"
                          data-testid={`split-${block.id}`}
                          title="Split at a time"
                          onClick={() => {
                            setSplittingId(block.id)
                            setSplitTime(timeInputValue((block.startTime + (block.endTime ?? now)) / 2))
                          }}
                        >
                          ⤲
                        </button>
                      )}
                      <button
                        className="icon-btn danger"
                        data-testid={`delete-${block.id}`}
                        title="Delete"
                        onClick={() => window.api.deleteBlock(block.id).then(load)}
                      >
                        🗑
                      </button>
                    </>
                  )}
                </td>
              </tr>
            )
          })}
          {blocks.length === 0 && (
            <tr>
              <td colSpan={8} className="empty">
                No blocks for this day.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <footer className="totals">
        <div className="total-main">
          Total tracked: <strong data-testid="total-tracked">{formatDuration(totals.total)}</strong>
        </div>
        <div className="total-breakdown">
          {totals.byTask.map(([task, ms]) => (
            <span key={task} className="total-chip">
              {task}: {formatDuration(ms)}
            </span>
          ))}
        </div>
      </footer>
    </main>
  )
}
