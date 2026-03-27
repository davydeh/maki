# Releasing maki

## Prerequisites

- Push access to `davydeh/maki` on GitHub
- All changes merged to `main`

## Steps

### 1. Merge your feature branch

```bash
cd /Users/pcil/projects/maki
git checkout main
git pull origin main
git merge workspace-flow-v0.2
```

Resolve conflicts if any, then continue.

### 2. Verify the build locally (optional)

```bash
npm test
npm run tauri build
```

The `.app` and `.dmg` will be in `src-tauri/target/release/bundle/`.

### 3. Tag the release

Use semantic versioning: `v<major>.<minor>.<patch>`

```bash
git tag v0.2.0
```

To include a message:

```bash
git tag -a v0.2.0 -m "v0.2.0: workspace flow, picker, wizard, Ghostty-style tabs"
```

### 4. Push main and the tag

```bash
git push origin main
git push origin v0.2.0
```

### 5. Wait for GitHub Actions

The `release.yml` workflow triggers on the `v*` tag push. It will:

1. Run frontend tests
2. Build the macOS `.app` and `.dmg` via `tauri-action`
3. Create a **draft** GitHub Release with the `.dmg` attached

Monitor progress at: https://github.com/davydeh/maki/actions

### 6. Publish the release

1. Go to https://github.com/davydeh/maki/releases
2. Find the draft release for your tag
3. Edit the release notes if needed
4. Click **Publish release**

### 7. Share with teammates

Send them the link to the release page. They download the `.dmg`, open it, and drag maki to Applications.

First launch on a teammate's machine: right-click the app > Open (bypasses Gatekeeper for unsigned apps).

## Version bumping

Update the version in these files before tagging:

- `package.json` — `"version": "0.2.0"`
- `src-tauri/tauri.conf.json` — `"version": "0.2.0"`
- `src-tauri/Cargo.toml` — `version = "0.2.0"`

## Hotfix releases

If you need to patch a released version:

```bash
git checkout main
# make your fix, commit
git tag v0.2.1
git push origin main v0.2.1
```
