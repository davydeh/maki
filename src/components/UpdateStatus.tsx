import { useEffect, useState } from "react";
import { relaunch } from "@tauri-apps/plugin-process";
import type { Update } from "@tauri-apps/plugin-updater";
import type { Theme } from "../themes";

interface UpdateStatusProps {
  availableUpdate: Update | null;
  theme: Theme;
}

export function UpdateStatus({ availableUpdate, theme }: UpdateStatusProps) {
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  useEffect(() => {
    setUpdateError(null);
    setUpdating(false);
  }, [availableUpdate]);

  const handleUpdate = async () => {
    if (!availableUpdate || updating) return;

    setUpdating(true);

    try {
      await availableUpdate.downloadAndInstall();
      await relaunch();
    } catch (e) {
      setUpdateError(e instanceof Error ? e.message : String(e));
      setUpdating(false);
    }
  };

  return (
    <>
      {updateError && (
        <span style={{ color: theme.errored }} title={updateError}>
          Update failed
        </span>
      )}
      {availableUpdate && !updateError && (
        <button
          onClick={handleUpdate}
          disabled={updating}
          style={{
            background: "none",
            border: "none",
            padding: 0,
            color: theme.accent,
            cursor: updating ? "wait" : "pointer",
          }}
          title={updating ? "Installing update..." : "Click to update and restart"}
        >
          {updating ? "Installing..." : `Update available: v${availableUpdate.version}`}
        </button>
      )}
    </>
  );
}
