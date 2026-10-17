import { useCallback, useEffect, useState } from "react";

// Assignment + status for each police station / medical facility, keyed by
// station id. Saved in this browser's localStorage (no backend yet).

// v2 uses stable included-user IDs; old name-based demo state remains untouched in v1.
const STORAGE_KEY = "roadsafe:responders:v2";
const DEFAULT = { assignee: "", status: "Available", request: null };

function read() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

export default function useResponderState() {
  const [state, setState] = useState(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage unavailable - state still works in memory */
    }
  }, [state]);

  const get = useCallback((id) => ({ ...DEFAULT, ...state[id] }), [state]);

  const update = useCallback((id, patch) => {
    setState((prev) => ({ ...prev, [id]: { ...DEFAULT, ...prev[id], ...patch } }));
  }, []);

  const setAssignee = useCallback(
    (id, assignee) => update(id, { assignee }),
    [update]
  );

  const setStatus = useCallback(
    (id, status) =>
      update(id, status === "Available" ? { status, request: null } : { status }),
    [update]
  );

  const requestAssistance = useCallback(
    (id, scene) =>
      update(id, {
        status: "Assistance Requested",
        request: {
          id: `REQ-${Date.now().toString(36).slice(-5).toUpperCase()}`,
          reportId: scene.reportId,
          sceneLabel: scene.label,
          requestedAt: new Date().toISOString(),
        },
      }),
    [update]
  );

  const release = useCallback(
    (id) => update(id, { status: "Available", request: null }),
    [update]
  );

  return { get, setAssignee, setStatus, requestAssistance, release };
}
