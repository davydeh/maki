import {
  useState,
  useCallback,
  useEffect,
  type CSSProperties,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ConfigWizardView } from "./components/ConfigWizardView";
import { ProjectPickerView } from "./components/ProjectPickerView";
import { StatusBar } from "./components/StatusBar";
import { TabBar, CommandBar, CommandLauncher } from "./components/TabBar";
import { TerminalView } from "./components/TerminalView";
import { useWorkspaceSession } from "./hooks/useWorkspaceSession";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getTheme, type Theme } from "./themes";
import type { GitStatus, LoadedWorkspaceConfig, MakiConfig, Tab } from "./types";

let nextId = 0;

function genId() {
  return `tab-${nextId++}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createShellVars(theme: Theme): CSSProperties {
  return {
    "--shell-bg": theme.bg,
    "--shell-fg": theme.fg,
    "--shell-surface": theme.tabBarBg,
    "--shell-surface-strong": theme.activeTabBg,
    "--shell-muted": theme.statusBarFg,
    "--shell-accent": theme.accent,
    "--shell-border": theme.border,
    "--shell-danger": theme.errored,
  } as CSSProperties;
}

function createTabsFromConfig(config: MakiConfig, projectRoot: string): Tab[] {
  const shell = "/bin/zsh";
  const shellTabs: Tab[] = [];
  const processTabs: Tab[] = [];

  // Always start with 2 default shell tabs
  const configuredShells = config.shells ?? [];
  const defaultShellCount = Math.max(2, configuredShells.length);

  for (let i = 0; i < defaultShellCount; i++) {
    const sh = configuredShells[i];
    const shellCommand = sh?.cmd || shell;
    shellTabs.push({
      id: genId(),
      name: sh?.name || `shell${i > 0 ? ` ${i + 1}` : ""}`,
      type: "shell",
      cmd: shellCommand,
      args: [],
      status: "running",
      autostart: true,
      workspacePath: projectRoot,
      cwd: projectRoot,
    });
  }

  for (const proc of config.processes) {
    processTabs.push({
      id: genId(),
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

  // Shells first, then processes
  return [...shellTabs, ...processTabs];
}

interface ShellViewProps {
  theme: Theme;
  title: string;
  description: string;
  children?: ReactNode;
}

function ShellView({ theme, title, description, children }: ShellViewProps) {
  return (
    <div className="shell-screen" style={createShellVars(theme)}>
      <div className="shell-panel">
        <div className="shell-copy">
          <span className="shell-kicker">maki</span>
          <h1 className="shell-title">{title}</h1>
          <p className="shell-subtitle">{description}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function App() {
  const session = useWorkspaceSession();
  const projectRoot =
    session.screen === "workspace" && session.project ? session.project.path : "";
  const [workspaceConfig, setWorkspaceConfig] = useState<LoadedWorkspaceConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);
  const [commandLauncherOpen, setCommandLauncherOpen] = useState(false);
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null);
  const theme = getTheme(workspaceConfig?.config.theme);

  useEffect(() => {
    if (session.screen !== "workspace" || !projectRoot) {
      setWorkspaceConfig(null);
      setConfigError(null);
      setTabs([]);
      setActiveTabId("");
      setGitStatus(null);
      return;
    }

    let cancelled = false;

    setWorkspaceConfig(null);
    setConfigError(null);
    setTabs([]);
    setActiveTabId("");
    setGitStatus(null);

    (async () => {
      try {
        const nextConfig = await invoke<MakiConfig>("get_config", {
          path: `${projectRoot}/maki.yaml`,
        });

        if (!cancelled) {
          const nextTabs = createTabsFromConfig(nextConfig, projectRoot);
          setWorkspaceConfig({
            projectRoot,
            config: nextConfig,
          });
          setTabs(nextTabs);
          setActiveTabId(nextTabs[0]?.id ?? "");
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceConfig(null);
          setConfigError(toErrorMessage(error));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectRoot, session.screen]);

  useEffect(() => {
    if (session.screen !== "workspace" || !projectRoot) {
      return;
    }

    const poll = async () => {
      try {
        const status = await invoke<GitStatus>("get_git_status", { projectRoot });
        setGitStatus(status);
      } catch {
        // Ignore git polling failures for non-repo folders.
      }
    };

    void poll();
    const interval = setInterval(() => {
      void poll();
    }, 5000);

    return () => clearInterval(interval);
  }, [projectRoot, session.screen]);

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

  // Update window title to match active tab name
  useEffect(() => {
    const activeTab = tabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    const title = activeTab.name || workspaceConfig?.config.name || "maki";
    getCurrentWindow().setTitle(title).catch(() => {});
  }, [activeTabId, tabs, workspaceConfig]);

  const handleTabClick = useCallback((id: string) => setActiveTabId(id), []);

  const handleTabClose = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((tab) => tab.id !== id);
        if (activeTabId === id && filtered.length > 0) {
          setActiveTabId(filtered[filtered.length - 1].id);
        }
        return filtered;
      });
    },
    [activeTabId]
  );

  const handleRunCommand = useCallback((id: string) => {
    let focusId: string | null = null;

    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (!tab) return prev;

      // Already running — just focus it
      if (tab.status === "running") {
        focusId = tab.id;
        return prev;
      }

      // Restart: new ID forces TerminalView remount with fresh PTY
      const newId = genId();
      focusId = newId;
      const updated = {
        ...tab,
        id: newId,
        status: "running" as const,
        sessionId: undefined,
        autostart: true, // must be true so PTY spawns on mount
        transient: !tab.autostart,
      };

      if (tab.autostart) {
        // Autostart commands: replace in-place to preserve position
        return prev.map((t) => (t.id === id ? updated : t));
      }

      // Transient (one-off) commands: remove and append at end
      const without = prev.filter((t) => t.id !== id);
      return [...without, updated];
    });

    // Set active tab outside the updater — nested setStates can be dropped
    if (focusId) {
      setActiveTabId(focusId);
    }
  }, []);

  const handleStopCommand = useCallback((id: string) => {
    setTabs((prev) => {
      const tab = prev.find((t) => t.id === id);
      if (!tab) return prev;

      if (tab.status === "running" && tab.sessionId !== undefined) {
        void invoke("kill_pty", { sessionId: tab.sessionId });
      }

      return prev.map((t) =>
        t.id === id ? { ...t, status: "stopped" as const, sessionId: undefined } : t
      );
    });
  }, []);

  const handleNewTab = useCallback(() => {
    const id = genId();
    const tab: Tab = {
      id,
      name: "shell",
      type: "shell",
      cmd: "/bin/zsh",
      args: [],
      status: "running",
      autostart: true,
      workspacePath: projectRoot,
      cwd: projectRoot,
    };

    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
  }, [projectRoot]);

  const handleOpenFolder = useCallback(() => {
    void session.openFolder();
  }, [session]);

  const handleSessionCreated = useCallback((tabId: string, sessionId: number) => {
    setTabs((prev) =>
      prev.map((tab) => (tab.id === tabId ? { ...tab, sessionId, status: "running" } : tab))
    );
  }, []);

  const handleExit = useCallback((tabId: string, exitCode: number) => {
    setTabs((prev) =>
      prev.map((tab) =>
        tab.id === tabId
          ? { ...tab, status: exitCode === 0 ? "stopped" : "errored", exitCode }
          : tab
      )
    );

    // Auto-remove transient (one-off) commands 10s after they exit
    setTimeout(() => {
      setTabs((prev) => {
        const tab = prev.find((t) => t.id === tabId);
        if (tab?.transient && tab.status !== "running") {
          return prev.map((t) =>
            t.id === tabId ? { ...t, transient: false } : t
          );
        }
        return prev;
      });
    }, 10_000);
  }, []);

  useEffect(() => {
    if (session.screen !== "workspace") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey && event.key === "t") {
        event.preventDefault();
        handleNewTab();
      }

      if (event.metaKey && event.key === "w") {
        event.preventDefault();
        if (activeTabId && tabs.length > 1) {
          handleTabClose(activeTabId);
        }
      }

      if (event.metaKey && event.key === "o") {
        event.preventDefault();
        handleOpenFolder();
      }

      if (event.metaKey && event.key.toLowerCase() === "p") {
        event.preventDefault();
        setCommandLauncherOpen(true);
      }

      if (event.metaKey && event.key >= "1" && event.key <= "9") {
        event.preventDefault();
        const shellTabs = tabs.filter((t) => t.type === "shell");
        const index = parseInt(event.key, 10) - 1;
        if (index < shellTabs.length) {
          setActiveTabId(shellTabs[index].id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    // Listen for native menu actions
    let unlistenMenu: (() => void) | null = null;
    listen<string>("menu-action", (event) => {
      switch (event.payload) {
        case "new-tab":
          handleNewTab();
          break;
        case "close-tab":
          if (activeTabId && tabs.length > 1) {
            handleTabClose(activeTabId);
          }
          break;
        case "new-window":
          handleOpenFolder();
          break;
      }
    }).then((fn) => { unlistenMenu = fn; });

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      unlistenMenu?.();
    };
  }, [activeTabId, handleNewTab, handleOpenFolder, handleTabClose, session.screen, tabs]);

  if (session.screen === "picker" || session.screen === "invalid") {
    return (
      <div style={createShellVars(theme)}>
        <ProjectPickerView
          recentProjects={session.appState.recent_projects}
          restoreError={session.restoreError}
          onOpenFolder={session.openFolder}
          onSelectRecentProject={session.openRecentProject}
        />
      </div>
    );
  }

  if (session.screen === "wizard") {
    if (session.project && session.wizardDraft) {
      return (
        <div style={createShellVars(theme)}>
          <ConfigWizardView
            project={session.project}
            restoreError={session.restoreError}
            wizardDraft={session.wizardDraft}
            wizardPreview={session.wizardPreview}
            wizardPreviewError={session.wizardPreviewError}
            wizardPreviewPending={session.wizardPreviewPending}
            wizardPreviewDirty={session.wizardPreviewDirty}
            wizardSavePending={session.wizardSavePending}
            onAddCommand={session.addWizardCommand}
            onUpdateCommand={session.updateWizardCommand}
            onRefreshPreview={session.refreshWizardPreview}
            onSave={session.saveWizardConfig}
            onOpenFolder={session.openFolder}
          />
        </div>
      );
    }

    return (
      <ShellView
        theme={theme}
        title={session.project ? `Set Up ${session.project.name}` : "Set Up A Workspace"}
        description="Preparing the workspace configuration wizard."
      >
        {session.restoreError && (
          <div className="shell-error-banner" role="alert">
            {session.restoreError}
          </div>
        )}
        {session.project && (
          <div className="shell-section">
            <h2 className="shell-section-title">Selected Project</h2>
            <div className="shell-field">{session.project.path}</div>
          </div>
        )}
        <div className="shell-actions">
          <button
            type="button"
            className="shell-button"
            onClick={() => {
              void session.openFolder();
            }}
          >
            Open Folder...
          </button>
        </div>
      </ShellView>
    );
  }

  if (session.screen !== "workspace") {
    return (
      <ShellView
        theme={theme}
        title="Restoring Workspace"
        description="Checking the last project and binding the window."
      />
    );
  }

  if (configError) {
    return (
      <ShellView
        theme={theme}
        title="Unable To Load Workspace"
        description="The project is bound, but maki could not load its config."
      >
        <div className="shell-error-banner" role="alert">
          {configError}
        </div>
      </ShellView>
    );
  }

  if (!workspaceConfig) {
    return (
      <ShellView
        theme={theme}
        title="Loading Workspace"
        description={
          session.project
            ? `Opening ${session.project.name} and restoring tabs.`
            : "Restoring tabs and terminal state."
        }
      />
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        backgroundColor: theme.bg,
      }}
    >
      {/* Title bar text — left-aligned, sits in the native transparent title bar area */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: "28px",
          paddingLeft: "72px",
          backgroundColor: theme.bg,
          color: theme.tabFg,
          fontSize: "13px",
          fontWeight: 500,
          userSelect: "none",
          WebkitUserSelect: "none",
          flexShrink: 0,
        }}
        data-tauri-drag-region
      >
        {tabs.find((t) => t.id === activeTabId)?.name ||
          workspaceConfig.config.name ||
          "maki"}
      </div>

      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        theme={theme}
        projectName={workspaceConfig.config.name || projectRoot.split("/").pop() || "shell"}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onOpenFolder={handleOpenFolder}
        onNewTab={handleNewTab}
      />

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {tabs.map((tab) => (
          <TerminalView
            key={tab.id}
            tabId={tab.id}
            cmd={tab.cmd}
            args={tab.args}
            cwd={tab.cwd || tab.workspacePath || projectRoot}
            env={tab.env}
            theme={theme}
            autostart={tab.autostart}
            active={tab.id === activeTabId}
            workspaceActive={session.screen === "workspace"}
            onSessionCreated={handleSessionCreated}
            onExit={handleExit}
          />
        ))}
      </div>

      <CommandBar
        commands={tabs.filter((tab) => tab.type === "process" && (tab.autostart || tab.transient))}
        hasOneOffCommands={tabs.some((tab) => tab.type === "process" && !tab.autostart)}
        activeTabId={activeTabId}
        theme={theme}
        onFocusCommand={handleTabClick}
        onRunCommand={handleRunCommand}
        onStopCommand={handleStopCommand}
        onOpenLauncher={() => setCommandLauncherOpen(true)}
      />

      <CommandLauncher
        open={commandLauncherOpen}
        commands={tabs.filter((tab) => tab.type === "process" && !tab.autostart)}
        theme={theme}
        onClose={() => setCommandLauncherOpen(false)}
        onRunCommand={handleRunCommand}
      />

      <StatusBar
        tabs={tabs}
        gitStatus={gitStatus}
        projectPath={projectRoot}
        theme={theme}
        availableUpdate={availableUpdate}
      />
    </div>
  );
}
