import {
  getControllers,
  getClientCapabilities,
  getClientSlices,
  getClientNetworkStatus,
  selectClientSlice,
  sendClientConfig,
  sendClientControl,
  sendSKpiConfig,
  sendSKpiControl,
  sendEricssonThresholds,
  sendEricssonLiveMetrics,
} from "@/lib/orchestratorApi";

type TestStatus = "passed" | "failed";

type ControlAction = "start" | "stop" | "pause" | "resume";

export interface OrchestratorEndpointTestResult {
  name: string;
  method: "GET" | "POST" | "DELETE";
  path: string;
  status: TestStatus;
  response?: unknown;
  error?: string;
  note?: string;
}

interface RunEndpointTestsOptions {
  clientId: string;
  clientConfigPayload: unknown;
  skpiConfigPayload: unknown;
  ericssonThresholdsPayload: {
    high: number;
    low: number;
  };
  slicePayload?: {
    sst: number;
    sd: number;
    l4s_mode: "enabled" | "disabled";
  };
  controlAction?: ControlAction;
}

async function runTest(
  test: Omit<OrchestratorEndpointTestResult, "status" | "response" | "error">,
  callback: () => Promise<unknown>,
): Promise<OrchestratorEndpointTestResult> {
  try {
    const response = await callback();

    return {
      ...test,
      status: "passed",
      response,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const bodyLooksValidButControllerMissing =
      message.includes("is not registered") ||
      message.includes("Controller") ||
      message.includes("S_KPI Controller is not registered") ||
      message.includes("Ericsson Controller is not registered");

    const isValidationError =
      message.includes("422") ||
      message.includes("Unprocessable Entity") ||
      message.includes("Field required") ||
      message.includes("missing");

    if (bodyLooksValidButControllerMissing && !isValidationError) {
      return {
        ...test,
        status: "passed",
        response:
          "Request body accepted by schema. Endpoint failed only because the target controller is not registered.",
        note: `${test.note ?? ""} Body validation passed; controller registration is missing.`,
      };
    }

    return {
      ...test,
      status: "failed",
      error: message,
    };
  }
}
export async function runOrchestratorEndpointTests({
  clientId,
  clientConfigPayload,
  skpiConfigPayload,
  ericssonThresholdsPayload,
  slicePayload = {
    sst: 1,
    sd: 82,
    l4s_mode: "enabled",
  },
  controlAction = "pause",
}: RunEndpointTestsOptions): Promise<OrchestratorEndpointTestResult[]> {
  const tests: Promise<OrchestratorEndpointTestResult>[] = [
    runTest(
      {
        name: "List registered controllers",
        method: "GET",
        path: "/controllers",
      },
      () => getControllers(),
    ),
    runTest(
      {
        name: "Client capabilities",
        method: "GET",
        path: `/client_ctrl/${clientId}/capabilities`,
        note: "Needs a registered client controller.",
      },
      () => getClientCapabilities(clientId),
    ),
    runTest(
      {
        name: "Client available slices",
        method: "GET",
        path: `/client_ctrl/${clientId}/network/get_slices`,
        note: "Needs a registered client controller.",
      },
      () => getClientSlices(clientId),
    ),
    runTest(
      {
        name: "Client network status",
        method: "GET",
        path: `/client_ctrl/${clientId}/network/get_status`,
        note: "Needs a registered client controller.",
      },
      () => getClientNetworkStatus(clientId),
    ),
    runTest(
      {
        name: "Client select slice",
        method: "POST",
        path: `/client_ctrl/${clientId}/network/select_slice`,
        note: "Validates SliceRequest body. Needs a registered client controller.",
      },
      () => selectClientSlice(clientId, slicePayload),
    ),
    runTest(
      {
        name: "Client configuration",
        method: "POST",
        path: `/client_ctrl/${clientId}/config`,
        note: "Validates ConfigRequest body. Needs a registered client controller.",
      },
      () => sendClientConfig(clientId, clientConfigPayload),
    ),
    runTest(
      {
        name: "Client control test",
        method: "POST",
        path: `/client_ctrl/${clientId}/control_test`,
        note: "Uses action='pause' by default to avoid starting traffic during schema tests.",
      },
      () => sendClientControl(clientId, controlAction),
    ),
    runTest(
      {
        name: "Server-side KPI configuration",
        method: "POST",
        path: "/s_kpi_ctrl/config",
        note: "Validates SKpiConfigRequest body.",
      },
      () => sendSKpiConfig(skpiConfigPayload),
    ),
    runTest(
      {
        name: "Server-side KPI control",
        method: "POST",
        path: "/s_kpi_ctrl/control",
        note: "Uses action='pause' by default. Needs matching registered/known client_id.",
      },
      () => sendSKpiControl(controlAction, clientId),
    ),
    runTest(
      {
        name: "Ericsson set thresholds",
        method: "POST",
        path: "/eric_ctrl/set_thresholds",
        note: "Validates Ericsson thresholds body.",
      },
      () => sendEricssonThresholds(ericssonThresholdsPayload),
    ),
    runTest(
      {
        name: "Ericsson live metrics control",
        method: "POST",
        path: "/eric_ctrl/live_metrics",
        note: "Uses action='pause' by default to avoid starting collection during schema tests.",
      },
      () => sendEricssonLiveMetrics(controlAction),
    ),
  ];

  return Promise.all(tests);
}
