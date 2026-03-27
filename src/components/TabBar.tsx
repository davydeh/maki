import { useState, useRef, useEffect, Fragment } from "react";
import { Plus, FolderOpen } from "lucide-react";
import type { Tab } from "../types";
import type { Theme } from "../themes";

interface TabBarProps {
  tabs: Tab[];
  activeTabId: string;
  theme: Theme;
  projectName: string;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
  onOpenFolder: () => void;
  onNewTab: () => void;
}

export function TabBar({
  tabs,
  activeTabId,
  theme,
  projectName,
  onTabClick,
  onTabClose,
  onOpenFolder,
  onNewTab,
}: TabBarProps) {
  const shells = tabs.filter((t) => t.type === "shell");

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        margin: "0 4px 12px 4px",
        borderRadius: "999px",
        height: "34px",
        padding: "2px",
        gap: "1px",
        background: theme.tabBarBg,
        userSelect: "none",
      }}
      data-tauri-drag-region
    >
      {shells.map((tab, index) => (
        <ShellTab
          key={tab.id}
          tab={tab}
          defaultName={projectName}
          isActive={tab.id === activeTabId}
          tabIndex={index}
          isLastTab={index === shells.length - 1}
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
          width: "34px",
          height: "34px",
          background: "none",
          border: "none",
          color: theme.fg,
          cursor: "pointer",
          borderRadius: "999px",
          opacity: 0.6,
          flexShrink: 0,
        }}
        title="New shell (Cmd+T)"
      >
        <Plus size={15} />
      </button>

      <button
        onClick={onOpenFolder}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "34px",
          height: "34px",
          background: "none",
          border: "none",
          color: theme.fg,
          cursor: "pointer",
          borderRadius: "999px",
          opacity: 0.6,
          flexShrink: 0,
        }}
        title="Open Folder... (Cmd+O)"
      >
        <FolderOpen size={14} />
      </button>
    </div>
  );
}

/* ── Command bar (sits at the bottom, above status bar) ── */

interface CommandBarProps {
  tabs: Tab[];
  activeTabId: string;
  theme: Theme;
  onTabClick: (id: string) => void;
  onToggleProcess: (id: string) => void;
}

export function CommandBar({
  tabs,
  activeTabId,
  theme,
  onTabClick,
  onToggleProcess,
}: CommandBarProps) {
  const commands = tabs.filter((t) => t.type === "process");
  if (commands.length === 0) return null;

  return (
    <div className="command-bar">
      {commands.map((tab, i) => (
        <Fragment key={tab.id}>
          {i > 0 && <span className="command-bar__divider" />}
          <CommandItem
            tab={tab}
            isActive={tab.id === activeTabId}
            theme={theme}
            onTabClick={onTabClick}
            onToggleProcess={onToggleProcess}
          />
        </Fragment>
      ))}
    </div>
  );
}

/* ── Shell tab with inline rename ── */

function ShellTab({
  tab,
  defaultName,
  isActive,
  theme,
  tabIndex,
  isLastTab,
  onTabClick,
  onTabClose,
}: {
  tab: Tab;
  defaultName: string;
  isActive: boolean;
  theme: Theme;
  tabIndex: number;
  isLastTab: boolean;
  onTabClick: (id: string) => void;
  onTabClose: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [customName, setCustomName] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayName = customName || defaultName;
  const isFirstTab = tabIndex === 0;

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commitRename = () => {
    const trimmed = editValue.trim();
    setCustomName(trimmed || null);
    setEditing(false);
  };

  return (
    <div
      onClick={() => onTabClick(tab.id)}
      onDoubleClick={() => {
        setEditValue(displayName);
        setEditing(true);
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        flex: 1,
        minWidth: 0,
        height: "100%",
        padding: "0 4px",
        borderTopLeftRadius: isFirstTab ? "999px" : "0",
        borderTopRightRadius: isLastTab ? "999px" : "0",
        borderBottomLeftRadius: isFirstTab ? "999px" : "0",
        borderBottomRightRadius: isLastTab ? "999px" : "0",
        backgroundColor: isActive ? theme.activeTabBg : theme.inactiveTabBg,
        color: isActive ? theme.fg : theme.tabFg,
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: isActive ? 500 : 400,
        transition: "background-color 100ms ease",
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename();
            if (e.key === "Escape") setEditing(false);
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            background: "none",
            border: "none",
            color: "inherit",
            fontSize: "inherit",
            fontWeight: "inherit",
            textAlign: "center",
            width: "100%",
            outline: "none",
            padding: 0,
          }}
        />
      ) : (
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "center",
          }}
        >
          {displayName}
        </span>
      )}

      {isActive && !editing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onTabClose(tab.id);
          }}
          style={{
            position: "absolute",
            left: "12px",
            background: "none",
            border: "none",
            color: theme.fg,
            cursor: "pointer",
            fontSize: "14px",
            padding: "0 0 3px 0",
            flexShrink: 0,
            opacity: 0.5,
          }}
          title="Close (Cmd+W)"
        >
          ×
        </button>
      )}

      {!editing && tabIndex < 10 && (
        <span
          style={{
            position: "absolute",
            right: "12px",
            background: "none",
            color: theme.fg,
            fontSize: "12px",
            lineHeight: 1,
            flexShrink: 0,
            opacity: 0.5,
          }}
        >
          &#8984;{tabIndex + 1}
        </span>
      )}
    </div>
  );
}

/* ── Command item (flex-distributed) ── */

function CommandItem({
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
      className="command-bar__item"
      onClick={() => onTabClick(tab.id)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        color: isActive ? theme.activeTabFg : theme.tabFg,
        fontWeight: isActive ? 600 : 400,
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
            width: "7px",
            height: "7px",
            borderRadius: "50%",
            backgroundColor: dotColor,
            flexShrink: 0,
          }}
        />
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
    </div>
  );
}
