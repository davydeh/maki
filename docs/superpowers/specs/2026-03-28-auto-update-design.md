# Auto-Update for maki

## Problem

Every release requires manually downloading the .dmg, dragging to /Applications, and running `xattr -cr` to clear Gatekeeper quarantine. This is friction that discourages frequent releases.

## Solution

Use Tauri's built-in updater plugin to check for updates on launch and apply them in-place. After the first manual install, all subsequent updates are seamless — no browser, no drag-and-drop, no xattr.

## How It Works

1. On app launch, maki checks GitHub releases for a newer version
2. If found, a clickable message appears in the status bar: "Update available: vX.Y.Z"
3. User clicks it → maki downloads the update, applies it, and restarts
4. The update is verified using an Ed25519 signature (Tauri's own signing, not Apple codesign)

## Architecture

```
App Launch
  → tauri-plugin-updater checks GitHub endpoint
  → Compares current version against latest.json
  → If newer: StatusBar shows "Update available: vX.Y.Z"
  → User clicks → downloadAndInstall() → relaunch()
```

No custom Rust commands needed. The plugin provides a JS API that handles everything.

## Implementation

### 1. Generate Signing Keypair

Run once locally:
```bash
npx @tauri-apps/cli signer generate -w ~/.tauri/maki.key
```

This produces:
- Private key file (`~/.tauri/maki.key`) — goes into GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY`
- Password (if set) — goes into `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Public key string — goes into `tauri.conf.json`

### 2. Rust Dependencies

`src-tauri/Cargo.toml`:
```toml
tauri-plugin-updater = "2"
```

`src-tauri/src/lib.rs` — register plugin:
```rust
.plugin(tauri_plugin_updater::Builder::new().build())
```

### 3. Tauri Config

`src-tauri/tauri.conf.json` — add updater config inside `bundle`:
```json
{
  "bundle": {
    "createUpdaterArtifacts": "v2Compatible"
  },
  "plugins": {
    "updater": {
      "pubkey": "<PUBLIC_KEY_FROM_STEP_1>",
      "endpoints": [
        "https://github.com/davydeh/maki/releases/latest/download/latest.json"
      ]
    }
  }
}
```

`src-tauri/capabilities/default.json` — add permission:
```json
"permissions": ["core:default", "updater:default"]
```

### 4. Frontend — Check on Launch

`src/App.tsx` — add an effect in the workspace screen that checks once on mount:
```typescript
import { check } from "@tauri-apps/plugin-updater";

// In the workspace rendering branch:
useEffect(() => {
  check().then((update) => {
    if (update) setAvailableUpdate(update);
  }).catch(() => {
    // Silent failure — update check is best-effort
  });
}, []);
```

State: `availableUpdate` holds the update object (or null). Passed to StatusBar.

### 5. Frontend — StatusBar Notification

`src/components/StatusBar.tsx` — when `availableUpdate` is set, show a clickable indicator:
```
~/projects/maki  main ●                    Update available: v0.3.0  2 running
```

On click:
```typescript
import { relaunch } from "@tauri-apps/plugin-process";

async function handleUpdateClick() {
  await availableUpdate.downloadAndInstall();
  await relaunch();
}
```

### 6. CI — Signing in Release Workflow

`.github/workflows/release.yml` — add env vars to the build step:
```yaml
- name: Build Tauri app
  uses: tauri-apps/tauri-action@v0
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
    TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
```

The tauri-action automatically generates `latest.json` and `.sig` files when the signing key is present, and attaches them to the GitHub release.

### 7. NPM Dependency

```bash
npm install @tauri-apps/plugin-updater @tauri-apps/plugin-process
```

## Files Modified

| File | Change |
|------|--------|
| `src-tauri/Cargo.toml` | Add `tauri-plugin-updater` |
| `src-tauri/tauri.conf.json` | Add updater config (pubkey, endpoint) + createUpdaterArtifacts |
| `src-tauri/capabilities/default.json` | Add `updater:default` permission |
| `src-tauri/src/lib.rs` | Register updater plugin |
| `src/App.tsx` | Check for updates on workspace mount |
| `src/components/StatusBar.tsx` | Show clickable update notification |
| `.github/workflows/release.yml` | Add signing key env vars |
| `package.json` | Add @tauri-apps/plugin-updater, @tauri-apps/plugin-process |

## Manual Setup Required

Before the first signed release:
1. Generate keypair with `npx @tauri-apps/cli signer generate`
2. Add private key to GitHub repo secret `TAURI_SIGNING_PRIVATE_KEY`
3. Add password to GitHub repo secret `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (if set)
4. Add public key to `tauri.conf.json`

## Verification

1. Build and release v0.3.0-rc1 with signing enabled
2. Install manually (last time)
3. Tag v0.3.0-rc2, push, let CI build
4. Open maki → status bar should show "Update available: v0.3.0-rc2"
5. Click → app downloads, installs, restarts at new version
