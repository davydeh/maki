# maki v1 Implementation

## Task 1: Scaffold Tauri v2 + React project
- [ ] Create project with npm create tauri-app
- [ ] Add xterm.js and addon dependencies
- [ ] Add portable-pty Rust dependency
- [ ] Register PTY commands in lib.rs
- [ ] Verify it compiles and opens a window

## Task 2: Config parsing (Rust)
- [ ] Write config.rs with maki.yaml structs and parsing
- [ ] Add find_config and get_config Tauri commands

## Task 3: Git status (Rust)
- [ ] Write git.rs with get_git_status command

## Task 4: Types and themes (TypeScript)
- [ ] Write types.ts with all shared interfaces
- [ ] Write themes.ts with dark/light/nord + xterm.js themes

## Task 5: Terminal component (xterm.js)
- [ ] Write TerminalView.tsx with xterm.js + PTY connection
- [ ] Handle spawn, write, resize, exit via Tauri invoke/listen

## Task 6: Tab bar component
- [ ] Write TabBar.tsx with status icons, play/stop toggle, [+] button

## Task 7: Status bar component
- [ ] Write StatusBar.tsx with process counts and git info

## Task 8: App component (wire everything)
- [ ] Write useConfig hook
- [ ] Write App.tsx connecting all components
- [ ] Add keyboard shortcuts (Cmd+T, Cmd+W, Cmd+1-9)
- [ ] Create demo maki.yaml

## Task 9: Tauri window config
- [ ] Set window title, size, identifier

## Task 10: Build, test, polish
- [ ] Verify all features end-to-end
- [ ] Build release .dmg
- [ ] Commit and tag v0.1.0
