import { listen, type EventCallback } from "@tauri-apps/api/event";

export function listenSafely<T>(
  event: string,
  handler: EventCallback<T>,
): () => void {
  let disposed = false;
  let unlisten: null | (() => void) = null;

  void listen<T>(event, handler).then((nextUnlisten) => {
    if (disposed) {
      nextUnlisten();
      return;
    }

    unlisten = nextUnlisten;
  });

  return () => {
    disposed = true;
    if (unlisten) {
      unlisten();
      unlisten = null;
    }
  };
}
