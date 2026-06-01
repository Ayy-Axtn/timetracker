import { TodaysLog } from './log/TodaysLog'
import './log/log.css'

// The Today's Log window: the daily record of tracked blocks, editable inline,
// with back-date / merge / split / delete operations and Autotask-ready copy.
export default function App(): React.JSX.Element {
  return <TodaysLog />
}
