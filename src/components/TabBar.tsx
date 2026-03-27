import { useState, Fragment } from "react";
import { Plus } from "lucide-react";
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
  const shells = tabs.filter((t) => t.type === "shell");
  const commands = tabs.filter((t) => t.type === "process");

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        backgroundColor: theme.tabBarBg,
        userSelect: "none",
      }}
    >
      {/* Row 1: Shell tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: "38px",
          padding: "0 8px",
          gap: "2px",
          borderBottom: `1px solid ${theme.border}`,
        }}
        data-tauri-drag-region
      >
        {shells.map((tab) => (
          <ShellTab
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            theme={theme}
            onTabClick={onTabClick}
            onTabClose={onTabClose}
          />
        ))}

        <button
          onClick={onNewTab}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "28px",
            height: "28px",
            background: "none",
            border: "none",
            color: theme.tabFg,
            cursor: "pointer",
            borderRadius: "6px",
            opacity: 0.4,
            fontSize: "14px",
          }}
          title="New shell (Cmd+T)"
        >
          <Plus size={15} />
        </button>

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
            opacity: 0.4,
          }}
          title="Open Folder... (Cmd+O)"
        >
          Open Folder...
        </button>
      </div>

      {/* Row 2: Command bookmarks bar */}
      {commands.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            height: "28px",
            padding: "0 8px",
            gap: "0",
            borderBottom: `1px solid ${theme.border}`,
            background: theme.activeTabBg,
            fontSize: "12px",
          }}
        >
          {commands.map((tab, i) => (
            <Fragment key={tab.id}>
              {i > 0 && (
                <span
                  style={{
                    width: "1px",
                    height: "12px",
                    background: theme.border,
                    flexShrink: 0,
                  }}
                />
              )}
              <CommandBookmark
                tab={tab}
                isActive={tab.id === activeTabId}
                theme={theme}
                onTabClick={onTabClick}
                onToggleProcess={onToggleProcess}
              />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}

/* Shell tab — browser-tab style with >_ prefix */
function ShellTab({
  tab,
  isActive,
  theme,
  onTabClick,
  onTabClose,
}: {
  tab: Tab;
  isActive: boolean;
  theme: Theme;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
}) {
  return (
    <div
      onClick={() => onTabClick(tab.id)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "5px 14px",
        minWidth: "100px",
        maxWidth: "220px",
        borderRadius: "8px 8px 0 0",
        backgroundColor: isActive ? theme.activeTabBg : "transparent",
        color: isActive ? theme.activeTabFg : theme.tabFg,
        cursor: "pointer",
        fontSize: "13px",
        fontWeight: isActive ? 700 : 400,
        transition: "background-color 100ms ease",
      }}
    >
      <span
        style={{
          fontSize: "12px",
          opacity: isActive ? 0.7 : 0.4,
          flexShrink: 0,
          fontFamily: '"SF Mono", Menlo, monospace',
        }}
      >
        &gt;_
      </span>
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
            opacity: 0.7,
          }}
          title="Close (Cmd+W)"
        >
          ×
        </button>
      )}
    </div>
  );
}

/* Command bookmark — compact with pipe separators */
function CommandBookmark({
  tab,
  isActive,
  theme,
  onTabClick,
  onToggleProcess,
}: {
  tab: Tab;
  isActive: boolean;
  theme: Theme;
  onTabClick: (id: string) => void;
  onToggleProcess: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  const isRunning = tab.status === "running";
  const isErrored = tab.status === "errored";

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
        gap: "5px",
        padding: "2px 10px",
        borderRadius: "4px",
        color: isActive ? theme.activeTabFg : theme.tabFg,
        cursor: "pointer",
        fontWeight: isActive ? 700 : 400,
        transition: "background-color 100ms ease",
      }}
    >
      {hovered ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleProcess(tab.id);
          }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "14px",
            height: "14px",
            padding: 0,
            border: `1px solid ${theme.stopped}`,
            borderRadius: "3px",
            background: "none",
            color: isRunning ? theme.stopped : theme.running,
            cursor: "pointer",
            fontSize: "7px",
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
            display: "inline-block",
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
      )}
      <span>{tab.name}</span>
    </div>
  );
}
