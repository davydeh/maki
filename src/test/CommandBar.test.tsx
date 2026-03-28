import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { CommandBar, CommandLauncher } from "../components/TabBar";
import { themes } from "../themes";
import type { Tab } from "../types";

const theme = themes.dark;

function createTab(overrides: Partial<Tab> = {}): Tab {
  return {
    id: "cmd-1",
    name: "dev server",
    type: "process",
    cmd: "/bin/zsh",
    args: ["-c", "npm run dev"],
    status: "running",
    autostart: true,
    ...overrides,
  };
}

function renderCommandBar(
  commands: Tab[],
  overrides: Record<string, unknown> = {}
) {
  const props = {
    commands,
    hasOneOffCommands: false,
    activeTabId: "",
    theme,
    onFocusCommand: vi.fn(),
    onRunCommand: vi.fn(),
    onStopCommand: vi.fn(),
    onOpenLauncher: vi.fn(),
    ...overrides,
  };
  const result = render(<CommandBar {...props} />);
  return { ...result, ...props };
}

describe("CommandBar", () => {
  it("renders nothing when no commands and no one-off commands", () => {
    const { container } = renderCommandBar([]);
    expect(container.innerHTML).toBe("");
  });

  it("shows empty message when commands array is empty but one-offs exist", () => {
    renderCommandBar([], { hasOneOffCommands: true });
    expect(screen.getByText("No auto-run commands")).toBeInTheDocument();
  });

  it("renders pills for each command", () => {
    const commands = [
      createTab({ id: "a", name: "web" }),
      createTab({ id: "b", name: "api" }),
      createTab({ id: "c", name: "worker" }),
    ];
    renderCommandBar(commands);
    expect(screen.getByText("web")).toBeInTheDocument();
    expect(screen.getByText("api")).toBeInTheDocument();
    expect(screen.getByText("worker")).toBeInTheDocument();
  });

  it("shows Run command button when one-off commands exist", () => {
    renderCommandBar([createTab()], { hasOneOffCommands: true });
    expect(screen.getByText("Run command")).toBeInTheDocument();
  });

  it("calls onOpenLauncher when Run command button is clicked", () => {
    const { onOpenLauncher } = renderCommandBar([createTab()], {
      hasOneOffCommands: true,
    });
    fireEvent.click(screen.getByText("Run command"));
    expect(onOpenLauncher).toHaveBeenCalledTimes(1);
  });
});

describe("CommandPill — focus behavior", () => {
  it("calls onFocusCommand when clicking a running pill", () => {
    const tab = createTab({ status: "running" });
    const { onFocusCommand } = renderCommandBar([tab]);
    fireEvent.click(screen.getByText("dev server"));
    expect(onFocusCommand).toHaveBeenCalledWith("cmd-1");
  });

  it("calls onFocusCommand when clicking a stopped pill", () => {
    const tab = createTab({ status: "stopped" });
    const { onFocusCommand } = renderCommandBar([tab]);
    fireEvent.click(screen.getByText("dev server"));
    expect(onFocusCommand).toHaveBeenCalledWith("cmd-1");
  });

  it("calls onFocusCommand when clicking an errored pill", () => {
    const tab = createTab({ status: "errored" });
    const { onFocusCommand } = renderCommandBar([tab]);
    fireEvent.click(screen.getByText("dev server"));
    expect(onFocusCommand).toHaveBeenCalledWith("cmd-1");
  });
});

describe("CommandPill — stop button", () => {
  it("renders stop button for running commands", () => {
    const tab = createTab({ status: "running" });
    renderCommandBar([tab]);
    expect(screen.getByTitle("Stop")).toBeInTheDocument();
  });

  it("calls onStopCommand (not onFocusCommand) when stop is clicked", () => {
    const tab = createTab({ status: "running" });
    const { onStopCommand, onFocusCommand } = renderCommandBar([tab]);
    fireEvent.click(screen.getByTitle("Stop"));
    expect(onStopCommand).toHaveBeenCalledWith("cmd-1");
    expect(onFocusCommand).not.toHaveBeenCalled();
  });

  it("does not render stop button for stopped commands", () => {
    const tab = createTab({ status: "stopped" });
    renderCommandBar([tab]);
    expect(screen.queryByTitle("Stop")).not.toBeInTheDocument();
  });
});

