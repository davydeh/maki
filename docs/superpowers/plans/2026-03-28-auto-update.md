# Auto-Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add silent update checking on launch with a clickable status bar notification that downloads, installs, and relaunches.

**Architecture:** `tauri-plugin-updater` checks a GitHub releases endpoint on app start. The frontend holds the update object in state and passes it to StatusBar, which renders a clickable "Update available" indicator. On click, it downloads, installs, and relaunches via the plugin's JS API.

**Tech Stack:** tauri-plugin-updater (Rust + JS), @tauri-apps/plugin-process (relaunch), GitHub Releases as update endpoint.

**Spec:** `docs/superpowers/specs/2026-03-28-auto-update-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-updater` dependency |
| `src-tauri/src/lib.rs` | Register updater plugin |
| `src-tauri/tauri.conf.json` | Updater config: pubkey, endpoint, createUpdaterArtifacts |
| `src-tauri/capabilities/default.json` | Add `updater:default` permission |
| `package.json` | Add `@tauri-apps/plugin-updater`, `@tauri-apps/plugin-process` |
| `src/App.tsx` | Check for updates on workspace mount, pass to StatusBar |
| `src/components/StatusBar.tsx` | Render clickable update notification |
| `.github/workflows/release.yml` | Add signing key env vars |

---

### Task 1: Install Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `package.json` / `package-lock.json`

- [ ] **Step 1: Add Rust dependency**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
tauri-plugin-updater = "2"
```

- [ ] **Step 2: Install frontend packages**

```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock package.json package-lock.json
git commit -m "chore: add tauri-plugin-updater and process dependencies"
```

---

### Task 2: Register Updater Plugin in Rust

**Files:**
- Modify: `src-tauri/src/lib.rs:12-14`

- [ ] **Step 1: Add plugin registration**

In `src-tauri/src/lib.rs`, add the updater plugin to the builder chain. Find the existing `.plugin(tauri_plugin_dialog::init())` line and add the updater after it:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(pty::PtyState::default())
```

- [ ] **Step 2: Verify Rust compiles**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: `Finished` with no errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: register tauri-plugin-updater"
```

---

### Task 3: Configure Updater in Tauri Config

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/capabilities/default.json`

The updater requires a public key and endpoint in `tauri.conf.json`, plus a capability permission. We'll use a **placeholder public key** for now — the user will replace it after generating their keypair.

- [ ] **Step 1: Add updater config to tauri.conf.json**

Add `createUpdaterArtifacts` inside the existing `bundle` object, and add a new top-level `plugins` key. The final file should look like:

```json
{
  "$schema": "../node_modules/@tauri-apps/cli/config.schema.json",
  "productName": "maki",
  "version": "0.2.0",
  "identifier": "com.davydeh.maki",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:1420",
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build"
  },
  "app": {
    "windows": [
      {
        "title": "maki",
        "width": 900,
        "height": 600,
        "minWidth": 500,
        "minHeight": 300,
        "resizable": true,
        "fullscreen": false
      }
    ],
    "security": {
      "csp": null
    }
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "createUpdaterArtifacts": "v2Compatible",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  },
  "plugins": {
    "updater": {
      "pubkey": "REPLACE_WITH_PUBLIC_KEY",
      "endpoints": [
        "https://github.com/davydeh/maki/releases/latest/download/latest.json"
      ]
    }
  }
}
```

- [ ] **Step 2: Add updater permission to capabilities**

Edit `src-tauri/capabilities/default.json` to add `"updater:default"`:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "enables the default permissions",
  "windows": [
    "main",
    "project-*"
  ],
  "permissions": [
    "core:default",
    "updater:default"
  ]
}
```

- [ ] **Step 3: Verify Rust compiles**

```bash
cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: `Finished` with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json src-tauri/capabilities/default.json
git commit -m "feat: configure updater endpoint and permissions"
```

---

### Task 4: Add Update Check to App.tsx

**Files:**
- Modify: `src/App.tsx:108-118` (state declarations) and `src/App.tsx:534` (StatusBar props)

- [ ] **Step 1: Add update state and check effect**

In `src/App.tsx`, add the import at the top with the other imports:

```typescript
import { check, type Update } from "@tauri-apps/plugin-updater";
```

In the `App` component, after the existing state declarations (after `const [commandLauncherOpen, setCommandLauncherOpen] = useState(false);`), add:

```typescript
const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
```

After the existing `useEffect` blocks (the git polling one is a good spot — after the `setInterval` effect), add a new effect:

```typescript
// Check for updates once when workspace loads
useEffect(() => {
  if (session.screen !== "workspace") return;

  check()
    .then((update) => {
      if (update?.available) {
        setAvailableUpdate(update);
      }
    })
    .catch(() => {
      // Silent failure — update check is best-effort
    });
}, [session.screen]);
```

- [ ] **Step 2: Pass update to StatusBar**

Find the `<StatusBar` JSX and add the new prop:

```tsx
<StatusBar
  tabs={tabs}
  gitStatus={gitStatus}
  projectPath={projectRoot}
  theme={theme}
  availableUpdate={availableUpdate}
