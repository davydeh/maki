# maki — Project Dev Terminal

A standalone macOS desktop application that manages project dev processes and shells in a tabbed terminal window. Like Ghostty but purpose-built for dev workflows.

## Foundational Context

This application is a Tauri v2 desktop app with a React frontend and Rust backend. The core packages and versions are:

**Rust Backend (`src-tauri/`):**
- tauri - v2.10.3
- portable-pty - v0.9 (PTY management, NOT tauri-plugin-pty)
- serde / serde_json / serde_yaml - serialization
- anyhow - error handling

**TypeScript Frontend (`src/`):**
- react - v19
- @tauri-apps/api - v2.10.1
- @xterm/xterm - v6.0.0 (terminal emulation)
- @xterm/addon-fit - v0.11.0 (auto-resize terminals)
- @xterm/addon-webgl - v0.19.0 (GPU-accelerated rendering)
- vite - v8 (bundler)
- typescript - v6

## Architecture

```
macOS Window (Tauri)
  ├── React UI (webview)
  │   ├── TabBar.tsx — tab bar with status icons, play/stop, [+]
  │   ├── TerminalView.tsx — xterm.js wrapper, one per tab
  │   └── StatusBar.tsx — git info, process counts
  │
  │   ↕ Tauri IPC (commands + events)
  │
  └── Rust Backend
      ├── pty.rs — PTY session management (spawn/write/resize/kill)
      ├── config.rs — maki.yaml parsing and validation
      └── git.rs — git status polling
```

### Data Flow

- **User types** → xterm.js `onData` → `invoke("write_pty")` → Rust writes to PTY
- **PTY output** → Rust reader thread → `app.emit("pty-output")` → frontend `listen` → `term.write()`
- **Resize** → `FitAddon.fit()` → xterm.js `onResize` → `invoke("resize_pty")` → Rust resizes PTY → kernel sends SIGWINCH

### IPC Protocol

**Frontend → Rust (commands):**
- `spawn_pty` — create PTY session, returns session_id
- `write_pty` — send keyboard input to PTY
- `resize_pty` — update PTY dimensions
- `kill_pty` — stop a PTY process
- `find_config` — locate maki.yaml in CWD or parent dirs
- `get_config` — parse and return maki.yaml
- `get_git_status` — poll git branch and dirty state

**Rust → Frontend (events):**
- `pty-output` — raw bytes from PTY (session_id, data)
- `pty-exit` — process exited (session_id, exit_code)

## Config Format: maki.yaml

```yaml
name: project-name
theme: dark  # dark, light, nord

processes:
  - name: dev server
    cmd: npm run dev
    autostart: true          # default: true
    cwd: ./frontend          # optional working directory
    env:                     # optional env overrides
      NODE_ENV: development
    restart: on-failure      # never (default), on-failure, always
    max_restarts: 5
    restart_delay: 1000      # ms

shells:
  - name: shell              # opens $SHELL
  - name: ssh
    cmd: ssh production      # custom command
```

## Conventions

- Follow existing code patterns. Check sibling files before creating new ones.
- Rust backend: use `#[tauri::command]` for all IPC handlers. Use `Mutex` for shared state. PTY sessions use `unsafe impl Sync` because all fields are behind Mutex.
- React frontend: functional components with hooks. No class components.
- Styles: inline styles using theme colors from `themes.ts`. No CSS framework.
- Every tab is a real terminal (xterm.js + PTY). No distinction between process and shell at the terminal level.

## Key Files

| File | Purpose |
|------|---------|
| `src-tauri/src/pty.rs` | PTY session management — spawn, write, resize, kill |
| `src-tauri/src/config.rs` | maki.yaml parsing with serde |
| `src-tauri/src/git.rs` | Git status command |
| `src-tauri/src/lib.rs` | Tauri app setup, command registration |
| `src/App.tsx` | Root component, tab state, keyboard shortcuts |
| `src/components/TerminalView.tsx` | xterm.js wrapper with PTY connection |
| `src/components/TabBar.tsx` | Tab bar with process controls |
| `src/components/StatusBar.tsx` | Bottom status bar |
| `src/types.ts` | Shared TypeScript interfaces |
| `src/themes.ts` | Dark/light/nord theme definitions |

## Development

```bash
npm run tauri dev     # dev mode with hot reload
npm run tauri build   # release build (.app + .dmg)
```

The Rust backend compiles separately. Frontend changes hot-reload; Rust changes trigger a recompile.

## Rust PTY Notes

- `portable-pty` v0.9 — `MasterPty` is `Send` but NOT `Sync`. Wrap in `Mutex` for Tauri state.
- Always set `TERM=xterm-256color` and `MAKI=1` on spawned processes.
- Reader thread runs in `std::thread::spawn`, emits events via `app.emit()`.
- `take_writer()` can only be called once per PTY — dropping the writer sends EOF.
- Process commands run via `$SHELL -c "cmd"` pattern (shell wraps the command).

## xterm.js Notes

- Use `@xterm/xterm` (scoped package), NOT the deprecated `xterm`.
- Always load `FitAddon` and call `fit()` on mount and resize.
- Load `WebglAddon` with try/catch fallback (not all contexts support WebGL).
- Terminal `onData` sends raw key sequences — forward directly to PTY `write_pty`.
- Set `allowProposedApi: true` for full feature access.

## Tauri v2 Notes

- Commands use `#[tauri::command]` macro. Arguments are auto-deserialized from frontend `invoke()`.
- Events use `app.emit("name", &payload)` with the `Emitter` trait. Frontend listens with `listen()` from `@tauri-apps/api/event`.
- State: `tauri::State<'_, T>` requires `T: Send + Sync + 'static`.
- Window config in `src-tauri/tauri.conf.json`. Identifier: `com.davydeh.maki`.
