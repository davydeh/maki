import type { MakiConfig, Tab } from "./types";

let nextId = 0;

export function genTabId() {
  return `tab-${nextId++}`;
}

export function createTabsFromConfig(config: MakiConfig, projectRoot: string): Tab[] {
  const shell = "/bin/zsh";
  const shellTabs: Tab[] = [];
  const processTabs: Tab[] = [];

  const configuredShells = config.shells ?? [];
  const defaultShellCount = Math.max(2, configuredShells.length);

  for (let i = 0; i < defaultShellCount; i++) {
    const sh = configuredShells[i];
    const shellCommand = sh?.cmd || shell;
    shellTabs.push({
      id: genTabId(),
      name: sh?.name || `shell${i > 0 ? ` ${i + 1}` : ""}`,
      type: "shell",
      cmd: shellCommand,
      args: [],
      status: "running",
      autostart: i === 0,
      workspacePath: projectRoot,
      cwd: projectRoot,
    });
  }

  for (const proc of config.processes) {
    processTabs.push({
      id: genTabId(),
      name: proc.name,
      type: "process",
      cmd: shell,
      args: ["-c", proc.cmd],
      status: proc.autostart ? "running" : "stopped",
      autostart: proc.autostart,
      workspacePath: projectRoot,
      cwd: proc.cwd || projectRoot,
      env: proc.env,
    });
  }

  return [...shellTabs, ...processTabs];
}

export function activateTab(tabs: Tab[], id: string): Tab[] {
  let changed = false;
  const nextTabs = tabs.map((tab) => {
    if (tab.id !== id || tab.type !== "shell" || tab.autostart) {
      return tab;
    }

    changed = true;
    return {
      ...tab,
      autostart: true,
    };
  });

  return changed ? nextTabs : tabs;
}