/>
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Error about StatusBar not accepting `availableUpdate` prop (that's correct — we add it in Task 5).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "feat: check for updates on workspace load"
```

---

### Task 5: Show Update Notification in StatusBar

**Files:**
- Modify: `src/components/StatusBar.tsx`

- [ ] **Step 1: Add update prop and relaunch import**

Replace the entire `src/components/StatusBar.tsx` with:

```typescript
import { useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import type { Tab, GitStatus } from "../types";
import type { Theme } from "../themes";

interface StatusBarProps {
  tabs: Tab[];
  gitStatus: GitStatus | null;
  projectPath: string;
  theme: Theme;
  availableUpdate: Update | null;
}

function shortenHome(path: string): string {
  const home = `/Users/${path.split("/")[2] || ""}`;
  return path.startsWith(home) ? "~" + path.slice(home.length) : path;
}

export function StatusBar({ tabs, gitStatus, projectPath, theme, availableUpdate }: StatusBarProps) {
  const [updating, setUpdating] = useState(false);
  const running = tabs.filter((t) => t.status === "running").length;
  const errored = tabs.filter((t) => t.status === "errored").length;
  const stopped = tabs.filter((t) => t.status === "stopped").length;
  const displayPath = shortenHome(projectPath);

  const handleUpdate = async () => {
    if (!availableUpdate || updating) return;
    setUpdating(true);
    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch {
      setUpdating(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: theme.statusBarBg,
        color: theme.statusBarFg,
        height: "24px",
        padding: "0 12px",
        fontSize: "11px",
        borderTop: `1px solid ${theme.border}`,
      }}
    >
      <div style={{ display: "flex", gap: "12px", minWidth: 0 }}>
        {projectPath && (
          <span
            style={{
              maxWidth: "280px",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={projectPath}
          >
            {displayPath}
          </span>
        )}
        {gitStatus?.is_repo && (
          <span>
            ⎇ {gitStatus.branch} {gitStatus.dirty ? "●" : "○"}
          </span>
        )}
      </div>
      <div style={{ display: "flex", gap: "12px" }}>
        {availableUpdate && (
          <span
            onClick={handleUpdate}
            style={{
              color: theme.accent,
              cursor: updating ? "wait" : "pointer",
            }}
            title={updating ? "Installing update..." : "Click to update and restart"}
          >
            {updating ? "Installing..." : `Update available: v${availableUpdate.version}`}
          </span>
        )}
        {running > 0 && (
          <span style={{ color: theme.running }}>{running} running</span>
        )}
        {errored > 0 && (
          <span style={{ color: theme.errored }}>{errored} errored</span>
        )}
        {stopped > 0 && <span>{stopped} stopped</span>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: Clean, no errors.

- [ ] **Step 3: Run tests**

```bash
npx vitest run
```

Expected: All tests pass. (StatusBar tests may need the new prop — if tests fail, add `availableUpdate={null}` to any test that renders StatusBar.)

- [ ] **Step 4: Commit**

```bash
git add src/components/StatusBar.tsx
git commit -m "feat: show clickable update notification in status bar"
```

---

### Task 6: Update CI Workflow for Signing

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add signing env vars to the build step**

In `.github/workflows/release.yml`, add `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` to the build step's `env`:

```yaml
      - name: Build Tauri app
        uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "maki ${{ github.ref_name }}"
          releaseBody: "See the [changelog](https://github.com/davydeh/maki/commits/${{ github.ref_name }}) for details."
          releaseDraft: true
          prerelease: false
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add updater signing keys to release workflow"
```

---

### Task 7: Generate Keypair and Configure Secrets (Manual)

This task is manual — the user must do it themselves.

- [ ] **Step 1: Generate the Tauri signing keypair**

```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/maki.key
```

This outputs:
- A private key file at `~/.tauri/maki.key`
- A public key string printed to stdout (starts with `dW5...`)
- An optional password (press Enter for none, or set one)

- [ ] **Step 2: Add the public key to tauri.conf.json**

Replace `"REPLACE_WITH_PUBLIC_KEY"` in `src-tauri/tauri.conf.json` with the public key string from step 1.

- [ ] **Step 3: Add secrets to GitHub**

Go to https://github.com/davydeh/maki/settings/secrets/actions and add:
- `TAURI_SIGNING_PRIVATE_KEY` — contents of `~/.tauri/maki.key`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — the password (or empty string if none)

- [ ] **Step 4: Commit the public key**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat: add updater public key"
```

---

### Task 8: Release and Verify

- [ ] **Step 1: Bump version**

Update version to `0.3.0` in all three files:
- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

- [ ] **Step 2: Commit, tag, push**

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to 0.3.0"
git tag v0.3.0
git push origin main --tags
```

- [ ] **Step 3: Publish the release**

Once the GitHub Actions workflow finishes, go to https://github.com/davydeh/maki/releases and publish the draft release. Verify it contains:
- `maki_0.3.0_aarch64.dmg`
- `maki.app.tar.gz`
- `maki.app.tar.gz.sig`
- `latest.json`

- [ ] **Step 4: Install and verify auto-update**

Download and install v0.3.0 manually (last time). Then immediately bump to v0.3.1, tag, push, and publish. Open maki — the status bar should show "Update available: v0.3.1". Click it to verify it downloads, installs, and relaunches.
