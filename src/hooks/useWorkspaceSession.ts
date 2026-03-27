import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AppScreen,
  DetectedCommand,
  ProjectInspection,
  ProjectWindowContext,
  ProjectWindowOpenResult,
  RecentProject,
  WizardCommandUpdate,
  WizardDraft,
  WorkspaceAppState,
} from "../types";

const DEFAULT_APP_STATE: WorkspaceAppState = {
  version: 1,
  last_project_path: null,
  recent_projects: [],
};

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function normalizeAppState(state: WorkspaceAppState | null | undefined): WorkspaceAppState {
  if (!state) {
    return DEFAULT_APP_STATE;
  }

  return {
    version: state.version ?? DEFAULT_APP_STATE.version,
    last_project_path: state.last_project_path ?? null,
    recent_projects: state.recent_projects ?? [],
  };
}

function buildRecentProjects(
  currentRecents: RecentProject[],
  project: Pick<ProjectInspection, "name" | "path">
): RecentProject[] {
  const nextRecent: RecentProject = {
    name: project.name,
    path: project.path,
  };

  return [
    nextRecent,
    ...currentRecents.filter((recent) => recent.path !== project.path),
  ];
}

function createAppStateUpdate(
  currentState: WorkspaceAppState,
  project: Pick<ProjectInspection, "name" | "path">
): WorkspaceAppState {
  return {
    ...currentState,
    last_project_path: project.path,
    recent_projects: buildRecentProjects(currentState.recent_projects, project),
  };
}

function normalizeCommandName(command: string): string {
  const trimmed = command.trim();

  if (!trimmed) {
    return "process";
  }

  const npmRunMatch = trimmed.match(/^npm run ([^\s]+)$/);
  if (npmRunMatch) {
    return npmRunMatch[1];
  }

  const npmMatch = trimmed.match(/^npm ([^\s]+)$/);
  if (npmMatch) {
    return npmMatch[1];
  }

  const artisanMatch = trimmed.match(/^php artisan ([^\s]+)$/);
  if (artisanMatch) {
    return artisanMatch[1];
  }

  const pythonModuleMatch = trimmed.match(/^python -m ([^\s]+)$/);
  if (pythonModuleMatch) {
    const moduleSegments = pythonModuleMatch[1].split(".");
    return moduleSegments[moduleSegments.length - 1] ?? pythonModuleMatch[1];
  }

  const pythonFileMatch = trimmed.match(/^python ([^\s]+)$/);
  if (pythonFileMatch) {
    const pathSegments = pythonFileMatch[1].split("/");
    const fileName = pathSegments[pathSegments.length - 1] ?? pythonFileMatch[1];
    return fileName.replace(/\.[^.]+$/, "");
  }

  const segments = trimmed.split(/\s+/);
  const tailSegment = segments[segments.length - 1];

  return tailSegment?.replace(/[^a-zA-Z0-9:_-]+/g, "-").replace(/^-+|-+$/g, "") || "process";
}

function buildWizardDraft(inspection: ProjectInspection): WizardDraft {
  const usedCommands = new Set<string>();
  const nameUsage = new Map<string, number>();
  const detectedCommands = [
    ...inspection.script_hints.map((command) => ({
      command,
      source: "script_hint" as const,
    })),
    ...inspection.entrypoint_hints.map((command) => ({
      command,
      source: "entrypoint_hint" as const,
    })),
  ];
  const commands = detectedCommands.flatMap(({ command, source }, index): DetectedCommand[] => {
    if (usedCommands.has(command)) {
      return [];
    }

    usedCommands.add(command);
    const baseName = normalizeCommandName(command);
    const count = nameUsage.get(baseName) ?? 0;
    const name = count === 0 ? baseName : `${baseName}-${count + 1}`;
    nameUsage.set(baseName, count + 1);

    return [
      {
        id: `detected-${index}`,
        name,
        cmd: command,
        enabled: true,
        autostart: true,
        source,
      },
    ];
  });

  return {
    project_name: inspection.name,
    commands,
  };
}

function toConfigDraft(draft: WizardDraft) {
  return {
    project_name: draft.project_name,
    theme: draft.theme,
    commands: draft.commands.map((command) => ({
      name: command.name,
      cmd: command.cmd,
      enabled: command.enabled,
      autostart: command.autostart,
    })),
  };
}

