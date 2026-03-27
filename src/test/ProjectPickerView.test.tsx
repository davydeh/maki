import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProjectPickerView } from "../components/ProjectPickerView";
import { useWorkspaceSession } from "../hooks/useWorkspaceSession";
import type {
  ProjectInspection,
  ProjectWindowContext,
  RecentProject,
  WorkspaceAppState,
} from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

function createRecentProject(overrides: Partial<RecentProject> = {}): RecentProject {
  return {
    name: "alpha",
    path: "/projects/alpha",
    ...overrides,
  };
}

function createAppState(overrides: Partial<WorkspaceAppState> = {}): WorkspaceAppState {
  return {
    version: 1,
    last_project_path: null,
    recent_projects: [],
    ...overrides,
  };
}

function createInspection(overrides: Partial<ProjectInspection> = {}): ProjectInspection {
  return {
    name: "alpha",
    path: "/projects/alpha",
    exists: true,
    has_config: true,
    detected_stacks: [],
    script_hints: [],
    entrypoint_hints: [],
    ...overrides,
  };
}

function createCurrentWindow(
  overrides: Partial<ProjectWindowContext> = {}
): ProjectWindowContext {
  return {
    project_path: "/projects/alpha",
    window_label: "project-1",
    ...overrides,
  };
}

function SessionPickerHarness() {
  const session = useWorkspaceSession();

  if (session.screen === "booting") {
    return <div>Booting...</div>;
  }

  if (session.screen === "picker" || session.screen === "invalid") {
    return (
      <ProjectPickerView
        recentProjects={session.appState.recent_projects}
        restoreError={session.restoreError}
        onOpenFolder={session.openFolder}
        onSelectRecentProject={session.openRecentProject}
      />
    );
  }

  return <div>{session.screen}</div>;
}

describe("ProjectPickerView", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("renders recent projects with name primary and path secondary", () => {
    const alpha = createRecentProject();
    const beta = createRecentProject({
      name: "beta",
      path: "/projects/beta",
    });

    render(
      <ProjectPickerView
        recentProjects={[alpha, beta]}
        restoreError={null}
        onOpenFolder={vi.fn()}
        onSelectRecentProject={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /alpha/i })).toHaveTextContent("alpha");
    expect(screen.getByText("/projects/alpha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /beta/i })).toHaveTextContent("beta");
    expect(screen.getByText("/projects/beta")).toBeInTheDocument();
  });

  it("keeps the visible project path in the accessible name for duplicate folder names", () => {
    const alphaA = createRecentProject();
    const alphaB = createRecentProject({
      path: "/archive/alpha",
    });

    render(
      <ProjectPickerView
        recentProjects={[alphaA, alphaB]}
        restoreError={null}
        onOpenFolder={vi.fn()}
        onSelectRecentProject={vi.fn()}
      />
    );

    const buttons = screen.getAllByRole("button", { name: /^alpha/i });

    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAccessibleName("alpha/projects/alpha");
    expect(buttons[1]).toHaveAccessibleName("alpha/archive/alpha");
  });

  it("shows restore error banner when provided", () => {
    render(
      <ProjectPickerView
        recentProjects={[createRecentProject()]}
        restoreError="Project folder /projects/alpha does not exist"
        onOpenFolder={vi.fn()}
        onSelectRecentProject={vi.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Project folder /projects/alpha does not exist"
    );
  });

  it("calls open folder when the button is clicked", () => {
    const onOpenFolder = vi.fn();

    render(
      <ProjectPickerView
        recentProjects={[]}
        restoreError={null}
        onOpenFolder={onOpenFolder}
        onSelectRecentProject={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));

    expect(onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it("calls recent-project handler when a recent project is selected", () => {
    const alpha = createRecentProject();
    const onSelectRecentProject = vi.fn();

    render(
      <ProjectPickerView
        recentProjects={[alpha]}
        restoreError={null}
        onOpenFolder={vi.fn()}
        onSelectRecentProject={onSelectRecentProject}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /alpha/i }));

    expect(onSelectRecentProject).toHaveBeenCalledWith(alpha);
  });

  it("keeps the open-folder action outside the scrollable picker body", () => {
    const { container } = render(
      <ProjectPickerView
        recentProjects={Array.from({ length: 20 }, (_, index) =>
          createRecentProject({
            name: `project-${index}`,
            path: `/projects/project-${index}`,
          })
        )}
        restoreError={null}
        onOpenFolder={vi.fn()}
        onSelectRecentProject={vi.fn()}
      />
    );

    const pickerBody = container.querySelector(".project-picker__body");
    const pickerFooter = container.querySelector(".project-picker__footer");
    const openFolderButton = screen.getByRole("button", { name: /open folder/i });

    expect(pickerBody).not.toBeNull();
    expect(pickerFooter).not.toBeNull();
    expect(pickerBody).not.toContainElement(openFolderButton);
    expect(pickerFooter).toContainElement(openFolderButton);
  });

  it("reaches the native open folder command instead of only mutating local state", async () => {
    const appState = createAppState({
      recent_projects: [createRecentProject()],
    });

    invokeMock.mockImplementation(async (command) => {
      switch (command) {
        case "load_app_state":
          return appState;
        case "open_folder_dialog":
          return null;
        default:
          throw new Error(`Unexpected invoke(${command})`);
      }
    });

    render(<SessionPickerHarness />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /open folder/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /open folder/i }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_folder_dialog");
    });
  });
});
