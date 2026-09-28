const API_BASE_URL = "/api/orchestrator";

type ControlAction = "start" | "stop" | "pause" | "resume";

async function apiRequest(path: string, options?: RequestInit) {
  if (!API_BASE_URL) {
    throw new Error("NEXT_PUBLIC_ORCHESTRATOR_URL is not defined");
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...options,
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(`API error ${response.status}: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function getControllers() {
  return apiRequest("/controllers");
}

export function getClientCapabilities(ctrlId: string) {
  return apiRequest(`/client_ctrl/${ctrlId}/capabilities`);
}

export function getClientSlices(ctrlId: string) {
  return apiRequest(`/client_ctrl/${ctrlId}/network/get_slices`);
}

export function getClientNetworkStatus(ctrlId: string) {
  return apiRequest(`/client_ctrl/${ctrlId}/network/get_status`);
}

export function selectClientSlice(
  ctrlId: string,
  payload: {
    CID?: number;
    SST?: number;
    SD?: number;
    DNN?: string;
  },
) {
  return apiRequest(`/client_ctrl/${ctrlId}/network/select_slice`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
export function sendClientConfig(ctrlId: string, payload: unknown) {
  return apiRequest(`/client_ctrl/${ctrlId}/config`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sendClientControl(ctrlId: string, action: ControlAction) {
  return apiRequest(`/client_ctrl/${ctrlId}/control_test`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function sendSKpiConfig(payload: unknown) {
  return apiRequest("/s_kpi_ctrl/config", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sendSKpiControl(action: ControlAction, clientId: string) {
  return apiRequest("/s_kpi_ctrl/control", {
    method: "POST",
    body: JSON.stringify({
      action,
      client_id: clientId,
    }),
  });
}

export function sendEricssonThresholds(payload: {
  high: number;
  low: number;
}) {
  return apiRequest("/eric_ctrl/set_thresholds", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function sendEricssonLiveMetrics(action: ControlAction) {
  return apiRequest("/eric_ctrl/live_metrics", {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}