function toSaveConfigRequest(projectPath: string, draft: WizardDraft) {
  return {
    request: {
      project_path: projectPath,
      draft: toConfigDraft(draft),
    },
  };
}

function isBlank(value: string): boolean {
  return value.trim().length === 0;
}

function hasInvalidEnabledCommands(draft: WizardDraft): boolean {
  return draft.commands.some(
    (command) => command.enabled && (isBlank(command.name) || isBlank(command.cmd))
  );
}

export interface WorkspaceSessionState {
  screen: AppScreen;
  appState: WorkspaceAppState;
  project: ProjectInspection | null;
  restoreError: string | null;
  wizardDraft: WizardDraft | null;
  wizardPreview: string | null;
  wizardPreviewError: string | null;
  wizardPreviewPending: boolean;
  wizardPreviewDirty: boolean;
  wizardSavePending: boolean;
  openFolder: () => Promise<void>;
  openRecentProject: (project: RecentProject) => Promise<void>;
  addWizardCommand: () => void;
  updateWizardCommand: (commandId: string, updates: WizardCommandUpdate) => void;
  refreshWizardPreview: (draft?: WizardDraft) => Promise<void>;
  saveWizardConfig: (draft?: WizardDraft) => Promise<void>;
}

function getDraftSignature(draft: WizardDraft): string {
  return JSON.stringify(toConfigDraft(draft));
}

