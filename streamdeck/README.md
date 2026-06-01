# Stream Deck setup

TimeTracker is driven by five actions. Each can be triggered three ways — pick
whichever your Stream Deck firmware handles best (custom-protocol support in the
**System → Open** action varies by version).

| Action | Protocol URL | Hotkey |
|--------|--------------|--------|
| New Task | `timetracker://newtask` | F13 |
| End Task | `timetracker://endtask` | F14 |
| Pause Task | `timetracker://pausetask` | F15 |
| Resume Task | `timetracker://resumetask` | F16 |
| Quick View | `timetracker://status` | F17 |

The app must be installed (so `timetracker://` is registered); it launches or
focuses automatically when a button fires.

## Option A — System: Open (recommended)

For each button, add the **System → Open** action and put the protocol URL in
its path field (e.g. `timetracker://newtask`). Pressing it asks Windows to open
the URL, which routes to TimeTracker.

If your Stream Deck rejects a `://` value in that field (some versions validate
it as a file path), use Option B or C.

## Option B — a `.url` shortcut per button

Create a small file `newtask.url` containing:

```
[InternetShortcut]
URL=timetracker://newtask
```

…one per action, then point each button's **System → Open** at the matching
`.url` file. Opens the protocol cleanly with no console window.

## Option C — Hotkey

Use the **Hotkey** action and assign **F13–F17** per the table above. The Stream
Deck emits the virtual key and the app's global hotkeys catch it. The hotkeys are
remappable (and toggleable) under TimeTracker → Settings.

## Importing a profile

A pre-built `.streamDeckProfile` isn't shipped here because the System: Open
behaviour with custom protocols differs across Stream Deck versions, so a blind
profile may not import cleanly on every setup. The quickest reliable path is to
add the five buttons once (Option A/B/C above) and, if you want a reusable file,
**export your own profile** from the Stream Deck app (Profiles → Export).
