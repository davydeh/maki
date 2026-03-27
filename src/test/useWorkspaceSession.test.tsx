import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../App";
import * as workspaceSessionModule from "../hooks/useWorkspaceSession";
import {
  useWorkspaceSession,
  type WorkspaceSessionState,
} from "../hooks/useWorkspaceSession";
import type {
  MakiConfig,
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

const { MockTerminal, MockFitAddon, MockWebglAddon } = vi.hoisted(() => {
  class MockTerminal {
    cols = 120;
    rows = 32;

    loadAddon() {}
    open() {}
    onData() {}
    onResize() {}
    write() {}
    dispose() {}
  }

  class MockFitAddon {
    fit() {}
  }

  class MockWebglAddon {
    onContextLoss() {}
    dispose() {}
  }

  return { MockTerminal, MockFitAddon, MockWebglAddon };
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

vi.mock("@xterm/xterm", () => ({
  Terminal: MockTerminal,
}));

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: MockFitAddon,
}));

vi.mock("@xterm/addon-webgl", () => ({
  WebglAddon: MockWebglAddon,
}));

const invokeMock = vi.mocked(invoke);
const listenMock = vi.mocked(listen);

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
    source: "script_hint",
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

function createMakiConfig(overrides: Partial<MakiConfig> = {}): MakiConfig {
  return {
    name: "alpha",
    theme: "dark",
    processes: [
      {
        name: "web",
        cmd: "npm run dev",
        autostart: true,
      },
    ],
    shells: [
      {
        name: "shell",
      },
    ],
    ...overrides,
  };
}

