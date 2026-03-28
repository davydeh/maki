# Settings Page Design

## Problem

No way to edit maki.yaml from within the app. Users must manually edit YAML to change commands, themes, or settings. Need an in-app settings UI.

## Solution

Full-screen settings overlay (Cmd+,) with sidebar navigation and two sections: Commands and Theme.

## Access

- **Open:** Cmd+, or native menu item
- **Close:** Escape key or a back/close button
- **Renders as:** Full-screen overlay replacing the workspace view (terminals keep running underneath)

## Layout

Sidebar navigation on the left (Commands, Theme) + centered content area with `max-width: 640px`.

```
┌──────────────────────────────────────────────┐
│  Settings (Cmd+,)                        ✕   │
├────────┬─────────────────────────────────────┤
│        │         (centered, max 640px)       │
│ Cmds   │  Commands              + Add command│
│ Theme  │  ┌─────────────────────────────────┐│
│        │  │ ▶ dev server    npm run dev    🗑 ││
│        │  │   npm run dev   ◉ starts auto    ││
│        │  ├─────────────────────────────────┤│
│        │  │ ▶ storybook     npm run story  🗑 ││
│        │  ├─────────────────────────────────┤│
│        │  │ ▶ icons         npm run icons  🗑 ││
│        │  └─────────────────────────────────┘│
│        │                    [Save & restart]  │
└────────┴─────────────────────────────────────┘
```

## Commands Section

### List View (collapsed)

Each command is a two-line row with a bottom border separator:
- **Line 1:** Terminal icon (lucide) + **name** (bold) + command text (muted, right-aligned) + delete icon (lucide Trash2, red, right edge)
- **Line 2:** Command text (muted) + "starts automatically" badge (green dot + text) if autostart is on
- Click anywhere on the row to expand for editing

### Edit View (expanded)

When a row is clicked, it expands in-place to show two inline inputs side by side:
- **Row 1:** Name input + Command input (both fill available width, ~40/60 split)
- **Row 2:** "Start automatically" toggle (green checkmark + text, clickable) + delete icon
- Other rows remain collapsed below
- Click the row header again to collapse

### Add Command

"+ Add command" link at the top-right of the content area. Appends a new empty row in expanded/edit state.

### Delete Command

Trash icon on each row (collapsed and expanded). Click to remove immediately (no confirmation needed since Save hasn't been pressed yet).

## Theme Section

### Built-in Themes

Flat row list, one row per theme:
- Color swatch (20x20 rounded square showing the theme's bg color) + theme name + "Active" badge on the selected one
- Click a row to select it

Three built-in: Dark (catppuccin mocha), Light (catppuccin latte), Nord.

### Theme Import

Two dashed-border buttons below the theme list:
- "Import from iTerm2..." — opens file picker for `.itermcolors` files
- "Import from Ghostty..." — opens file picker for Ghostty theme files

Both parse the file and add a new custom theme entry. The imported theme appears in the list and can be selected.

**iTerm2 format:** XML plist with keys like "Ansi 0 Color", "Background Color", etc. Each color has Red/Green/Blue/Alpha float components.

**Ghostty format:** Key-value text file with `palette = N=#hexcolor` entries, `background`, `foreground`, `cursor-color`.

Imported themes are stored in maki.yaml under a `custom_themes` key:
```yaml
theme: my-imported-theme
custom_themes:
  my-imported-theme:
    bg: "#282c34"
    fg: "#abb2bf"
    # ... full Theme fields
```

## Save Behavior

- "Save & restart" button at the bottom-right
- Writes updated config to maki.yaml
- Stops and restarts any running processes whose config changed
- Theme changes apply immediately (no restart needed)
- Escape without saving discards all changes

## Files to Create/Modify

| File | Change |
|------|--------|
| New: `src/components/SettingsView.tsx` | Settings page component (sidebar + sections) |
| New: `src-tauri/src/theme_import.rs` | Parse iTerm2 .itermcolors and Ghostty theme files |
| Modify: `src/App.tsx` | Cmd+, handler, settings open/close state, render overlay |
| Modify: `src/themes.ts` | Support custom themes from config, merge with built-ins |
| Modify: `src-tauri/src/config.rs` | Add `custom_themes` field to Config struct |
| Modify: `src-tauri/src/lib.rs` | Register theme import commands |
| Modify: `src/types.ts` | Add settings-related types |
| Modify: `src/styles.css` | Settings page styles |

## Keyboard Shortcuts

- **Cmd+,** — open settings (register in App.tsx keydown handler + native menu)
- **Escape** — close settings (return to workspace)
