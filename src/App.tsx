import { useState, useCallback, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TabBar } from "./components/TabBar";
import { TerminalView } from "./components/TerminalView";
import { StatusBar } from "./components/StatusBar";
import { getTheme } from "./themes";
import type { MakiConfig, Tab, GitStatus } from "./types";

let nextId = 0;
function genId() {
  return `tab-${nextId++}`;
}

export default function App() {
  const [config, setConfig] = useState<MakiConfig | null>(null);
  const [projectRoot, setProjectRoot] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState("");
  const [gitStatus, setGitStatus] = useState<GitStatus | null>(null);

  const theme = getTheme(config?.theme);

  // Load config
  useEffect(() => {
    (async () => {
      try {
        const configPath = await invoke<string>("find_config", {});
        const cfg = await invoke<MakiConfig>("get_config", { path: configPath });
        setConfig(cfg);
        setProjectRoot(configPath.replace(/\/maki\.yaml$/, ""));
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  // Initialize tabs from config
  useEffect(() => {
    if (!config || tabs.length > 0) return;

    const shell = "/bin/zsh";
    const newTabs: Tab[] = [];

    for (const proc of config.processes) {
      newTabs.push({
        id: genId(),
        name: proc.name,
        type: "process",
        cmd: shell,
        args: ["-c", proc.cmd],
        status: proc.autostart ? "running" : "stopped",
        autostart: proc.autostart,
        cwd: proc.cwd,
        env: proc.env,
      });
    }

    for (const sh of config.shells) {
      const shCmd = sh.cmd || shell;
      newTabs.push({
        id: genId(),
        name: sh.name,
        type: "shell",
        cmd: shCmd,
        args: [],
        status: "running",
        autostart: true,
      });
    }

    setTabs(newTabs);
    if (newTabs.length > 0) {
      setActiveTabId(newTabs[0].id);
    }
  }, [config]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll git status
  useEffect(() => {
    if (!projectRoot) return;
    const poll = async () => {
      try {
        const status = await invoke<GitStatus>("get_git_status", { projectRoot });
        setGitStatus(status);
      } catch { /* ignore */ }
    };
    poll();
    const interval = setInterval(poll, 5000);
    return () => clearInterval(interval);
  }, [projectRoot]);

  const handleTabClick = useCallback((id: string) => setActiveTabId(id), []);

  const handleTabClose = useCallback(
    (id: string) => {
      setTabs((prev) => {
        const filtered = prev.filter((t) => t.id !== id);
        if (activeTabId === id && filtered.length > 0) {
          setActiveTabId(filtered[filtered.length - 1].id);
        }
        return filtered;
      });
    },
    [activeTabId]
  );

  const handleToggleProcess = useCallback((id: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        if (t.status === "running" && t.sessionId !== undefined) {
          invoke("kill_pty", { sessionId: t.sessionId });
          return { ...t, status: "stopped" as const };
        }
        // Restart will be handled by creating a new terminal
        return t;
      })
    );
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
    };
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(id);
  }, []);

  const handleSessionCreated = useCallback((tabId: string, sessionId: number) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === tabId ? { ...t, sessionId, status: "running" } : t))
    );
  }, []);

  const handleExit = useCallback((tabId: string, exitCode: number) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === tabId
          ? { ...t, status: exitCode === 0 ? "stopped" : "errored", exitCode }
          : t
      )
    );
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === "t") {
        e.preventDefault();
        handleNewTab();
      }
      if (e.metaKey && e.key === "w") {
        e.preventDefault();
        if (activeTabId && tabs.length > 1) handleTabClose(activeTabId);
      }
      if (e.metaKey && e.key >= "1" && e.key <= "9") {
        e.preventDefault();
        const idx = parseInt(e.key) - 1;
        if (idx < tabs.length) setActiveTabId(tabs[idx].id);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, tabs, handleNewTab, handleTabClose]);

  if (error) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: theme.bg,
          color: theme.fg,
          fontFamily: "monospace",
          padding: "40px",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <h1 style={{ fontSize: "24px", marginBottom: "16px" }}>maki</h1>
          <p style={{ color: theme.errored }}>{error}</p>
          <p style={{ color: theme.stopped, marginTop: "12px" }}>
            Run <code>maki init</code> to create a maki.yaml config.
          </p>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: theme.bg,
          color: theme.fg,
        }}
      >
        Loading...
      </div>
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
      <TabBar
        tabs={tabs}
        activeTabId={activeTabId}
        theme={theme}
        onTabClick={handleTabClick}
        onTabClose={handleTabClose}
        onToggleProcess={handleToggleProcess}
        onNewTab={handleNewTab}
      />

      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {tabs.map((tab) => (
          <TerminalView
            key={tab.id}
            tabId={tab.id}
            cmd={tab.cmd}
            args={tab.args}
            cwd={tab.cwd || projectRoot}
            env={tab.env}
            theme={theme}
            autostart={tab.autostart}
            active={tab.id === activeTabId}
            onSessionCreated={handleSessionCreated}
            onExit={handleExit}
          />
        ))}
      </div>

      <StatusBar tabs={tabs} gitStatus={gitStatus} theme={theme} />
    </div>
  );
}