function createSessionState(
  overrides: Partial<WorkspaceSessionState> = {}
): WorkspaceSessionState {
  return {
    screen: "picker",
    appState: createAppState(),
    project: null,
    restoreError: null,
    wizardDraft: null,
    wizardPreview: null,
    wizardPreviewError: null,
    wizardPreviewPending: false,
    wizardPreviewDirty: false,
    wizardSavePending: false,
    openFolder: vi.fn(async () => {}),
    openRecentProject: vi.fn(async () => {}),
    addWizardCommand: vi.fn(),
    updateWizardCommand: vi.fn(),
    refreshWizardPreview: vi.fn(async () => {}),
    saveWizardConfig: vi.fn(async () => {}),
    ...overrides,
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
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
    listenMock.mockReset();
    listenMock.mockResolvedValue(vi.fn());
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
      save_app_state: createAppState({
        last_project_path: inspection.path,
        recent_projects: [createRecentProject({ name: "no-config", path: inspection.path })],
      }),
      generate_config_preview: new Error("Config must include at least one enabled command"),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    expect(result.current.project).toEqual(inspection);
    expect(result.current.restoreError).toBeNull();
    expect(result.current.appState).toEqual(
      createAppState({
        last_project_path: inspection.path,
        recent_projects: [createRecentProject({ name: "no-config", path: inspection.path })],
      })
    );
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

  it("uses the bound current project window before stale persisted state when the project has config", async () => {
    const staleRecent = createRecentProject();
    const state = createAppState({
      last_project_path: staleRecent.path,
      recent_projects: [staleRecent],
    });
    const inspection = createInspection({
      name: "beta",
      path: "/projects/beta",
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      get_current_project_window: createCurrentWindow({
        project_path: inspection.path,
        window_label: "project-9",
      }),
      bind_current_project_window: createCurrentWindow({
        project_path: inspection.path,
        window_label: "project-9",
      }),
      save_app_state: createAppState({
        last_project_path: inspection.path,
        recent_projects: [createRecentProject({ name: inspection.name, path: inspection.path }), staleRecent],
      }),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("workspace");
    });

    expect(result.current.project).toEqual(inspection);
    expect(result.current.appState).toEqual(
      createAppState({
        last_project_path: inspection.path,
        recent_projects: [
          createRecentProject({ name: inspection.name, path: inspection.path }),
          staleRecent,
        ],
      })
    );

    expect(invokeMock).not.toHaveBeenCalledWith("open_project_window", {
      projectPath: inspection.path,
    });
    expect(invokeMock).toHaveBeenCalledWith("bind_current_project_window", {
      projectPath: inspection.path,
    });
  });

  it("prefers the bound current project window over stale persisted state on boot when config is missing", async () => {
    const staleRecent = createRecentProject();
    const currentProject = createInspection({
      name: "beta",
      path: "/projects/beta",
      has_config: false,
      script_hints: ["npm run dev"],
    });
    const state = createAppState({
      last_project_path: staleRecent.path,
      recent_projects: [staleRecent],
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: currentProject,
      get_current_project_window: createCurrentWindow({
        project_path: currentProject.path,
        window_label: "project-9",
      }),
      save_app_state: createAppState({
        last_project_path: currentProject.path,
        recent_projects: [
          createRecentProject({ name: currentProject.name, path: currentProject.path }),
          staleRecent,
        ],
      }),
      generate_config_preview:
        "name: beta\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    expect(result.current.project).toEqual(currentProject);
    expect(result.current.appState).toEqual(
      createAppState({
        last_project_path: currentProject.path,
        recent_projects: [
          createRecentProject({ name: currentProject.name, path: currentProject.path }),
          staleRecent,
        ],
      })
    );
    expect(invokeMock).not.toHaveBeenCalledWith("open_project_window", {
      projectPath: currentProject.path,
    });
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
      generate_config_preview: [
        "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
        "name: alpha\nprocesses:\n  - name: web\n    cmd: npm run dev\n    autostart: true\n",
      ],
      save_config: "/projects/alpha/maki.yaml",
      bind_current_project_window: createCurrentWindow({
        project_path: savedInspection.path,
      }),
      save_app_state: [
        createAppState({
          last_project_path: "/projects/alpha",
          recent_projects: [createRecentProject()],
        }),
        createAppState({
          last_project_path: "/projects/alpha",
          recent_projects: [createRecentProject()],
        }),
      ],
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    await act(async () => {
      await result.current.refreshWizardPreview(draft);
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
      generate_config_preview: [
        "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
        "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
      ],
      save_config: "/projects/alpha/maki.yaml",
      bind_current_project_window: new Error("Binding current project window failed"),
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
      await result.current.refreshWizardPreview(draft);
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

  it("routes configless project selection through a new window from a live workspace", async () => {
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
        last_project_path: other.path,
        recent_projects: [other, current],
      }),
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

    expect(result.current.screen).toBe("workspace");
    expect(result.current.project).toEqual(currentInspection);
    expect(result.current.appState).toEqual(
      createAppState({
        last_project_path: other.path,
        recent_projects: [other, current],
      })
    );
    expect(result.current.wizardDraft).toBeNull();
    expect(invokeMock).toHaveBeenCalledWith("open_project_window", {
      projectPath: other.path,
    });
    expect(invokeMock).toHaveBeenCalledWith("save_app_state", {
      state: expect.objectContaining({
        last_project_path: other.path,
        recent_projects: [other, current],
      }),
    });
  });

  it("blocks saving the wizard until the preview is current after edits", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection({
      has_config: false,
      script_hints: ["npm run dev"],
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      save_app_state: state,
      generate_config_preview:
        "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    act(() => {
      result.current.updateWizardCommand("detected-0", { name: "web" });
    });

    await act(async () => {
      await result.current.saveWizardConfig();
    });

    expect(invokeMock).not.toHaveBeenCalledWith("save_config", expect.anything());
    expect(result.current.restoreError).toBe(
      "Refresh the YAML preview before saving the config."
    );
    expect(result.current.screen).toBe("wizard");
  });

  it("blocks saving the wizard when preview generation failed", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection({
      has_config: false,
      script_hints: ["npm run dev"],
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      save_app_state: state,
      generate_config_preview: new Error("Config must include at least one enabled command"),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    await act(async () => {
      await result.current.saveWizardConfig();
    });

    expect(invokeMock).not.toHaveBeenCalledWith("save_config", expect.anything());
    expect(result.current.restoreError).toBe(
      "Refresh the YAML preview before saving the config."
    );
  });

  it("blocks preview and save when an enabled detected command is blank", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection({
      has_config: false,
      script_hints: ["npm run dev"],
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      save_app_state: state,
      generate_config_preview:
        "name: alpha\nprocesses:\n  - name: dev\n    cmd: npm run dev\n    autostart: true\n",
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    act(() => {
      result.current.updateWizardCommand("detected-0", { cmd: "   " });
    });

    await act(async () => {
      await result.current.refreshWizardPreview();
    });

    await act(async () => {
      await result.current.saveWizardConfig();
    });

    expect(invokeMock).toHaveBeenCalledTimes(5);
    expect(result.current.wizardPreviewError).toBe(
      "Complete every enabled command before generating the preview."
    );
    expect(result.current.restoreError).toBe(
      "Complete every enabled command before saving the config."
    );
  });

  it("blocks preview and save when a manual enabled command is blank", async () => {
    const state = createAppState({
      last_project_path: "/projects/alpha",
      recent_projects: [createRecentProject()],
    });
    const inspection = createInspection({
      has_config: false,
      script_hints: [],
      entrypoint_hints: [],
    });

    mockInvoke({
      load_app_state: state,
      inspect_project_folder: inspection,
      save_app_state: state,
      generate_config_preview: new Error("Config must include at least one enabled command"),
    });

    const { result } = renderHook(() => useWorkspaceSession());

    await waitFor(() => {
      expect(result.current.screen).toBe("wizard");
    });

    act(() => {
      result.current.addWizardCommand();
    });

    await act(async () => {
      await result.current.refreshWizardPreview();
    });

    await act(async () => {
      await result.current.saveWizardConfig();
    });

    expect(invokeMock).toHaveBeenCalledTimes(5);
    expect(result.current.wizardPreviewError).toBe(
      "Complete every enabled command before generating the preview."
    );
    expect(result.current.restoreError).toBe(
      "Complete every enabled command before saving the config."
    );
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

describe("App workspace integration", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    listenMock.mockReset();
    listenMock.mockResolvedValue(vi.fn());
  });

  it("loads config and initializes tabs after wizard save", async () => {
    const project = createInspection({
      has_config: true,
      script_hints: ["npm run dev"],
    });
    const config = createMakiConfig();
    let sessionState = createSessionState({
      screen: "wizard",
      project,
      wizardDraft: createWizardDraft(),
      wizardPreview: "name: alpha",
    });

    const sessionSpy = vi
      .spyOn(workspaceSessionModule, "useWorkspaceSession")
      .mockImplementation(() => sessionState);

    mockInvoke({
      get_config: config,
      spawn_pty: [11, 12],
    });

    const { rerender } = render(<App />);

    expect(invokeMock).not.toHaveBeenCalledWith(
      "get_config",
      expect.objectContaining({
        path: `${project.path}/maki.yaml`,
      })
    );

    sessionState = createSessionState({
      screen: "workspace",
      project,
    });

    rerender(<App />);

    // "web" process appears in command bar, project name in shell tabs
    expect(await screen.findByText("web")).toBeInTheDocument();

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_config", {
        path: `${project.path}/maki.yaml`,
      });
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "spawn_pty",
        expect.objectContaining({
          cmd: "/bin/zsh",
          args: ["-c", "npm run dev"],
          cwd: project.path,
        })
      );
      expect(invokeMock).toHaveBeenCalledWith(
        "spawn_pty",
        expect.objectContaining({
          cmd: "/bin/zsh",
          args: [],
          cwd: project.path,
        })
      );
    });

    sessionSpy.mockRestore();
  });

  it("preserves git polling only when a project root is active", async () => {
    vi.useFakeTimers();

    const project = createInspection();
    let sessionState = createSessionState({
      screen: "booting",
      project: null,
    });

    const sessionSpy = vi
      .spyOn(workspaceSessionModule, "useWorkspaceSession")
      .mockImplementation(() => sessionState);

    mockInvoke({
      get_config: createMakiConfig(),
      get_git_status: [
        {
          branch: "main",
          dirty: false,
          is_repo: true,
        },
        {
          branch: "main",
          dirty: true,
          is_repo: true,
        },
      ],
      spawn_pty: [21, 22],
    });

    const { rerender } = render(<App />);

    expect(invokeMock).not.toHaveBeenCalledWith(
      "get_git_status",
      expect.anything()
    );

    sessionState = createSessionState({
      screen: "workspace",
      project,
    });

    rerender(<App />);

    await flushEffects();

    expect(invokeMock).toHaveBeenCalledWith("get_git_status", {
      projectRoot: project.path,
    });

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    await flushEffects();

    const secondPollCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "get_git_status"
    );
    expect(secondPollCalls).toHaveLength(2);

    sessionState = createSessionState({
      screen: "picker",
      project: null,
    });

    rerender(<App />);

    await act(async () => {
      vi.advanceTimersByTime(15000);
    });

    await flushEffects();

    const gitCalls = invokeMock.mock.calls.filter(
      ([command]) => command === "get_git_status"
    );
    expect(gitCalls).toHaveLength(2);

    sessionSpy.mockRestore();
    vi.useRealTimers();
  });

  it("supports cmd-o from a live workspace shell", async () => {
    const project = createInspection();
    const openFolder = vi.fn(async () => {});

    const sessionSpy = vi
      .spyOn(workspaceSessionModule, "useWorkspaceSession")
      .mockImplementation(() =>
        createSessionState({
          screen: "workspace",
          project,
          openFolder,
        })
      );

    mockInvoke({
      get_config: createMakiConfig(),
      get_git_status: {
        branch: "main",
        dirty: false,
        is_repo: true,
      },
      spawn_pty: [31, 32],
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("web")).toBeInTheDocument();
    });

    const openFolderButton = screen.getByRole("button", {
      name: /open folder/i,
    });

    fireEvent.click(openFolderButton);
    fireEvent.keyDown(window, {
      key: "o",
      metaKey: true,
    });

    expect(openFolder).toHaveBeenCalledTimes(2);

    sessionSpy.mockRestore();
  });

  it("keeps existing workspace terminals alive when open folder targets a configless project", async () => {
    const currentProject = createInspection();
    const targetProject = createInspection({
      name: "beta",
      path: "/projects/beta",
      has_config: false,
      script_hints: ["npm run dev"],
    });

    let allowOpenFolder = false;
    let inspectCalls = 0;
    let saveCalls = 0;
    let spawnCalls = 0;

    invokeMock.mockImplementation(async (command) => {
      switch (command) {
        case "load_app_state":
          return createAppState({
            last_project_path: currentProject.path,
            recent_projects: [createRecentProject()],
          });
        case "inspect_project_folder":
          inspectCalls += 1;
          if (inspectCalls === 1) {
            return currentProject;
          }
          if (inspectCalls === 2 && allowOpenFolder) {
            return targetProject;
          }
          throw new Error(`Unexpected inspect_project_folder call ${inspectCalls}`);
        case "get_current_project_window":
          return createCurrentWindow({
            project_path: currentProject.path,
          });
        case "bind_current_project_window":
          return createCurrentWindow({
            project_path: currentProject.path,
          });
        case "save_app_state":
          saveCalls += 1;
          if (saveCalls === 1) {
            return createAppState({
              last_project_path: currentProject.path,
              recent_projects: [createRecentProject()],
            });
          }
          if (saveCalls === 2 && allowOpenFolder) {
            return createAppState({
              last_project_path: targetProject.path,
              recent_projects: [
                createRecentProject({
                  name: targetProject.name,
                  path: targetProject.path,
                }),
                createRecentProject(),
              ],
            });
          }
          throw new Error(`Unexpected save_app_state call ${saveCalls}`);
        case "get_config":
          return createMakiConfig();
        case "get_git_status":
          return {
            branch: "main",
            dirty: false,
            is_repo: true,
          };
        case "spawn_pty":
          spawnCalls += 1;
          return 40 + spawnCalls;
        case "open_folder_dialog":
          if (!allowOpenFolder) {
            throw new Error("open_folder_dialog called before user action");
          }
          return targetProject.path;
        case "open_project_window":
          return {
            project_path: targetProject.path,
            window_label: "project-9",
            created: true,
          };
        default:
          throw new Error(`Unexpected invoke(${command})`);
      }
    });

    render(<App />);

    await waitFor(() => {
      const spawnCalls = invokeMock.mock.calls.filter(
        ([command]) => command === "spawn_pty"
      );
      // 2 default shells + process tabs with autostart
      expect(spawnCalls.length).toBeGreaterThanOrEqual(2);
    });

    expect(invokeMock).not.toHaveBeenCalledWith("open_folder_dialog");

    allowOpenFolder = true;

    fireEvent.keyDown(window, {
      key: "o",
      metaKey: true,
    });

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("open_project_window", {
        projectPath: targetProject.path,
      });
    });

    expect(screen.getByRole("button", { name: /open folder/i })).toBeInTheDocument();
    expect(screen.queryByText(/set up beta/i)).not.toBeInTheDocument();
    expect(invokeMock).not.toHaveBeenCalledWith("kill_pty", {
      sessionId: 41,
    });
    expect(invokeMock).not.toHaveBeenCalledWith("kill_pty", {
      sessionId: 42,
    });
  });
});