describe("CommandPill — play/restart button", () => {
  it("renders restart button for stopped commands", () => {
    const tab = createTab({ status: "stopped" });
    renderCommandBar([tab]);
    expect(screen.getByTitle("Restart")).toBeInTheDocument();
  });

  it("renders restart button for errored commands", () => {
    const tab = createTab({ status: "errored" });
    renderCommandBar([tab]);
    expect(screen.getByTitle("Restart")).toBeInTheDocument();
  });

  it("calls onRunCommand (not onFocusCommand) when restart is clicked", () => {
    const tab = createTab({ status: "stopped" });
    const { onRunCommand, onFocusCommand } = renderCommandBar([tab]);
    fireEvent.click(screen.getByTitle("Restart"));
    expect(onRunCommand).toHaveBeenCalledWith("cmd-1");
    expect(onFocusCommand).not.toHaveBeenCalled();
  });

  it("does not render restart button for running commands", () => {
    const tab = createTab({ status: "running" });
    renderCommandBar([tab]);
    expect(screen.queryByTitle("Restart")).not.toBeInTheDocument();
  });
});

describe("CommandPill — status dot color", () => {
  // jsdom normalizes hex to rgb, so compare against the dot's computed style
  // by checking each status gets a different color from the others
  it("uses distinct colors for running, errored, and stopped", () => {
    const { unmount: u1 } = render(
      <CommandBar
        commands={[createTab({ id: "r", status: "running" })]}
        hasOneOffCommands={false}
        activeTabId=""
        theme={theme}
        onFocusCommand={vi.fn()}
        onRunCommand={vi.fn()}
        onStopCommand={vi.fn()}
        onOpenLauncher={vi.fn()}
      />
    );
    const runningColor = (document.querySelector(".command-pill__dot") as HTMLElement).style.backgroundColor;
    u1();

    const { unmount: u2 } = render(
      <CommandBar
        commands={[createTab({ id: "e", status: "errored" })]}
        hasOneOffCommands={false}
        activeTabId=""
        theme={theme}
        onFocusCommand={vi.fn()}
        onRunCommand={vi.fn()}
        onStopCommand={vi.fn()}
        onOpenLauncher={vi.fn()}
      />
    );
    const erroredColor = (document.querySelector(".command-pill__dot") as HTMLElement).style.backgroundColor;
    u2();

    const { unmount: u3 } = render(
      <CommandBar
        commands={[createTab({ id: "s", status: "stopped" })]}
        hasOneOffCommands={false}
        activeTabId=""
        theme={theme}
        onFocusCommand={vi.fn()}
        onRunCommand={vi.fn()}
        onStopCommand={vi.fn()}
        onOpenLauncher={vi.fn()}
      />
    );
    const stoppedColor = (document.querySelector(".command-pill__dot") as HTMLElement).style.backgroundColor;
    u3();

    // All three should be distinct
    expect(runningColor).not.toBe(erroredColor);
    expect(runningColor).not.toBe(stoppedColor);
    expect(erroredColor).not.toBe(stoppedColor);
  });
});

describe("CommandPill — active styling", () => {
  it("applies active font weight when pill matches activeTabId", () => {
    const tab = createTab({ id: "active-cmd" });
    renderCommandBar([tab], { activeTabId: "active-cmd" });
    const pill = screen.getByText("dev server").closest("button") as HTMLElement;
    expect(pill.style.fontWeight).toBe("600");
  });

  it("applies inactive font weight when pill does not match activeTabId", () => {
    const tab = createTab({ id: "inactive-cmd" });
    renderCommandBar([tab], { activeTabId: "other" });
    const pill = screen.getByText("dev server").closest("button") as HTMLElement;
    expect(pill.style.fontWeight).toBe("400");
  });
});

