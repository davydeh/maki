# maki — Project Dev Terminal

## Problem

Developers working on multiple projects juggle many background processes (dev servers, queues, watchers) and interactive terminals (SSH, Claude, ad-hoc commands) across scattered terminal tabs. There's no unified, visual way to manage a project's dev environment.

## Solution

maki is a standalone macOS desktop application that gives each project a dedicated terminal window with tabs for all its dev processes and shells. It reads a `maki.yaml` config and launches everything in a Ghostty-like interface where every tab is a real, interactive terminal.

## Architecture

### Tech Stack
- **Tauri v2** — Rust backend with native macOS webview
- **React + TypeScript + Vite** — Frontend UI
- **xterm.js** — Terminal emulation for every tab
- **portable-pty** (Rust crate) — PTY allocation and management
- **maki.yaml** — Project config (YAML)

### System Design

```
┌─────────────────────────────────────────────┐
│              macOS Window (Tauri)            │
│  ┌────────────────────────────────────────┐  │
│  │         React UI (webview)             │  │
│  │  ┌──────────────────────────────────┐  │  │
│  │  │  Tab Bar (React components)      │  │  │
│  │  ├──────────────────────────────────┤  │  │
│  │  │  xterm.js Terminal Instance      │  │  │
│  │  │  (one per tab, only active shown)│  │  │
│  │  ├──────────────────────────────────┤  │  │
│  │  │  Status Bar (React component)    │  │  │
│  │  └──────────────────────────────────┘  │  │
│  └────────────────────────────────────────┘  │
│              ↕ Tauri IPC                     │
│  ┌────────────────────────────────────────┐  │
│  │         Rust Backend                   │  │
│  │  ┌─────────┐  ┌─────────┐  ┌───────┐  │  │
│  │  │ PTY Mgr │  │ Config  │  │ Git   │  │  │
│  │  │ (per tab)│  │ Parser  │  │ Status│  │  │
│  │  └─────────┘  └─────────┘  └───────┘  │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
```

### Data Flow

1. **Startup:** Rust backend reads `maki.yaml`, creates PTY for each process/shell
2. **PTY → Frontend:** Rust reads PTY output, sends bytes to frontend via Tauri events
3. **Frontend → PTY:** Keyboard input from xterm.js sent to Rust via Tauri commands
4. **Tab switching:** Frontend shows/hides xterm.js instances; PTYs keep running in background
5. **Process control:** Play/stop buttons call Rust commands that signal the PTY process

### Communication Protocol

- **Rust → Frontend (events):**
  - `pty-output` — raw bytes from a PTY (tab_id, data)
  - `process-state` — state change (tab_id, state, exit_code)
  - `git-status` — branch and dirty state updates

- **Frontend → Rust (commands):**
  - `create_pty` — create a new PTY session
  - `write_pty` — send keyboard input to a PTY
  - `resize_pty` — update PTY dimensions
  - `kill_pty` — stop a PTY process
  - `restart_pty` — stop + start a PTY
  - `get_config` — read maki.yaml
  - `get_git_status` — poll git state

## UI Layout

### Window Structure

```
┌─────────────────────────────────────────────────────────┐
│  maki — myproject          ⎇ main ●                     │  <- title bar (native)
├─────────────────────────────────────────────────────────┤
│  ▶ dev :3000  │  ▶ queue  │  ✕ vite  │  $ shell  │ [+] │  <- tab bar
├─────────────────────────────────────────────────────────┤
│                                                         │
│  $ npm run dev                                          │
│  Server running at http://localhost:3000                │
│  Ready in 1.2s                                          │
│                                                         │
│  GET / 200 in 45ms                                      │  <- xterm.js
│  GET /api/users 200 in 12ms                             │
│  POST /api/auth 201 in 89ms                             │
│                                                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  3 running · 1 errored   .env ✓                         │  <- status bar
└─────────────────────────────────────────────────────────┘
```

