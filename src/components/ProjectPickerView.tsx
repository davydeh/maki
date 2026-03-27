import type { RecentProject } from "../types";

interface ProjectPickerViewProps {
  recentProjects: RecentProject[];
  restoreError: string | null;
  onOpenFolder: () => void | Promise<void>;
  onSelectRecentProject: (project: RecentProject) => void | Promise<void>;
}

export function ProjectPickerView({
  recentProjects,
  restoreError,
  onOpenFolder,
  onSelectRecentProject,
}: ProjectPickerViewProps) {
  return (
    <div className="shell-screen">
      <div className="shell-panel project-picker">
        <div className="project-picker__body">
          <div className="shell-copy">
            <span className="shell-kicker">maki</span>
            <h1 className="shell-title">Choose a workspace</h1>
            <p className="shell-subtitle">
              Open a project folder or recover from one of your recent workspaces.
            </p>
          </div>

          {restoreError && (
            <div className="shell-error-banner" role="alert">
              {restoreError}
            </div>
          )}

          <section className="shell-section" aria-labelledby="recent-projects-title">
            <div className="shell-section-header">
              <h2 className="shell-section-title" id="recent-projects-title">
                Recent Projects
              </h2>
            </div>

            {recentProjects.length === 0 ? (
              <div className="shell-field project-picker__empty">
                No recent projects yet. Open a folder to start a workspace.
              </div>
            ) : (
              <div className="project-picker__list">
                {recentProjects.map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    className="project-picker__item"
                    onClick={() => {
                      void onSelectRecentProject(project);
                    }}
                  >
                    <span className="project-picker__name">{project.name}</span>
                    <span className="project-picker__path">{project.path}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="shell-actions project-picker__footer">
          <button
            type="button"
            className="shell-button"
            onClick={() => {
              void onOpenFolder();
            }}
          >
            Open Folder...
          </button>
        </div>
      </div>
    </div>
  );
}
