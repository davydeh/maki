import { useState } from "react";
import type { Tab } from "../types";
import type { Theme } from "../themes";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  theme: Theme;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onToggleProcess: (id: string) => void;
  onOpenFolder: () => void;
  onNewTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  theme,
  onTabClick,
  onTabClose,
  onToggleProcess,
  onOpenFolder,
  onNewTab,
}: TabBarProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        backgroundColor: theme.tabBarBg,
        height: "36px",
        padding: "0 8px",
        gap: "1px",
        userSelect: "none",
        borderBottom: `1px solid ${theme.border}`,
      }}
      data-tauri-drag-region
    >
      {tabs.map((tab) => (
        <TabItem
          key={tab.id}
          tab={tab}
          isActive={tab.id === activeTabId}
          theme={theme}
          onTabClick={onTabClick}
          onTabClose={onTabClose}
          onToggleProcess={onToggleProcess}
        />
      ))}

      <div style={{ flex: 1 }} data-tauri-drag-region />

      <button
        onClick={onOpenFolder}
        style={{
          background: "none",
          border: "none",
          color: theme.tabFg,
          cursor: "pointer",
          fontSize: "11px",
          padding: "4px 8px",
          lineHeight: 1,
          opacity: 0.7,
        }}
        title="Open Folder... (Cmd+O)"
      >
        Open Folder...
      </button>

      <button
        onClick={onNewTab}
        style={{
          background: "none",
          border: "none",
          color: theme.tabFg,
          cursor: "pointer",
          fontSize: "16px",
          padding: "4px 8px",
          lineHeight: 1,
          opacity: 0.7,
        }}
        title="New tab (Cmd+T)"
      >
        +
      </button>
    </div>
  );
}

function TabItem({
  tab,
  isActive,
  theme,
  onTabClick,
  onTabClose,
  onToggleProcess,
}: {
  tab: Tab;
  isActive: boolean;
  theme: Theme;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onToggleProcess: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const isShell = tab.type === "shell";
  const isRunning = tab.status === "running";
  const isErrored = tab.status === "errored";

  // Status dot color
  const dotColor = isRunning
    ? theme.running
    : isErrored
    ? theme.errored
    : theme.stopped;

  return (
    <div
      onClick={() => onTabClick(tab.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "7px",
        padding: "4px 14px",
        minWidth: "100px",
        borderRadius: "6px",
        backgroundColor: isActive ? theme.activeTabBg : "transparent",
        color: isActive ? theme.activeTabFg : theme.tabFg,
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: isActive ? 600 : 400,
        transition: "background-color 100ms ease",
      }}
    >
      {/* Status indicator: dot normally, action icon on hover for processes */}
      {!isShell && hovered && (isRunning || isErrored) ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleProcess(tab.id);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "16px",
            height: "16px",
            padding: 0,
            border: `1px solid ${theme.stopped}`,
            borderRadius: "3px",
            background: "none",
            color: isRunning ? theme.stopped : theme.running,
            cursor: "pointer",
            fontSize: "8px",
            lineHeight: 1,
            flexShrink: 0,
          }}
          title={isRunning ? "Stop" : "Start"}
        >
          {isRunning ? "■" : "▶"}
        </button>
      ) : (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: isShell ? "auto" : "7px",
            height: isShell ? "auto" : "7px",
            borderRadius: "50%",
            backgroundColor: isShell ? "transparent" : dotColor,
            color: isShell ? theme.shell : undefined,
            fontSize: isShell ? "11px" : undefined,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {isShell ? "$" : ""}
        </span>
      )}

      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {tab.name}
      </span>

      {isActive && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTabClose(tab.id);
          }}
          style={{
            background: "none",
            border: "none",
            color: theme.stopped,
            cursor: "pointer",
            fontSize: "14px",
            padding: "0 2px",
            lineHeight: 1,
            marginLeft: "auto",
            flexShrink: 0,
          }}
          title="Close (Cmd+W)"
        >
          ×
        </button>
      )}
    </div>
  );
}