export function useWorkspaceSession(): WorkspaceSessionState {
  const [screen, setScreen] = useState<AppScreen>("booting");
  const [appState, setAppState] = useState<WorkspaceAppState>(DEFAULT_APP_STATE);
  const [project, setProject] = useState<ProjectInspection | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [wizardDraft, setWizardDraft] = useState<WizardDraft | null>(null);
  const [wizardPreview, setWizardPreview] = useState<string | null>(null);
  const [wizardPreviewError, setWizardPreviewError] = useState<string | null>(null);
  const [wizardPreviewPending, setWizardPreviewPending] = useState(false);
  const [wizardPreviewDirty, setWizardPreviewDirty] = useState(false);
  const [wizardSavePending, setWizardSavePending] = useState(false);
  const [wizardPreviewSignature, setWizardPreviewSignature] = useState<string | null>(null);
  const appStateRef = useRef(DEFAULT_APP_STATE);
  const projectRef = useRef<ProjectInspection | null>(null);
  const wizardDraftRef = useRef<WizardDraft | null>(null);
  const previewRequestIdRef = useRef(0);
  const nextManualCommandIdRef = useRef(0);

  useEffect(() => {
    appStateRef.current = appState;
  }, [appState]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    wizardDraftRef.current = wizardDraft;
  }, [wizardDraft]);

  const persistAppState = useCallback(
    async (baseState: WorkspaceAppState, inspection: ProjectInspection) => {
      const nextState = createAppStateUpdate(baseState, inspection);
      const savedState = normalizeAppState(
        await invoke<WorkspaceAppState>("save_app_state", {
          state: nextState,
        })
      );

      setAppState(savedState);
      return savedState;
    },
    []
  );

  const routeToProjectWindow = useCallback(async (projectPath: string) => {
    return invoke<ProjectWindowOpenResult>("open_project_window", {
      projectPath,
    });
  }, []);

  const bindCurrentProjectWindow = useCallback(async (projectPath: string) => {
    return invoke<ProjectWindowContext>("bind_current_project_window", {
      projectPath,
    });
  }, []);

  const inspectProject = useCallback(async (path: string) => {
    return invoke<ProjectInspection>("inspect_project_folder", { path });
  }, []);

  const clearWizardState = useCallback(() => {
    previewRequestIdRef.current += 1;
    nextManualCommandIdRef.current = 0;
    setWizardDraft(null);
    setWizardPreview(null);
    setWizardPreviewError(null);
    setWizardPreviewPending(false);
    setWizardPreviewDirty(false);
    setWizardSavePending(false);
    setWizardPreviewSignature(null);
  }, []);

  const refreshWizardPreview = useCallback(
    async (draftOverride?: WizardDraft) => {
      const draftToPreview = draftOverride ?? wizardDraftRef.current;
      if (!draftToPreview) {
        return;
      }

      if (hasInvalidEnabledCommands(draftToPreview)) {
        setWizardPreviewError("Complete every enabled command before generating the preview.");
        setWizardPreviewPending(false);
        setWizardPreviewSignature(null);
        return;
      }

      const requestId = previewRequestIdRef.current + 1;
      previewRequestIdRef.current = requestId;
      setWizardPreviewPending(true);
      setWizardPreviewError(null);

      try {
        const preview = await invoke<string>("generate_config_preview", {
          draft: toConfigDraft(draftToPreview),
        });

        if (previewRequestIdRef.current !== requestId) {
          return;
        }

        setWizardPreview(preview);
        setWizardPreviewDirty(false);
        setWizardPreviewSignature(getDraftSignature(draftToPreview));
      } catch (error) {
        if (previewRequestIdRef.current !== requestId) {
          return;
        }

        setWizardPreview(null);
        setWizardPreviewError(toErrorMessage(error));
        setWizardPreviewDirty(false);
        setWizardPreviewSignature(null);
      } finally {
        if (previewRequestIdRef.current === requestId) {
          setWizardPreviewPending(false);
        }
      }
    },
    []
  );

  const enterWizardLocally = useCallback(
    async (baseState: WorkspaceAppState, inspection: ProjectInspection) => {
      const nextDraft = buildWizardDraft(inspection);

      setProject(inspection);
      setRestoreError(null);
      setWizardDraft(nextDraft);
      setWizardPreview(null);
      setWizardPreviewError(null);
      setWizardPreviewPending(false);
      setWizardPreviewDirty(false);
      setWizardSavePending(false);
      setWizardPreviewSignature(null);
      nextManualCommandIdRef.current = 0;
      setScreen("wizard");

      try {
        await persistAppState(baseState, inspection);
      } catch (error) {
        setRestoreError(toErrorMessage(error));
      }

      void refreshWizardPreview(nextDraft);
    },
    [persistAppState, refreshWizardPreview]
  );

  const enterWorkspaceLocally = useCallback(
    async (baseState: WorkspaceAppState, inspection: ProjectInspection) => {
      setProject(inspection);
      clearWizardState();
      setRestoreError(null);
      await bindCurrentProjectWindow(inspection.path);
      await persistAppState(baseState, inspection);
      setScreen("workspace");
    },
    [bindCurrentProjectWindow, clearWizardState, persistAppState]
  );

  const openProject = useCallback(
    async (path: string) => {
      try {
        const inspection = await inspectProject(path);
        const currentAppState = appStateRef.current;
        const currentProject = projectRef.current;

        if (!inspection.exists) {
          setProject(null);
          clearWizardState();
          setRestoreError(`Project folder ${inspection.path} does not exist`);
          setScreen("invalid");
          return;
        }

        if (!currentProject || currentProject.path !== inspection.path) {
          if (currentProject) {
            await routeToProjectWindow(inspection.path);
            await persistAppState(currentAppState, inspection);
            setRestoreError(null);
            return;
          }

          if (!inspection.has_config) {
            await enterWizardLocally(currentAppState, inspection);
            return;
          }

          await routeToProjectWindow(inspection.path);
          await persistAppState(currentAppState, inspection);
          setRestoreError(null);
          return;
        }

        setRestoreError(null);

        if (inspection.has_config) {
          await enterWorkspaceLocally(currentAppState, inspection);
          return;
        }

        await enterWizardLocally(currentAppState, inspection);
      } catch (error) {
        setRestoreError(toErrorMessage(error));
      }
    },
    [
      clearWizardState,
      enterWizardLocally,
      enterWorkspaceLocally,
      inspectProject,
      persistAppState,
      routeToProjectWindow,
    ]
  );

  const openFolder = useCallback(async () => {
    const selectedPath = await invoke<string | null>("open_folder_dialog");
    if (!selectedPath) {
      return;
    }

    await openProject(selectedPath);
  }, [openProject]);

  const openRecentProject = useCallback(
    async (recentProject: RecentProject) => {
      await openProject(recentProject.path);
    },
    [openProject]
  );

  const updateWizardCommand = useCallback(
    (commandId: string, updates: WizardCommandUpdate) => {
      setWizardDraft((currentDraft) => {
        if (!currentDraft) {
          return currentDraft;
        }

        return {
          ...currentDraft,
          commands: currentDraft.commands.map((command) =>
            command.id === commandId ? { ...command, ...updates } : command
          ),
        };
      });
      setWizardPreviewError(null);
      setWizardPreviewDirty(true);
      setWizardPreviewSignature(null);
    },
    []
  );

  const addWizardCommand = useCallback(() => {
    const manualId = `manual-${nextManualCommandIdRef.current++}`;

    setWizardDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        commands: [
          ...currentDraft.commands,
          {
            id: manualId,
            name: "",
            cmd: "",
            enabled: true,
            autostart: true,
            source: "manual",
          },
        ],
      };
    });
    setWizardPreviewError(null);
    setWizardPreviewDirty(true);
    setWizardPreviewSignature(null);
  }, []);

  const saveWizardConfig = useCallback(
    async (draftOverride?: WizardDraft) => {
      const currentProject = projectRef.current;
      if (!currentProject) {
        return;
      }

      const draftToSave = draftOverride ?? wizardDraft;
      if (!draftToSave) {
        return;
      }

      if (hasInvalidEnabledCommands(draftToSave)) {
        setRestoreError("Complete every enabled command before saving the config.");
        setScreen("wizard");
        return;
      }

      if (
        wizardPreviewPending ||
        wizardPreviewError ||
        !wizardPreview ||
        wizardPreviewSignature !== getDraftSignature(draftToSave)
      ) {
        setRestoreError("Refresh the YAML preview before saving the config.");
        setScreen("wizard");
        return;
      }

      setWizardSavePending(true);
      setRestoreError(null);

      try {
        await invoke<string>("save_config", toSaveConfigRequest(currentProject.path, draftToSave));

        const refreshedInspection = await inspectProject(currentProject.path);
        setProject(refreshedInspection);

        if (!refreshedInspection.has_config) {
          setWizardDraft(draftToSave);
          setScreen("wizard");
          return;
        }

        await enterWorkspaceLocally(appStateRef.current, refreshedInspection);
      } catch (error) {
        setProject(currentProject);
        setWizardDraft(draftToSave);
        setRestoreError(toErrorMessage(error));
        setScreen("wizard");
      } finally {
        setWizardSavePending(false);
      }
    },
    [
      enterWorkspaceLocally,
      inspectProject,
      wizardDraft,
      wizardPreview,
      wizardPreviewError,
      wizardPreviewPending,
      wizardPreviewSignature,
    ]
  );

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      let loadedState = DEFAULT_APP_STATE;

      try {
        loadedState = normalizeAppState(await invoke<WorkspaceAppState>("load_app_state"));

        if (cancelled) {
          return;
        }

        setAppState(loadedState);

        if (!loadedState.last_project_path) {
          setScreen("picker");
          return;
        }

        const inspection = await inspectProject(loadedState.last_project_path);

        if (cancelled) {
          return;
        }

        if (!inspection.exists) {
          setRestoreError(`Project folder ${inspection.path} does not exist`);
          setScreen("invalid");
          return;
        }

        if (!inspection.has_config) {
          await enterWizardLocally(loadedState, inspection);
          return;
        }

        let currentWindow: ProjectWindowContext | null = null;

        try {
          currentWindow = await invoke<ProjectWindowContext>("get_current_project_window");
        } catch {
          currentWindow = null;
        }

        if (cancelled) {
          return;
        }

        if (currentWindow && currentWindow.project_path !== inspection.path) {
          await routeToProjectWindow(inspection.path);
          return;
        }

        await enterWorkspaceLocally(loadedState, inspection);

        if (cancelled) {
          return;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setProject(null);
        clearWizardState();
        setRestoreError(toErrorMessage(error));
        setAppState(loadedState);
        setScreen("invalid");
      }
    }

    void boot();

    return () => {
      cancelled = true;
    };
  }, [clearWizardState, enterWizardLocally, enterWorkspaceLocally, inspectProject, routeToProjectWindow]);

  return {
    screen,
    appState,
    project,
    restoreError,
    wizardDraft,
    wizardPreview,
    wizardPreviewError,
    wizardPreviewPending,
    wizardPreviewDirty,
    wizardSavePending,
    openFolder,
    openRecentProject,
    addWizardCommand,
    updateWizardCommand,
    refreshWizardPreview,
    saveWizardConfig,
  };
}
