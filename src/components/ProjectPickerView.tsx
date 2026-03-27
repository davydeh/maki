import type { RecentProject } from "../types";

interface ProjectPickerViewProps {
  recentProjects: RecentProject[];
  restoreError: string | null;
  onOpenFolder: () => void | Promise<void>;
  onSelectRecentProject: (project: RecentProject) => void | Promise<void>;
}

function shortenPath(fullPath: string): string {
  const home = "/Users/";
  const idx = fullPath.indexOf(home);
  if (idx === -1) return fullPath;
  const afterHome = fullPath.slice(idx + home.length);
  const slashIdx = afterHome.indexOf("/");
  if (slashIdx === -1) return "~";
  return "~" + afterHome.slice(slashIdx);
}

function parentDir(fullPath: string): string {
  const short = shortenPath(fullPath);
  const lastSlash = short.lastIndexOf("/");
  if (lastSlash <= 0) return short;
  return short.slice(0, lastSlash);
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
          <div className="project-picker__header">
            <span className="project-picker__brand">maki</span>
          </div>

          {restoreError && (
            <div className="shell-error-banner" role="alert">
              {restoreError}
            </div>
          )}

          <div className="project-picker__actions">
            <button
              type="button"
              className="project-picker__card"
              onClick={() => {
                void onOpenFolder();
              }}
            >
              <svg
                className="project-picker__card-icon"
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
              <span className="project-picker__card-label">Open folder</span>
            </button>
          </div>

          <section
            className="project-picker__recents"
            aria-labelledby="recent-projects-title"
          >
            <div className="project-picker__recents-header">
              <h2
                className="project-picker__recents-title"
                id="recent-projects-title"
              >
                Recent projects
              </h2>
              {recentProjects.length > 5 && (
                <span className="project-picker__recents-count">
                  View all ({recentProjects.length})
                </span>
              )}
            </div>

            {recentProjects.length === 0 ? (
              <p className="project-picker__empty">
                No recent projects yet. Open a folder to get started.
              </p>
            ) : (
              <div className="project-picker__list">
                {recentProjects.slice(0, 5).map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    className="project-picker__row"
                    onClick={() => {
                      void onSelectRecentProject(project);
                    }}
                  >
                    <span className="project-picker__name">
                      {project.name}
                    </span>
                    <span className="project-picker__path">
                      {parentDir(project.path)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