### Tab Bar

Each tab shows:
- Status icon: `▶` running (green), `✕` errored (red), `◻` stopped (gray), `$` shell (blue)
- Process name
- Port if detected (`:3000`)
- Play/stop toggle button for process tabs (not shell tabs)
- `[+]` button at the end to create new shell tab

Active tab is highlighted. Errored tabs always show red.

Right-click context menu: Restart, Close, Clear Output

### Status Bar

Single line at bottom: process counts, .env status. Clickable items for quick actions.

### Tab Interactions

- Click tab to switch
- Cmd+T: new shell tab
- Cmd+W: close tab
- Cmd+1-9: switch to tab by number
- Drag tabs to reorder
- Double-click tab to rename

## Config Format

File: `maki.yaml` in project root.

```yaml
name: myproject
theme: dark  # dark, light, nord

processes:
  - name: dev server
    cmd: npm run dev
  - name: queue
    cmd: php artisan queue:work
    autostart: false
  - name: worker
    cmd: node worker.js
    cwd: ./services/worker
    env:
      NODE_ENV: development
    restart: on-failure
    max_restarts: 5

shells:
  - name: shell
  - name: ssh
    cmd: ssh production
```

### Config Resolution
- maki searches CWD and parent directories for `maki.yaml`
- `.env` in the project root is auto-loaded into all process environments
- `MAKI=1` env var is set for all child processes

## Features (v1)

### Process Management
- Start/stop/restart via play/stop button and context menu
- Autostart: processes start on launch unless `autostart: false`
- Restart policies: `never` (default), `on-failure`, `always`
- Exponential backoff for restarts (capped at 30s)
- Graceful shutdown: SIGTERM → 5s → SIGKILL

### Terminal
- Full xterm.js terminal in every tab (process and shell)
- ANSI color support, Unicode, true color
- Mouse support (scrolling, selection, clicking)
- Scrollback buffer (10,000 lines default)
- Text selection and copy (Cmd+C)
- Find in terminal (Cmd+F)

### Environment
- `.env` auto-loading from project root
- Per-process env overrides
- Git branch and dirty state in title bar (polled every 5s)

### Desktop Integration
- Desktop notifications on process crash
- Native macOS window with proper resize/fullscreen
- Cmd+, for preferences
- App icon in dock

### CLI
- `maki` — open maki for current project
- `maki init` — create maki.yaml (smart detection from package.json etc.)
- `maki list` — show configured processes
- `maki --version` / `maki help`

## Themes

Three built-in themes applied to tab bar, status bar, and xterm.js:

- **dark** (default) — Catppuccin Mocha palette
- **light** — Catppuccin Latte palette
- **nord** — Nord palette

## Project Structure

```
maki/
├── src-tauri/              # Rust backend
│   ├── src/
│   │   ├── main.rs         # Tauri app setup
│   │   ├── pty.rs          # PTY management
│   │   ├── config.rs       # maki.yaml parsing
│   │   ├── git.rs          # Git status polling
│   │   └── commands.rs     # Tauri command handlers
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # React frontend
│   ├── App.tsx             # Root component
│   ├── components/
│   │   ├── TabBar.tsx      # Tab bar with process controls
│   │   ├── Terminal.tsx    # xterm.js wrapper
│   │   └── StatusBar.tsx   # Bottom status bar
│   ├── hooks/
│   │   ├── usePty.ts       # PTY communication hook
│   │   └── useConfig.ts    # Config loading hook
│   ├── styles/
│   │   └── themes.ts       # Theme definitions
│   └── main.tsx            # Entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
└── maki.yaml               # Demo config
```

## v2+ Roadmap (out of scope for v1)

- Split panes (horizontal/vertical terminal splits)
- Multiple projects in one window (workspace tabs)
- Plugin system for custom tab types
- Remote SSH terminal management
- Integrated log search across all tabs
- Session persistence (restore tabs on relaunch)
