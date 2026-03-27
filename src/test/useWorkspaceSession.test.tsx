import { act, renderHook, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useWorkspaceSession } from "../hooks/useWorkspaceSession";
import type {
  DetectedCommand,
  ProjectInspection,
  ProjectWindowContext,
  ProjectWindowOpenResult,
  RecentProject,
  WizardDraft,
  WorkspaceAppState,
} from "../types";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const invokeMock = vi.mocked(invoke);

type CommandResponse = unknown | Error;

function createAppState(overrides: Partial<WorkspaceAppState> = {}): WorkspaceAppState {
  return {
    version: 1,
    last_project_path: null,
    recent_projects: [],
    ...overrides,
  };
}

function createRecentProject(overrides: Partial<RecentProject> = {}): RecentProject {
  return {
    name: "alpha",
    path: "/projects/alpha",
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

function createOpenResult(
  overrides: Partial<ProjectWindowOpenResult> = {}
): ProjectWindowOpenResult {
  return {
    project_path: "/projects/alpha",
    window_label: "project-2",
    created: true,
    ...overrides,
  };
}

function createDetectedCommand(
  overrides: Partial<DetectedCommand> = {}
): DetectedCommand {
  return {
    id: "detected-0",
    name: "dev",
    cmd: "npm run dev",
    enabled: true,
    autostart: true,
    source: "detected",
    ...overrides,
  };
}

function createWizardDraft(overrides: Partial<WizardDraft> = {}): WizardDraft {
  return {
    project_name: "alpha",
    commands: [createDetectedCommand()],
    ...overrides,
  };
}

function mockInvoke(
  responses: Partial<Record<string, CommandResponse | CommandResponse[]>>
) {
  const queues = new Map(
    Object.entries(responses).map(([command, response]) => [
      command,
      Array.isArray(response) ? [...response] : [response],
    ])
  );

  invokeMock.mockImplementation(async (command) => {
    const queue = queues.get(command);
    if (!queue || queue.length === 0) {
      throw new Error(`Unexpected invoke(${command})`);
    }

    const next = queue.shift();
    if (next instanceof Error) {
      throw next;
    }

    return next;
  });
}

describe("useWorkspaceSession", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("restores the last project into workspace state when config exists", async () => {
    const recent = createRecentProject();
    const state = createAppState({
      last_project_path: recent.path,
      recent_projects: [recent],
    });
    const inspection = createInspection();

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      get_current_project_window: createCurrentWindow({
        project_path: inspection.path,
      }),
      bind_current_project_window: createCurrentWindow({
        project_path: inspection.path,
      }),
      save_app_state: state,
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("workspace");
    });

    expect(result.current.project).toEqual(inspection);
    expect(result.current.appState).toEqual(state);
    expect(invokeMock).toHaveBeenCalledWith("bind_current_project_window", {
      projectPath: inspection.path,
    });
    expect(invokeMock).toHaveBeenCalledWith("save_app_state", {
      state: expect.objectContaining({
        last_project_path: inspection.path,
        recent_projects: [recent],
      }),
    });
  });

  it("routes to wizard state when inspection reports missing config", async () => {
    const state = createAppState({
      last_project_path: "/projects/no-config",
    });
    const inspection = createInspection({
      name: "no-config",
      path: "/projects/no-config",
      has_config: false,
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    expect(result.current.project).toEqual(inspection);
    expect(result.current.restoreError).toBeNull();
  });

  it("routes to invalid state when restore fails", async () => {
    mockInvoke({
      load_app_state: new Error("Reading app state failed"),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("invalid");
    });

    expect(result.current.restoreError).toBe("Reading app state failed");
    expect(result.current.appState).toEqual(createAppState());
  });

  it("preserves recents and shows the restore error banner when last project inspection fails", async () => {
    const recentA = createRecentProject();
    const recentB = createRecentProject({
      name: "beta",
      path: "/projects/beta",
    });
    const state = createAppState({
      last_project_path: recentA.path,
      recent_projects: [recentA, recentB],
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: new Error("Project folder /projects/alpha does not exist"),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("invalid");
    });

    expect(result.current.restoreError).toBe(
      "Project folder /projects/alpha does not exist"
    );
    expect(result.current.appState.recent_projects).toEqual([recentA, recentB]);
  });

  it("focuses the existing window when the restored last project is already open", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection();

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      get_current_project_window: createCurrentWindow({
        project_path: "/projects/beta",
        window_label: "project-9",
      }),
      open_project_window: createOpenResult({
        project_path: inspection.path,
        created: false,
      }),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_project_window", {
        projectPath: inspection.path,
      });
    });

    expect(result.current.screen).toBe("booting");
    expect(result.current.project).toBeNull();
  });

  it("restores locally on cold start when the first window is still unbound", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection();

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      get_current_project_window: new Error("Window project not bound"),
      bind_current_project_window: createCurrentWindow({
        project_path: inspection.path,
      }),
      save_app_state: state,
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("workspace");
    });

    expect(invokeMock).not.toHaveBeenCalledWith(
      "open_project_window",
      expect.anything()
    );
    expect(invokeMock).toHaveBeenCalledWith("bind_current_project_window", {
      projectPath: inspection.path,
    });
    expect(result.current.project).toEqual(inspection);
  });

  it("routes restored boot state through native window routing when another window already hosts the project", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection();

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      get_current_project_window: createCurrentWindow({
        project_path: "/projects/beta",
        window_label: "project-9",
      }),
      open_project_window: createOpenResult({
        project_path: inspection.path,
        created: false,
        window_label: "project-1",
      }),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_project_window", {
        projectPath: inspection.path,
      });
    });

    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_app_state",
      expect.anything()
    );
    expect(result.current.screen).toBe("booting");
    expect(result.current.project).toBeNull();
  });

  it("saves wizard config with the backend's snake_case request contract", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection({
      has_config: false,
      script_hints: ["npm run dev"],
    });
    const savedInspection = createInspection({
      has_config: true,
    });
    const draft = createWizardDraft({
      project_name: "alpha",
      commands: [
        createDetectedCommand({
          name: "web",
          cmd: "npm run dev",
        }),
      ],
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: [inspection, savedInspection],
      save_config: "/projects/alpha/maki.yaml",
      bind_current_project_window: createCurrentWindow({
        project_path: savedInspection.path,
      }),
      save_app_state: createAppState({
        last_project_path: "/projects/alpha",
        recent_projects: [createRecentProject()],
      }),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    await act(async () => {
      await result.current.saveWizardConfig(draft);
    });

    expect(invokeMock).toHaveBeenCalledWith("save_config", {
      request: {
        project_path: "/projects/alpha",
        draft: {
          project_name: "alpha",
          theme: undefined,
          commands: [
            {
              name: "web",
              cmd: "npm run dev",
              enabled: true,
              autostart: true,
            },
          ],
        },
      },
    });
    expect(invokeMock).toHaveBeenCalledWith("bind_current_project_window", {
      projectPath: savedInspection.path,
    });
    expect(result.current.screen).toBe("workspace");
    expect(result.current.project).toEqual(savedInspection);
  });

  it("keeps wizard state and surfaces backend errors when local binding fails after save", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection({
      has_config: false,
      script_hints: ["npm run dev"],
    });
    const savedInspection = createInspection({
      has_config: true,
    });
    const draft = createWizardDraft();

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: [inspection, savedInspection],
      save_config: "/projects/alpha/maki.yaml",
      bind_current_project_window: new Error("Binding current project window failed"),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    await act(async () => {
      await result.current.saveWizardConfig(draft);
    });

    expect(result.current.screen).toBe("wizard");
    expect(result.current.restoreError).toBe("Binding current project window failed");
    expect(result.current.wizardDraft).toEqual(draft);
    expect(result.current.appState).toEqual(state);
  });

  it("opens a new project window when selecting a different recent project", async () => {
    const recentA = createRecentProject();
    const recentB = createRecentProject({
      name: "beta",
      path: "/projects/beta",
    });
    const state = createAppState({
      last_project_path: recentA.path,
      recent_projects: [recentA, recentB],
    });
    const inspection = createInspection({
      name: "beta",
      path: recentB.path,
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: [new Error("Project folder /projects/alpha does not exist"), inspection],
      open_project_window: createOpenResult({
        project_path: recentB.path,
        created: true,
      }),
      save_app_state: createAppState({
        last_project_path: recentB.path,
        recent_projects: [recentB, recentA],
      }),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("invalid");
    });

    await act(async () => {
      await result.current.openRecentProject(recentB);
    });

    expect(invokeMock).toHaveBeenCalledWith("open_project_window", {
      projectPath: recentB.path,
    });
    expect(invokeMock).toHaveBeenCalledWith("save_app_state", {
      state: expect.objectContaining({
        last_project_path: recentB.path,
        recent_projects: [recentB, recentA],
      }),
    });
  });

  it("uses native window routing instead of local-only state when selecting a different project from a live window", async () => {
    const current = createRecentProject();
    const other = createRecentProject({
      name: "beta",
      path: "/projects/beta",
    });
    const state = createAppState({
      last_project_path: current.path,
      recent_projects: [current, other],
    });
    const currentInspection = createInspection();
    const otherInspection = createInspection({
      name: "beta",
      path: other.path,
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: [currentInspection, otherInspection],
      get_current_project_window: createCurrentWindow({
        project_path: current.path,
      }),
      bind_current_project_window: createCurrentWindow({
        project_path: current.path,
      }),
      save_app_state: [
        createAppState({
          last_project_path: current.path,
          recent_projects: [current, other],
        }),
        createAppState({
          last_project_path: other.path,
          recent_projects: [other, current],
        }),
      ],
      open_project_window: createOpenResult({
        project_path: other.path,
        created: true,
      }),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("workspace");
    });

    await act(async () => {
      await result.current.openRecentProject(other);
    });

    expect(invokeMock).toHaveBeenCalledWith("open_project_window", {
      projectPath: other.path,
    });
    expect(result.current.screen).toBe("workspace");
    expect(result.current.project).toEqual(currentInspection);
  });

  it("enters the wizard locally when selecting a different project without config from a live workspace", async () => {
    const current = createRecentProject();
    const other = createRecentProject({
      name: "beta",
      path: "/projects/beta",
    });
    const state = createAppState({
      last_project_path: current.path,
      recent_projects: [current, other],
    });
    const currentInspection = createInspection();
    const otherInspection = createInspection({
      name: "beta",
      path: other.path,
      has_config: false,
      script_hints: ["npm run dev"],
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: [currentInspection, otherInspection],
      get_current_project_window: createCurrentWindow({
        project_path: current.path,
      }),
      bind_current_project_window: createCurrentWindow({
        project_path: current.path,
      }),
      save_app_state: createAppState({
        last_project_path: current.path,
        recent_projects: [current, other],
      }),
      generate_config_preview:
        "name: beta\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("workspace");
    });

    await act(async () => {
      await result.current.openRecentProject(other);
    });

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    expect(result.current.project).toEqual(otherInspection);
    expect(result.current.wizardDraft).toEqual(
      expect.objectContaining({
        project_name: "beta",
        commands: [
          expect.objectContaining({
            cmd: "npm run dev",
            enabled: true,
          }),
        ],
      })
    );
    expect(invokeMock).not.toHaveBeenCalledWith("open_project_window", {
      projectPath: other.path,
    });
  });

  it("keeps picker state and app state intact when native routing fails from recents", async () => {
    const recentA = createRecentProject();
    const recentB = createRecentProject({
      name: "beta",
      path: "/projects/beta",
    });
    const state = createAppState({
      last_project_path: recentA.path,
      recent_projects: [recentA, recentB],
    });
    const inspection = createInspection({
      name: "beta",
      path: recentB.path,
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: [new Error("Project folder /projects/alpha does not exist"), inspection],
      open_project_window: new Error("Focusing project window failed"),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("invalid");
    });

    await act(async () => {
      await result.current.openRecentProject(recentB);
    });

    expect(invokeMock).not.toHaveBeenCalledWith(
      "save_app_state",
      expect.objectContaining({
        state: expect.objectContaining({
          last_project_path: recentB.path,
        }),
      })
    );
    expect(result.current.appState).toEqual(state);
    expect(result.current.restoreError).toBe("Focusing project window failed");
    expect(result.current.screen).toBe("invalid");
  });
});
