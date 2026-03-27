import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "@xterm/xterm/css/xterm.css";
import type { Theme } from "../themes";

interface TerminalViewProps {
  tabId: string;
  cmd: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string>;
  theme: Theme;
  autostart: boolean;
  active: boolean;
  workspaceActive: boolean;
  onSessionCreated: (tabId: string, sessionId: number) => void;
  onExit: (tabId: string, exitCode: number) => void;
}

export function TerminalView({
  tabId,
  cmd,
  args,
  cwd,
  env,
  theme,
  autostart,
  active,
  workspaceActive,
  onSessionCreated,
  onExit,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const sessionIdRef = useRef<number | null>(null);

  // Initialize terminal and PTY
  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      theme: theme.terminal,
      fontFamily: '"SF Mono", "Menlo", "Monaco", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 10000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    term.open(containerRef.current);

    // Unicode 11 width tables — fixes box-drawing and emoji alignment
    try {
      const unicodeAddon = new Unicode11Addon();
      term.loadAddon(unicodeAddon);
      term.unicode.activeVersion = "11";
    } catch {
      // Test environment — unicode addon not available
    }

    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      term.loadAddon(webglAddon);
    } catch {
      // WebGL not available, canvas fallback
    }

    fitAddon.fit();
    termRef.current = term;
    fitRef.current = fitAddon;

    // Listen for PTY output
    const unlisteners: Array<() => void> = [];

    (async () => {
      const unlisten1 = await listen<{ session_id: number; data: string }>(
        "pty-output",
        (event) => {
          if (event.payload.session_id === sessionIdRef.current) {
            term.write(event.payload.data);
          }
        }
      );
      unlisteners.push(unlisten1);

      const unlisten2 = await listen<{ session_id: number; exit_code: number }>(
        "pty-exit",
        (event) => {
          if (event.payload.session_id === sessionIdRef.current) {
            term.write("\r\n\x1b[90m[process exited]\x1b[0m\r\n");
            onExit(tabId, event.payload.exit_code);
          }
        }
      );
      unlisteners.push(unlisten2);

      // Listeners are ready — spawn PTY now if workspace is already active at
      // mount time (the common v0.2 path where TerminalView only renders in the
      // workspace branch of App.tsx).
      if (autostart && workspaceActive && sessionIdRef.current === null) {
        try {
          const sessionId = await invoke<number>("spawn_pty", {
            cmd,
            args,
            cols: term.cols,
            rows: term.rows,
            cwd: cwd || null,
            env: env || null,
          });
          sessionIdRef.current = sessionId;
          onSessionCreated(tabId, sessionId);
        } catch (e) {
          term.write(`\x1b[31mError spawning process: ${e}\x1b[0m\r\n`);
          onExit(tabId, -1);
        }
      }
    })();

    // Shell keybindings (Ghostty/iTerm2-like) + CSI u for modifier keys
    if (typeof term.attachCustomKeyEventHandler !== "function") {
      // Test environment — skip keybinding setup
    } else term.attachCustomKeyEventHandler((event) => {
      if (event.type !== "keydown") return true;
      const sid = sessionIdRef.current;
      const send = (data: string) => {
        if (sid !== null) void invoke("write_pty", { sessionId: sid, data });
      };

      // Shift+Enter — send CSI u encoded (kitty keyboard protocol)
      // Claude Code uses this to distinguish newline from submit
      if (event.shiftKey && !event.metaKey && !event.altKey && event.key === "Enter") {
        event.preventDefault();
        send("\x1b[13;2u");
        return false;
      }

      // Cmd+K — clear terminal
      if (event.metaKey && event.key === "k") {
        event.preventDefault();
        term.clear();
        return false;
      }

      // Cmd+Left — move to line start (Ctrl+A)
      if (event.metaKey && event.key === "ArrowLeft") {
        event.preventDefault();
        send("\x01");
        return false;
      }

      // Cmd+Right — move to line end (Ctrl+E)
      if (event.metaKey && event.key === "ArrowRight") {
        event.preventDefault();
        send("\x05");
        return false;
      }

      // Option+Left — word back (ESC b)
      if (event.altKey && event.key === "ArrowLeft") {
        event.preventDefault();
        send("\x1bb");
        return false;
      }

      // Option+Right — word forward (ESC f)
      if (event.altKey && event.key === "ArrowRight") {
        event.preventDefault();
        send("\x1bf");
        return false;
      }

      // Option+Backspace — delete word back (ESC DEL)
      if (event.altKey && event.key === "Backspace") {
        event.preventDefault();
        send("\x1b\x7f");
        return false;
      }

      // Cmd+Backspace — delete to line start (Ctrl+U)
      if (event.metaKey && event.key === "Backspace") {
        event.preventDefault();
        send("\x15");
        return false;
      }

      return true;
    });

    // Forward keyboard input to PTY
    term.onData(async (data) => {
      if (sessionIdRef.current !== null) {
        await invoke("write_pty", {
          sessionId: sessionIdRef.current,
          data,
        });
      }
    });

    // Forward resize to PTY
    term.onResize(async ({ cols, rows }) => {
      if (sessionIdRef.current !== null) {
        await invoke("resize_pty", {
          sessionId: sessionIdRef.current,
          cols,
          rows,
        });
      }
    });

    return () => {
      unlisteners.forEach((fn) => fn());
      if (sessionIdRef.current !== null) {
        invoke("kill_pty", { sessionId: sessionIdRef.current });
        sessionIdRef.current = null;
      }
      termRef.current = null;
      fitRef.current = null;
      term.dispose();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Spawn PTY when workspace becomes active (handles v0.2 boot flow where
  // workspaceActive is false at mount time and transitions to true later).
  useEffect(() => {
    if (!workspaceActive || !autostart) return;
    if (sessionIdRef.current !== null) return; // already spawned
    const term = termRef.current;
    if (!term) return;

    (async () => {
      try {
        const sessionId = await invoke<number>("spawn_pty", {
          cmd,
          args,
          cols: term.cols,
          rows: term.rows,
          cwd: cwd || null,
          env: env || null,
        });
        sessionIdRef.current = sessionId;
        onSessionCreated(tabId, sessionId);
      } catch (e) {
        term.write(`\x1b[31mError spawning process: ${e}\x1b[0m\r\n`);
        onExit(tabId, -1);
      }
    })();
  }, [workspaceActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resize on active/window change
  useEffect(() => {
    if (active && fitRef.current) {
      // Small delay to let the DOM settle
      requestAnimationFrame(() => {
        fitRef.current?.fit();
      });
    }
  }, [active]);

  useEffect(() => {
    const handleResize = () => {
      if (active && fitRef.current) {
        fitRef.current.fit();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [active]);

  return (
    <div
      ref={containerRef}
      style={{
        display: active ? "block" : "none",
        width: "100%",
        height: "100%",
        backgroundColor: theme.terminal.background,
      }}
    />
  );
}