describe("CommandPill — multiple pills with different states", () => {
  it("each pill routes to the correct id", () => {
    const commands = [
      createTab({ id: "a", name: "web", status: "running" }),
      createTab({ id: "b", name: "api", status: "stopped" }),
      createTab({ id: "c", name: "worker", status: "errored" }),
    ];
    const { onFocusCommand, onStopCommand, onRunCommand } =
      renderCommandBar(commands);

    // Click each pill body
    fireEvent.click(screen.getByText("web"));
    expect(onFocusCommand).toHaveBeenCalledWith("a");

    fireEvent.click(screen.getByText("api"));
    expect(onFocusCommand).toHaveBeenCalledWith("b");

    fireEvent.click(screen.getByText("worker"));
    expect(onFocusCommand).toHaveBeenCalledWith("c");

    // Click action buttons
    fireEvent.click(screen.getByTitle("Stop"));
    expect(onStopCommand).toHaveBeenCalledWith("a");

    // There are two restart buttons (stopped + errored)
    const restartButtons = screen.getAllByTitle("Restart");
    expect(restartButtons).toHaveLength(2);

    fireEvent.click(restartButtons[0]);
    expect(onRunCommand).toHaveBeenCalledWith("b");

    fireEvent.click(restartButtons[1]);
    expect(onRunCommand).toHaveBeenCalledWith("c");
  });
});

describe("CommandLauncher", () => {
  function renderLauncher(overrides: Record<string, unknown> = {}) {
    const commands = [
      createTab({ id: "a", name: "web server", args: ["-c", "npm run dev"] }),
      createTab({ id: "b", name: "storybook", args: ["-c", "npm run storybook"] }),
      createTab({ id: "c", name: "test watch", args: ["-c", "npm test -- --watch"], status: "stopped" }),
    ];
    const props = {
      open: true,
      commands,
      theme,
      onClose: vi.fn(),
      onRunCommand: vi.fn(),
      ...overrides,
    };
    const result = render(<CommandLauncher {...props} />);
    return { ...result, ...props };
  }

  it("renders nothing when closed", () => {
    const { container } = renderLauncher({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders all commands when open", () => {
    renderLauncher();
    expect(screen.getByText("web server")).toBeInTheDocument();
    expect(screen.getByText("storybook")).toBeInTheDocument();
    expect(screen.getByText("test watch")).toBeInTheDocument();
  });

  it("filters commands by search query", () => {
    renderLauncher();
    const input = screen.getByPlaceholderText("Search one-off commands...");
    fireEvent.change(input, { target: { value: "story" } });
    expect(screen.getByText("storybook")).toBeInTheDocument();
    expect(screen.queryByText("web server")).not.toBeInTheDocument();
    expect(screen.queryByText("test watch")).not.toBeInTheDocument();
  });

  it("shows empty state when no commands match", () => {
    renderLauncher();
    const input = screen.getByPlaceholderText("Search one-off commands...");
    fireEvent.change(input, { target: { value: "zzzzz" } });
    expect(screen.getByText("No matching command")).toBeInTheDocument();
  });

  it("shows 'Open' for running commands, 'Run' for stopped", () => {
    renderLauncher();
    const openLabels = screen.getAllByText("Open");
    const runLabels = screen.getAllByText("Run");
    expect(openLabels).toHaveLength(2); // web server + storybook are running
    expect(runLabels).toHaveLength(1); // test watch is stopped
  });

  it("calls onRunCommand and onClose when a command is clicked", () => {
    const { onRunCommand, onClose } = renderLauncher();
    fireEvent.click(screen.getByText("storybook"));
    expect(onRunCommand).toHaveBeenCalledWith("b");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when backdrop is clicked", () => {
    const { onClose } = renderLauncher();
    const backdrop = document.querySelector(".command-launcher") as HTMLElement;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on Escape key", () => {
    const { onClose } = renderLauncher();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("selects command with Enter key", () => {
    const { onRunCommand, onClose } = renderLauncher();
    fireEvent.keyDown(window, { key: "Enter" });
    // First item is selected by default
    expect(onRunCommand).toHaveBeenCalledWith("a");
    expect(onClose).toHaveBeenCalled();
  });

  it("navigates with arrow keys and selects with Enter", () => {
    const { onRunCommand } = renderLauncher();
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "Enter" });
    // Third item (index 2)
    expect(onRunCommand).toHaveBeenCalledWith("c");
  });

  it("does not navigate past the last item", () => {
    const { onRunCommand } = renderLauncher();
    // Press down 10 times — should clamp to last (index 2)
    for (let i = 0; i < 10; i++) {
      fireEvent.keyDown(window, { key: "ArrowDown" });
    }
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onRunCommand).toHaveBeenCalledWith("c");
  });

  it("does not navigate before the first item", () => {
    const { onRunCommand } = renderLauncher();
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "ArrowUp" });
    fireEvent.keyDown(window, { key: "Enter" });
    expect(onRunCommand).toHaveBeenCalledWith("a");
  });
});
