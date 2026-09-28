"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getControllers,
  selectClientSlice,
  sendClientConfig,
  sendEricssonThresholds,
  sendSKpiConfig,
} from "@/lib/orchestratorApi";

type ExperimentMode = "L4S / Classic" | "L4S Only" | "Classic Only";
type ExperimentStatus = "scheduled" | "paused" | "cancelled" | "completed";
type DisplayStatus =
  | "Scheduled"
  | "Running"
  | "Paused"
  | "Finished"
  | "Completed"
  | "Cancelled";

type ClientType = "client" | "ericsson" | "kpi" | "smart phone";
type ConfigurationMode = "Default" | "Custom";
type TrafficSource = "Local File" | "Docker Image";
type LocalTrafficProfile =
  | "bulk_http"
  | "web_api"
  | "volumetric_tiles"
  | "interactive_xr_ws"
  | "abr_video";

type ClientKpi = "E2E latency" | "CE marking" | "Goodput";
type KpiControllerKpi = "E2E latency" | "retransmissions";

interface Controller {
  client_id: string;
  client_type: ClientType;
  l4s_capable: boolean;
}

interface ControllerCapabilities {
  system: {
    os: string;
    architecture: string;
    cpu_cores: number;
    ram_gb: number;
  };
  l4s: {
    enabled: boolean;
    tcp_congestion_control: string;
  };
}

interface ExperimentConfiguration {
  name: string;
  mode: ExperimentMode;
  test_duration: number;
  repeat: number;
  waiting_time: number;
}

interface KpiParameterConfiguration {
  network: {
    interface: string;
    source_ip: string;
    port: string;
  };
  influxdb: {
    url: string;
    token: string;
    org: string;
    bucket: string;
    measurement: string;
  };
  experiment: {
    test_duration: number;
    repeat: number;
    waiting_time: number;
  };
  debug: boolean;
}

interface ClientControllerConfiguration {
  pduSession: {
    sst: string;
    sd: string;
    active: boolean;
  };
  mode: ConfigurationMode;
  traffic: {
    source: TrafficSource;
    localProfile: LocalTrafficProfile;
    dockerImage: string;
    port: string;
  };
  selectedKpis: ClientKpi[];
  kpiParameters: KpiParameterConfiguration;
}

interface KpiControllerConfiguration {
  mode: ConfigurationMode;
  selectedKpis: KpiControllerKpi[];
  kpiParameters: KpiParameterConfiguration;
}

interface EricssonControllerConfiguration {
  l4sThresholds: {
    highThreshold: string;
    lowThreshold: string;
  };
}

type ClientControllerConfigurationMap = Record<string, ClientControllerConfiguration>;
type KpiControllerConfigurationMap = Record<string, KpiControllerConfiguration>;

interface Experiment {
  id: string;
  name: string;
  mode: ExperimentMode;
  startsAt: string;
  durationMinutes: number;
  status: ExperimentStatus;
  configuration: ExperimentConfiguration;
  clientControllers: ClientControllerConfigurationMap;
  kpiControllers: KpiControllerConfigurationMap;
  ericssonController: EricssonControllerConfiguration;
}

interface Slice {
  sst: string;
  sd: string;
  dnn: string;
}

interface NetworkStatus {
  dnn: string;
  active_slice: string;
  ip_address: string;
}

const STORAGE_KEY = "l4s-testbed-experiments";
const RECOMMENDED_WAITING_TIME = 240;

const LOCAL_TRAFFIC_PORTS: Record<LocalTrafficProfile, string> = {
  bulk_http: "8101",
  web_api: "8102",
  abr_video: "8103",
  volumetric_tiles: "8104",
  interactive_xr_ws: "8105",
};

const REGISTERED_CONTROLLERS: Controller[] = [
  { client_id: "client_0", client_type: "client", l4s_capable: true },
  { client_id: "client_1", client_type: "kpi", l4s_capable: false },
  { client_id: "client_2", client_type: "ericsson", l4s_capable: true },
  { client_id: "client_3", client_type: "smart phone", l4s_capable: true },
];

const CONTROLLER_CAPABILITIES: Record<string, ControllerCapabilities> = {
  client_0: {
    system: {
      os: "Ubuntu 22.04 LTS",
      architecture: "x86_64",
      cpu_cores: 8,
      ram_gb: 16,
    },
    l4s: { enabled: true, tcp_congestion_control: "prague" },
  },
  client_1: {
    system: {
      os: "Ubuntu 22.04 LTS",
      architecture: "x86_64",
      cpu_cores: 4,
      ram_gb: 8,
    },
    l4s: { enabled: false, tcp_congestion_control: "cubic" },
  },
  client_2: {
    system: {
      os: "Ericsson RAN Runtime",
      architecture: "arm64",
      cpu_cores: 16,
      ram_gb: 32,
    },
    l4s: { enabled: true, tcp_congestion_control: "prague" },
  },
  client_3: {
    system: {
      os: "Android 15",
      architecture: "arm64",
      cpu_cores: 8,
      ram_gb: 12,
    },
    l4s: { enabled: true, tcp_congestion_control: "prague" },
  },
};

const AVAILABLE_SLICES: Slice[] = [
  { sst: "1", sd: "000001", dnn: "internet" },
  { sst: "1", sd: "000082", dnn: "l4s" },
  { sst: "1", sd: "000083", dnn: "classic" },
];

const DEFAULT_NETWORK_STATUS: NetworkStatus = {
  dnn: "l4s",
  active_slice: "SST 1 / SD 000082",
  ip_address: "10.45.0.24",
};

const defaultExperimentConfig: ExperimentConfiguration = {
  name: "Downlink L4S Evaluation",
  mode: "L4S / Classic",
  test_duration: 1200,
  repeat: 1,
  waiting_time: 240,
};

const defaultClientConfig: ClientControllerConfiguration = {
  pduSession: {
    sst: "1",
    sd: "000082",
    active: false,
  },
  mode: "Default",
  traffic: {
    source: "Local File",
    localProfile: "bulk_http",
    dockerImage: "",
    port: LOCAL_TRAFFIC_PORTS.bulk_http,
  },
  selectedKpis: ["E2E latency", "CE marking", "Goodput"],
  kpiParameters: {
    network: {
      interface: "wwan0",
      source_ip: "150.140.195.216",
      port: LOCAL_TRAFFIC_PORTS.bulk_http,
    },
    influxdb: {
      url: "http://localhost:8086",
      token: "",
      org: "sense",
      bucket: "l4s",
      measurement: "client_kpis",
    },
    experiment: {
      test_duration: 1200,
      repeat: 1,
      waiting_time: 240,
    },
    debug: false,
  },
};

const defaultKpiConfig: KpiControllerConfiguration = {
  mode: "Default",
  selectedKpis: ["E2E latency"],
  kpiParameters: {
    network: {
      interface: "ens3",
      source_ip: "150.140.195.196",
      port: LOCAL_TRAFFIC_PORTS.bulk_http,
    },
    influxdb: {
      url: "http://localhost:8086",
      token: "",
      org: "sense",
      bucket: "l4s",
      measurement: "kpi_controller",
    },
    experiment: {
      test_duration: 1200,
      repeat: 1,
      waiting_time: 240,
    },
    debug: false,
  },
};

const defaultEricssonConfig: EricssonControllerConfiguration = {
  l4sThresholds: {
    highThreshold: "25",
    lowThreshold: "5",
  },
};

const CONFIGURABLE_CLIENT_CONTROLLERS = REGISTERED_CONTROLLERS.filter(
  (controller) =>
    controller.client_type === "client" ||
    controller.client_type === "smart phone",
);

function cloneClientConfig(config = defaultClientConfig): ClientControllerConfiguration {
  return {
    ...config,
    pduSession: { ...config.pduSession },
    traffic: { ...config.traffic },
    selectedKpis: [...config.selectedKpis],
    kpiParameters: cloneKpiParameters(config.kpiParameters),
  };
}

function cloneKpiControllerConfig(
  config = defaultKpiConfig,
): KpiControllerConfiguration {
  return {
    ...config,
    selectedKpis: [...config.selectedKpis],
    kpiParameters: cloneKpiParameters(config.kpiParameters),
  };
}

function cloneKpiParameters(
  config: KpiParameterConfiguration,
): KpiParameterConfiguration {
  return {
    network: { ...config.network },
    influxdb: { ...config.influxdb },
    experiment: { ...config.experiment },
    debug: config.debug,
  };
}

function buildDefaultClientConfigMap(): ClientControllerConfigurationMap {
  return Object.fromEntries(
    CONFIGURABLE_CLIENT_CONTROLLERS.map((controller) => [
      controller.client_id,
      cloneClientConfig(),
    ]),
  );
}

function buildDefaultKpiConfigMap(): KpiControllerConfigurationMap {
  return Object.fromEntries(
    CONFIGURABLE_CLIENT_CONTROLLERS.map((controller) => [
      controller.client_id,
      cloneKpiControllerConfig(),
    ]),
  );
}

function cloneClientConfigMap(
  configs: ClientControllerConfigurationMap,
): ClientControllerConfigurationMap {
  return Object.fromEntries(
    Object.entries(configs).map(
      ([clientId, config]: [string, ClientControllerConfiguration]) => [
        clientId,
        cloneClientConfig(config),
      ],
    ),
  );
}

function cloneKpiConfigMap(
  configs: KpiControllerConfigurationMap,
): KpiControllerConfigurationMap {
  return Object.fromEntries(
    Object.entries(configs).map(
      ([clientId, config]: [string, KpiControllerConfiguration]) => [
        clientId,
        cloneKpiControllerConfig(config),
      ],
    ),
  );
}

function normalizeExperiment(raw: Experiment & {
  clientController?: ClientControllerConfiguration;
  kpiController?: KpiControllerConfiguration;
}): Experiment {
  const fallbackClientId = CONFIGURABLE_CLIENT_CONTROLLERS[0].client_id;

  return {
    ...raw,
    clientControllers:
      raw.clientControllers ??
      { [fallbackClientId]: cloneClientConfig(raw.clientController) },
    kpiControllers:
      raw.kpiControllers ??
      { [fallbackClientId]: cloneKpiControllerConfig(raw.kpiController) },
  };
}


function toNullableString(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableNumber(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapMode(mode: ConfigurationMode) {
  return mode === "Default" ? "default" : "custom";
}

function mapTrafficSource(source: TrafficSource) {
  return source === "Local File" ? "local_file" : "docker_image";
}

function mapClientKpi(kpi: ClientKpi) {
  const values: Record<ClientKpi, "latency" | "goodput" | "CE"> = {
    "E2E latency": "latency",
    Goodput: "goodput",
    "CE marking": "CE",
  };

  return values[kpi];
}

function mapKpiControllerKpi(kpi: KpiControllerKpi) {
  const values: Record<KpiControllerKpi, "latency" | "retransmissions"> = {
    "E2E latency": "latency",
    retransmissions: "retransmissions",
  };

  return values[kpi];
}

function buildClientConfigPayload(config: ClientControllerConfiguration) {
  return {
    mode: mapMode(config.mode),
    traffic: {
      type: mapTrafficSource(config.traffic.source),
      local_file:
        config.traffic.source === "Local File"
          ? config.traffic.localProfile
          : null,
      docker_image:
        config.traffic.source === "Docker Image"
          ? toNullableString(config.traffic.dockerImage)
          : null,
    },
    kpis: config.selectedKpis.map(mapClientKpi),
    kpi_parameters: {
      network: {
        source_ip: toNullableString(config.kpiParameters.network.source_ip),
        port: toNullableNumber(config.kpiParameters.network.port),
        interface: toNullableString(config.kpiParameters.network.interface),
      },
      influx: {
        url: toNullableString(config.kpiParameters.influxdb.url),
        token: toNullableString(config.kpiParameters.influxdb.token),
        org: toNullableString(config.kpiParameters.influxdb.org),
        bucket: toNullableString(config.kpiParameters.influxdb.bucket),
        measurement: toNullableString(config.kpiParameters.influxdb.measurement),
      },
      timing: {
        test_duration: config.kpiParameters.experiment.test_duration,
        repeat: config.kpiParameters.experiment.repeat,
      },
    },
    debug: config.kpiParameters.debug,
  };
}

function buildSKpiConfigPayload(configs: KpiControllerConfigurationMap) {
  return {
    clients: Object.fromEntries(
      Object.entries(configs).map(([clientId, config]) => [
        clientId,
        {
          kpis: config.selectedKpis.map(mapKpiControllerKpi),
          network: {
            interface: toNullableString(config.kpiParameters.network.interface),
            destination_ip: toNullableString(
              config.kpiParameters.network.source_ip,
            ),
            port: toNullableNumber(config.kpiParameters.network.port),
          },
          influxdb: {
            url: toNullableString(config.kpiParameters.influxdb.url),
            token: toNullableString(config.kpiParameters.influxdb.token),
            org: toNullableString(config.kpiParameters.influxdb.org),
            bucket: toNullableString(config.kpiParameters.influxdb.bucket),
            measurement: toNullableString(
              config.kpiParameters.influxdb.measurement,
            ),
          },
          experiment: {
            test_duration: config.kpiParameters.experiment.test_duration,
            repeat: config.kpiParameters.experiment.repeat,
          },
          debug: config.kpiParameters.debug,
        },
      ]),
    ),
  };
}

function buildEricssonThresholdsPayload(config: EricssonControllerConfiguration) {
  return {
    high: Number.parseInt(config.l4sThresholds.highThreshold || "0", 10),
    low: Number.parseInt(config.l4sThresholds.lowThreshold || "0", 10),
  };
}

function buildSlicePayload(config: ClientControllerConfiguration) {
  const selectedSlice = AVAILABLE_SLICES.find(
    (slice) =>
      slice.sst === config.pduSession.sst &&
      slice.sd === config.pduSession.sd
  );

  if (!selectedSlice) {
    throw new Error(
      `Unknown slice SST=${config.pduSession.sst}, SD=${config.pduSession.sd}`
    );
  }

  return {
    SST: Number.parseInt(selectedSlice.sst, 10),
    SD: Number.parseInt(selectedSlice.sd, 10),
    DNN: selectedSlice.dnn,
  };
}
function isMissingControllerError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);

  return (
    message.includes("404") &&
    (message.includes("is not registered") ||
      message.includes("Controller") ||
      message.includes("S_KPI Controller is not registered") ||
      message.includes("Ericsson Controller is not registered"))
  );
}

async function allowMissingController<T>(request: Promise<T>) {
  try {
    return await request;
  } catch (error) {
    if (isMissingControllerError(error)) {
      return {
        acceptedBySchema: true,
        note: "Request body was accepted, but the controller is not registered.",
      };
    }

    throw error;
  }
}

export default function ExperimentSetup() {
  const [now, setNow] = useState(new Date());
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExperiment, setSelectedExperiment] =
    useState<Experiment | null>(null);
  const [message, setMessage] = useState(
    "Configure an experiment and schedule a free testbed slot.",
  );

  const [selectedControllerId, setSelectedControllerId] = useState(
    REGISTERED_CONTROLLERS[0].client_id,
  );
  const [selectedClientControllerId, setSelectedClientControllerId] = useState(
    CONFIGURABLE_CLIENT_CONTROLLERS[0].client_id,
  );
  const [experimentConfig, setExperimentConfig] =
    useState<ExperimentConfiguration>(defaultExperimentConfig);
  const [clientConfigs, setClientConfigs] =
    useState<ClientControllerConfigurationMap>(buildDefaultClientConfigMap);
  const [kpiConfigs, setKpiConfigs] =
    useState<KpiControllerConfigurationMap>(buildDefaultKpiConfigMap);
  const [ericssonConfig, setEricssonConfig] =
    useState<EricssonControllerConfiguration>(defaultEricssonConfig);

  const [startDateTime, setStartDateTime] = useState("");
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    DEFAULT_NETWORK_STATUS,
  );

  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    management: true,
    experiment: true,
    clientNetwork: true,
    clientKpi: true,
    clientTraffic: true,
    clientParams: false,
    kpiParams: false,
    ericsson: true,
    schedule: true,
  });

  useEffect(() => {
    testRestApiConnection();
    loadExperiments();
    const timer = setInterval(() => {
      setNow(new Date());
      loadExperiments();
    }, 1000);

    window.addEventListener("storage", loadExperiments);

    return () => {
      clearInterval(timer);
      window.removeEventListener("storage", loadExperiments);
    };
  }, []);

  async function testRestApiConnection() {
    try {
      const controllers = await getControllers();
      console.log("REAL CONTROLLERS:", controllers);
    } catch (error) {
      console.error("REST API connection failed:", error);
      setMessage(
        error instanceof Error
          ? `REST API connection failed: ${error.message}`
          : "REST API connection failed.",
      );
    }
  }

  function loadExperiments() {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as Experiment[]) : [];

    const cleaned = parsed.map((rawExperiment) => {
      const experiment = normalizeExperiment(rawExperiment);

      return {
      ...experiment,
      status:
        experiment.status === "paused" ||
        experiment.status === "cancelled" ||
        experiment.status === "completed"
          ? experiment.status
          : ("scheduled" as ExperimentStatus),
      };
    });

    setExperiments(cleaned);
  }

  function saveExperiments(nextExperiments: Experiment[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextExperiments));
    setExperiments(nextExperiments);
  }

  const selectedController = REGISTERED_CONTROLLERS.find(
    (controller) => controller.client_id === selectedControllerId,
  );

  const selectedCapabilities = selectedController
    ? CONTROLLER_CAPABILITIES[selectedController.client_id]
    : null;

  const selectedClientController = CONFIGURABLE_CLIENT_CONTROLLERS.find(
    (controller) => controller.client_id === selectedClientControllerId,
  );

  const clientConfig =
    clientConfigs[selectedClientControllerId] ?? cloneClientConfig();

  const kpiConfig =
    kpiConfigs[selectedClientControllerId] ?? cloneKpiControllerConfig();

  function setClientConfig(
    updater:
      | ClientControllerConfiguration
      | ((current: ClientControllerConfiguration) => ClientControllerConfiguration),
  ) {
    setClientConfigs((current) => {
      const previous = current[selectedClientControllerId] ?? cloneClientConfig();
      const next =
        typeof updater === "function" ? updater(previous) : updater;

      return {
        ...current,
        [selectedClientControllerId]: next,
      };
    });
  }

  function setKpiConfig(
    updater:
      | KpiControllerConfiguration
      | ((current: KpiControllerConfiguration) => KpiControllerConfiguration),
  ) {
    setKpiConfigs((current) => {
      const previous = current[selectedClientControllerId] ?? cloneKpiControllerConfig();
      const next =
        typeof updater === "function" ? updater(previous) : updater;

      return {
        ...current,
        [selectedClientControllerId]: next,
      };
    });
  }

  const durationMinutes = Math.ceil(experimentConfig.test_duration / 60);

  const requestedStart = parseScheduleDateTime(startDateTime);

  const requestedEnd =
    requestedStart && experimentConfig.test_duration > 0
      ? new Date(
          requestedStart.getTime() + experimentConfig.test_duration * 1000,
        )
      : null;

  const activeExperiment = experiments.find((experiment) => {
    if (experiment.status === "cancelled" || experiment.status === "completed")
      return false;

    const start = new Date(experiment.startsAt);
    const end = getEndTime(experiment);

    return now >= start && now < end;
  });

  const availability = useMemo(() => {
    if (
      !requestedStart ||
      !requestedEnd ||
      experimentConfig.test_duration <= 0
    ) {
      return {
        available: false,
        text: "Select a valid start date, time, and test duration.",
      };
    }

    if (requestedStart <= now) {
      return {
        available: false,
        text: "The selected time is in the past.",
      };
    }

    const conflict = experiments.find((experiment) => {
      if (experiment.status === "cancelled") return false;

      return (
        requestedStart < getEndTime(experiment) &&
        requestedEnd > new Date(experiment.startsAt)
      );
    });

    if (conflict) {
      return {
        available: false,
        text: `Occupied by "${conflict.name}".`,
      };
    }

    return {
      available: true,
      text: "Available for scheduling.",
    };
  }, [
    requestedStart?.getTime(),
    requestedEnd?.getTime(),
    experimentConfig.test_duration,
    experiments,
    now,
  ]);

  const waitingTimeWarning =
    experimentConfig.waiting_time < RECOMMENDED_WAITING_TIME
      ? "Recommended minimum: 240 seconds (4 minutes)"
      : "Waiting time satisfies the recommended minimum.";

  function toggleSection(section: string) {
    setOpenSections((current) => ({
      ...current,
      [section]: !current[section],
    }));
  }

  function loadDefaultConfiguration() {
    setExperimentConfig(defaultExperimentConfig);
    setClientConfigs(buildDefaultClientConfigMap());
    setKpiConfigs(buildDefaultKpiConfigMap());
    setEricssonConfig(defaultEricssonConfig);
    setNetworkStatus(DEFAULT_NETWORK_STATUS);
    setMessage("Loaded default controller configuration.");
  }

  function updateExperiment<K extends keyof ExperimentConfiguration>(
    key: K,
    value: ExperimentConfiguration[K],
  ) {
    setExperimentConfig((current) => ({
      ...current,
      [key]: value,
    }));

    if (key === "test_duration" || key === "repeat" || key === "waiting_time") {
      setClientConfigs((current) =>
        Object.fromEntries(
          Object.entries(current).map(
            ([clientId, config]: [string, ClientControllerConfiguration]) => [
            clientId,
            {
              ...config,
              kpiParameters: {
                ...config.kpiParameters,
                experiment: {
                  ...config.kpiParameters.experiment,
                  [key]: value,
                },
              },
            },
          ]),
        ),
      );

      setKpiConfigs((current) =>
        Object.fromEntries(
          Object.entries(current).map(
            ([clientId, config]: [string, KpiControllerConfiguration]) => [
            clientId,
            {
              ...config,
              kpiParameters: {
                ...config.kpiParameters,
                experiment: {
                  ...config.kpiParameters.experiment,
                  [key]: value,
                },
              },
            },
          ]),
        ),
      );
    }
  }

  function updateClientPort(port: string) {
    setClientConfig((current) => ({
      ...current,
      traffic: {
        ...current.traffic,
        port,
      },
      kpiParameters: {
        ...current.kpiParameters,
        network: {
          ...current.kpiParameters.network,
          port,
        },
      },
    }));

    setKpiConfig((current) => ({
      ...current,
      kpiParameters: {
        ...current.kpiParameters,
        network: {
          ...current.kpiParameters.network,
          port,
        },
      },
    }));
  }

  function selectLocalTrafficProfile(profile: LocalTrafficProfile) {
    const port = LOCAL_TRAFFIC_PORTS[profile];

    setClientConfig((current) => ({
      ...current,
      traffic: {
        ...current.traffic,
        localProfile: profile,
        port,
      },
      kpiParameters: {
        ...current.kpiParameters,
        network: {
          ...current.kpiParameters.network,
          port,
        },
      },
    }));

    setKpiConfig((current) => ({
      ...current,
      kpiParameters: {
        ...current.kpiParameters,
        network: {
          ...current.kpiParameters.network,
          port,
        },
      },
    }));
  }

  function toggleClientKpi(kpi: ClientKpi) {
    setClientConfig((current) => {
      const selected = current.selectedKpis.includes(kpi);

      const selectedKpis = selected
        ? current.selectedKpis.filter((item) => item !== kpi)
        : [...current.selectedKpis, kpi];

      if (kpi === "E2E latency" && !selected) {
        setKpiConfig((kpiCurrent) => ({
          ...kpiCurrent,
          selectedKpis: kpiCurrent.selectedKpis.includes("E2E latency")
            ? kpiCurrent.selectedKpis
            : [...kpiCurrent.selectedKpis, "E2E latency"],
        }));
      }

      return {
        ...current,
        selectedKpis,
      };
    });
  }

  function toggleKpiControllerKpi(kpi: KpiControllerKpi) {
    setKpiConfig((current) => {
      const selected = current.selectedKpis.includes(kpi);

      const selectedKpis = selected
        ? current.selectedKpis.filter((item) => item !== kpi)
        : [...current.selectedKpis, kpi];

      if (kpi === "E2E latency" && selected) {
        setClientConfig((clientCurrent) => ({
          ...clientCurrent,
          selectedKpis: clientCurrent.selectedKpis.filter(
            (item) => item !== "E2E latency",
          ),
        }));
      }

      if (kpi === "E2E latency" && !selected) {
        setClientConfig((clientCurrent) => ({
          ...clientCurrent,
          selectedKpis: clientCurrent.selectedKpis.includes("E2E latency")
            ? clientCurrent.selectedKpis
            : [...clientCurrent.selectedKpis, "E2E latency"],
        }));
      }

      return {
        ...current,
        selectedKpis,
      };
    });
  }

  function activatePduSession() {
    setClientConfig((current) => ({
      ...current,
      pduSession: {
        ...current.pduSession,
        active: true,
      },
    }));

    setNetworkStatus({
      dnn: "l4s",
      active_slice: `SST ${clientConfig.pduSession.sst} / SD ${clientConfig.pduSession.sd}`,
      ip_address: "10.45.0.24",
    });

    setMessage("PDU session activated for the planned configuration.");
  }

  function disconnectPduSession() {
    setClientConfig((current) => ({
      ...current,
      pduSession: {
        ...current.pduSession,
        active: false,
      },
    }));

    setMessage("PDU session disconnected for the planned configuration.");
  }

  function releaseAllSessions() {
    setClientConfig((current) => ({
      ...current,
      pduSession: {
        ...current.pduSession,
        active: false,
      },
    }));

    setNetworkStatus({
      dnn: "-",
      active_slice: "-",
      ip_address: "-",
    });

    setMessage("All planned PDU sessions released.");
  }

  function buildExperiment(start: Date): Experiment {
    return {
      id: `exp-${Date.now()}`,
      name: experimentConfig.name.trim() || "L4S Testbed Experiment",
      mode: experimentConfig.mode,
      startsAt: start.toISOString(),
      durationMinutes,
      status: "scheduled",
      configuration: experimentConfig,
      clientControllers: cloneClientConfigMap(clientConfigs),
      kpiControllers: cloneKpiConfigMap(kpiConfigs),
      ericssonController: ericssonConfig,
    };
  }

  async function sendConfigurationToOrchestrator() {
    setMessage("Sending user configuration to orchestrator...");

    const clientResponses = await Promise.all(
      Object.entries(clientConfigs).map(async ([clientId, config]) => {
        const sliceResponse = await allowMissingController(
          selectClientSlice(clientId, buildSlicePayload(config)),
        );

        const configResponse = await allowMissingController(
          sendClientConfig(clientId, buildClientConfigPayload(config)),
        );

        return {
          clientId,
          sliceResponse,
          configResponse,
        };
      }),
    );

    const skpiResponse = await allowMissingController(
      sendSKpiConfig(buildSKpiConfigPayload(kpiConfigs)),
    );

    const ericssonResponse = await allowMissingController(
      sendEricssonThresholds(buildEricssonThresholdsPayload(ericssonConfig)),
    );

    console.log("Client configuration responses:", clientResponses);
    console.log("Server-side KPI config response:", skpiResponse);
    console.log("Ericsson thresholds response:", ericssonResponse);

    return {
      clientResponses,
      skpiResponse,
      ericssonResponse,
    };
  }

  async function scheduleExperiment() {
    if (!availability.available || !requestedStart) {
      setMessage(availability.text);
      return;
    }

    try {
      await sendConfigurationToOrchestrator();

      const experiment = buildExperiment(requestedStart);

      saveExperiments(
        [...experiments, experiment].sort(
          (a, b) =>
            new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
        ),
      );

      setSelectedExperiment(experiment);
      setStartDateTime("");
      setMessage(
        `Scheduled "${experiment.name}" and sent the user configuration to the orchestrator.`,
      );
    } catch (error) {
      console.error("Schedule experiment failed:", error);
      setMessage(
        error instanceof Error
          ? `Schedule failed: ${error.message}`
          : "Schedule failed.",
      );
    }
  }

  function cancelExperiment(id: string) {
    const next = experiments.map((experiment) =>
      experiment.id === id
        ? {
            ...experiment,
            status: "cancelled" as ExperimentStatus,
          }
        : experiment,
    );

    saveExperiments(next);
    setSelectedExperiment(null);
    setMessage("Experiment cancelled.");
  }

  const visibleExperiments = experiments.filter(
    (experiment) => experiment.status !== "cancelled",
  );

  return (
    <main className="l4s-pretty-page setup-page min-h-screen bg-white text-slate-900">
      <style jsx global>{`
        .l4s-pretty-page {
          --l4s-cyan: 8 145 178;
          --l4s-emerald: 5 150 105;
          --l4s-violet: 109 40 217;
          --l4s-amber: 217 119 6;
        }

        .l4s-pretty-page section,
        .l4s-pretty-page .pretty-card,
        .l4s-pretty-page .pretty-rise {
          animation: l4s-rise-in 520ms ease both;
        }

        .l4s-pretty-page table tbody tr {
          transition:
            transform 180ms ease,
            background-color 180ms ease,
            box-shadow 180ms ease;
        }

        .l4s-pretty-page table tbody tr:hover {
          transform: translateX(4px);
          box-shadow: inset 3px 0 0 rgb(var(--l4s-cyan));
        }

        .l4s-pretty-page button:not(:disabled),
        .l4s-pretty-page a,
        .l4s-pretty-page [role="button"] {
          transform-origin: center;
          will-change: transform, box-shadow, border-color, background-color;
        }

        .l4s-pretty-page button:not(:disabled):hover,
        .l4s-pretty-page a:hover,
        .l4s-pretty-page [role="button"]:hover {
          transform: translateY(-2px);
        }

        .l4s-pretty-page button:not(:disabled):active,
        .l4s-pretty-page a:active,
        .l4s-pretty-page [role="button"]:active {
          transform: translateY(0) scale(0.97);
        }

        .l4s-pretty-page .glass-card {
          position: relative;
          overflow: hidden;
          border: 1px solid rgb(226 232 240);
          background: linear-gradient(
            135deg,
            rgba(255, 255, 255, 0.98),
            rgba(248, 250, 252, 0.96)
          );
          box-shadow: 0 18px 45px rgba(15, 23, 42, 0.08);
        }

        .l4s-pretty-page .glass-card::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          background:
            radial-gradient(
              circle at 20% 0%,
              rgba(8, 145, 178, 0.11),
              transparent 34%
            ),
            radial-gradient(
              circle at 100% 20%,
              rgba(109, 40, 217, 0.07),
              transparent 28%
            );
          opacity: 0;
          transition: opacity 220ms ease;
        }

        .l4s-pretty-page .glass-card:hover::before {
          opacity: 1;
        }

        .l4s-pretty-page .soft-title {
          letter-spacing: -0.035em;
          background: linear-gradient(
            90deg,
            rgb(15 23 42),
            rgb(8 145 178),
            rgb(15 23 42)
          );
          -webkit-background-clip: text;
          background-clip: text;
          color: transparent;
        }

        .l4s-pretty-page .metric-shell {
          border: 1px solid rgb(226 232 240);
          background: linear-gradient(
            135deg,
            rgb(255 255 255),
            rgb(248 250 252)
          );
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.9),
            0 12px 30px rgba(15, 23, 42, 0.06);
        }

        @keyframes l4s-rise-in {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes l4s-pulse-glow {
          0%,
          100% {
            box-shadow: 0 0 0 0 rgba(8, 145, 178, 0.22);
          }
          50% {
            box-shadow: 0 0 0 8px rgba(8, 145, 178, 0);
          }
        }

        .setup-page button:not(:disabled),
        .setup-page [role="button"] {
          transform-origin: center;
          will-change: transform, box-shadow, background-color, border-color;
        }

        .setup-page button:not(:disabled):active,
        .setup-page [role="button"]:active {
          animation: setup-button-pop 180ms ease-out;
        }

        .setup-page button:not(:disabled):focus-visible,
        .setup-page input:focus-visible,
        .setup-page select:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(8, 145, 178, 0.28);
        }

        @keyframes setup-button-pop {
          0% {
            transform: scale(1);
          }
          45% {
            transform: scale(0.94);
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
      <section className="mx-auto max-w-7xl px-8 py-8">
        <div className="mb-8">
          <h2 className="soft-title text-3xl font-bold">Experiment Setup</h2>
          <p className="mt-2 text-slate-700">
            Configure the 5G/L4S testbed controllers and schedule a future run.
            Runtime pause, resume, and stop controls belong to the Home page.
          </p>
        </div>

        <div className="mb-6 glass-card rounded-2xl p-5 shadow-md">
          <p className="text-sm text-slate-700">System Message</p>
          <p className="mt-1 font-medium text-cyan-800">{message}</p>
        </div>

        {activeExperiment && (
          <div className="mb-6 rounded-2xl border border-amber-700 bg-amber-600 p-5">
            <p className="font-semibold text-white">
              Testbed is currently occupied by "{activeExperiment.name}".
            </p>
            <p className="mt-1 text-sm text-white/90">
              You can still configure and schedule a future experiment, but
              overlapping windows are blocked.
            </p>
          </div>
        )}

        <Panel title="">
          <CollapsibleHeader
            title="Management / Registered Controllers"
            open={openSections.management}
            onClick={() => toggleSection("management")}
          />

          {openSections.management && (
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div>
                <div className="metric-shell overflow-x-auto rounded-xl">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-200 text-slate-700">
                      <tr>
                        <th className="px-4 py-3">client_id</th>
                        <th className="px-4 py-3">client_type</th>
                        <th className="px-4 py-3">l4s_capable</th>
                      </tr>
                    </thead>

                    <tbody>
                      {REGISTERED_CONTROLLERS.map((controller) => (
                        <tr
                          key={controller.client_id}
                          className="border-t border-slate-200 hover:bg-cyan-50/70"
                        >
                          <td className="px-4 py-3 font-medium">
                            {controller.client_id}
                          </td>
                          <td className="px-4 py-3 text-slate-700">
                            {controller.client_type}
                          </td>
                          <td className="px-4 py-3">
                            <Badge
                              color={
                                controller.l4s_capable ? "emerald" : "slate"
                              }
                              label={controller.l4s_capable ? "true" : "false"}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1fr_auto]">
                  <Select
                    label="Controller"
                    value={selectedControllerId}
                    onChange={setSelectedControllerId}
                    options={REGISTERED_CONTROLLERS.map((controller) => ({
                      label: controller.client_id,
                      value: controller.client_id,
                    }))}
                  />

                  <button
                    onClick={loadDefaultConfiguration}
                    className="self-end rounded-xl border border-cyan-700 bg-cyan-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-cyan-800"
                  >
                    Load Default Configuration
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm text-slate-700">
                      Get Capabilities / Controller
                    </p>
                    <p className="mt-1 font-semibold">
                      {selectedController?.client_id}
                    </p>
                  </div>

                  <Badge
                    color={
                      selectedController?.l4s_capable ? "emerald" : "slate"
                    }
                    label={
                      selectedController?.l4s_capable
                        ? "L4S capable"
                        : "non-L4S"
                    }
                  />
                </div>

                {selectedCapabilities && (
                  <div className="grid gap-6 md:grid-cols-2">
                    <div>
                      <h4 className="mb-3 text-sm font-semibold text-cyan-800">
                        System
                      </h4>
                      <Detail
                        label="os"
                        value={selectedCapabilities.system.os}
                      />
                      <Detail
                        label="architecture"
                        value={selectedCapabilities.system.architecture}
                      />
                      <Detail
                        label="cpu_cores"
                        value={String(selectedCapabilities.system.cpu_cores)}
                      />
                      <Detail
                        label="ram_gb"
                        value={String(selectedCapabilities.system.ram_gb)}
                      />
                    </div>

                    <div>
                      <h4 className="mb-3 text-sm font-semibold text-cyan-800">
                        L4S
                      </h4>
                      <Detail
                        label="enabled"
                        value={String(selectedCapabilities.l4s.enabled)}
                      />
                      <Detail
                        label="tcp_congestion_control"
                        value={selectedCapabilities.l4s.tcp_congestion_control}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="" className="mt-6">
          <CollapsibleHeader
            title="Experiment Parameters"
            open={openSections.experiment}
            onClick={() => toggleSection("experiment")}
          />

          {openSections.experiment && (
            <div className="mt-5">
              <div className="grid gap-4 md:grid-cols-2">
                <Input
                  label="Experiment Name"
                  value={experimentConfig.name}
                  onChange={(value) => updateExperiment("name", value)}
                />

                <Select
                  label="Experiment Mode"
                  value={experimentConfig.mode}
                  onChange={(value) =>
                    updateExperiment("mode", value as ExperimentMode)
                  }
                  options={[
                    { label: "L4S / Classic", value: "L4S / Classic" },
                    { label: "L4S Only", value: "L4S Only" },
                    { label: "Classic Only", value: "Classic Only" },
                  ]}
                />

                <NumberInput
                  label="test_duration"
                  value={experimentConfig.test_duration}
                  onChange={(value) => updateExperiment("test_duration", value)}
                  suffix="sec"
                />

                <NumberInput
                  label="repeat"
                  value={experimentConfig.repeat}
                  onChange={(value) => updateExperiment("repeat", value)}
                />

                <NumberInput
                  label="waiting_time"
                  value={experimentConfig.waiting_time}
                  onChange={(value) => updateExperiment("waiting_time", value)}
                  suffix="sec"
                />
              </div>

              <ValidationMessage
                valid={
                  experimentConfig.waiting_time >= RECOMMENDED_WAITING_TIME
                }
                text={waitingTimeWarning}
              />
            </div>
          )}
        </Panel>

        <Panel title="Client Controller Configuration" className="mt-6">
          <p className="mb-5 text-sm text-slate-700">
            Select a client controller, configure its network/PDU session, and
            keep traffic ports synchronized with KPI parameters.
          </p>

          <div className="mb-6 grid gap-4 md:grid-cols-2">
            <Select
              label="Client Controller"
              value={selectedClientControllerId}
              onChange={setSelectedClientControllerId}
              options={CONFIGURABLE_CLIENT_CONTROLLERS.map((controller) => ({
                label: `${controller.client_id} (${controller.client_type})`,
                value: controller.client_id,
              }))}
            />

            <div className="rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-700">
              Editing configuration for
              <span className="font-semibold text-cyan-800">
                {` ${selectedClientController?.client_id ?? selectedClientControllerId}`}
              </span>
              . Each client keeps its own Client Controller and matching KPI
              Controller configuration.
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <div>
              <CollapsibleHeader
                title="Network"
                open={openSections.clientNetwork}
                onClick={() => toggleSection("clientNetwork")}
              />

              {openSections.clientNetwork && (
                <div className="mt-5 space-y-6">
                  <div className="rounded-xl border border-slate-300 bg-white p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <h4 className="font-semibold">Activate PDU Session</h4>
                      <Badge
                        color={
                          clientConfig.pduSession.active ? "emerald" : "slate"
                        }
                        label={
                          clientConfig.pduSession.active ? "active" : "inactive"
                        }
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <Input
                        label="SST"
                        value={clientConfig.pduSession.sst}
                        onChange={(value) =>
                          setClientConfig((current) => ({
                            ...current,
                            pduSession: {
                              ...current.pduSession,
                              sst: value,
                            },
                          }))
                        }
                      />

                      <Input
                        label="SD"
                        value={clientConfig.pduSession.sd}
                        onChange={(value) =>
                          setClientConfig((current) => ({
                            ...current,
                            pduSession: {
                              ...current.pduSession,
                              sd: value,
                            },
                          }))
                        }
                      />
                    </div>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <ControlButton
                        label="Activate"
                        color="emerald"
                        onClick={activatePduSession}
                      />
                      <ControlButton
                        label="Disconnect"
                        color="amber"
                        onClick={disconnectPduSession}
                      />
                      <ControlButton
                        label="Release All Sessions"
                        color="red"
                        onClick={releaseAllSessions}
                      />
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-300 bg-white p-5">
                    <h4 className="mb-4 font-semibold">Get Available Slices</h4>

                    <div className="metric-shell overflow-x-auto rounded-xl">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-200 text-slate-700">
                          <tr>
                            <th className="px-4 py-3">sst</th>
                            <th className="px-4 py-3">sd</th>
                            <th className="px-4 py-3">dnn</th>
                          </tr>
                        </thead>

                        <tbody>
                          {AVAILABLE_SLICES.map((slice) => (
                            <tr
                              key={`${slice.sst}-${slice.sd}`}
                              className="border-t border-slate-300"
                            >
                              <td className="px-4 py-3">{slice.sst}</td>
                              <td className="px-4 py-3 text-slate-700">
                                {slice.sd}
                              </td>
                              <td className="px-4 py-3 text-slate-700">
                                {slice.dnn}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-300 bg-white p-5">
                    <h4 className="mb-4 font-semibold">Get Network Status</h4>
                    <Detail label="dnn" value={networkStatus.dnn} />
                    <Detail
                      label="active_slice"
                      value={networkStatus.active_slice}
                    />
                    <Detail
                      label="ip_address"
                      value={networkStatus.ip_address}
                    />
                  </div>
                </div>
              )}
            </div>

            <div>
              <CollapsibleHeader
                title="Traffic and KPI Configuration"
                open={openSections.clientKpi}
                onClick={() => toggleSection("clientKpi")}
              />

              {openSections.clientKpi && (
                <div className="mt-5 space-y-6">
                  <Select
                    label="Mode"
                    value={clientConfig.mode}
                    onChange={(value) =>
                      setClientConfig((current) => ({
                        ...current,
                        mode: value as ConfigurationMode,
                      }))
                    }
                    options={[
                      { label: "Default", value: "Default" },
                      { label: "Custom", value: "Custom" },
                    ]}
                  />

                  <div>
                    <h4 className="mb-3 font-semibold">KPIs</h4>
                    <MultiSelect
                      values={clientConfig.selectedKpis}
                      options={["E2E latency", "CE marking", "Goodput"]}
                      onToggle={toggleClientKpi}
                    />
                  </div>

                  {clientConfig.mode === "Custom" && (
                    <KpiParametersForm
                      title="KPI Parameters"
                      config={clientConfig.kpiParameters}
                      open={openSections.clientParams}
                      onToggle={() => toggleSection("clientParams")}
                      onChange={(next) =>
                        setClientConfig((current) => ({
                          ...current,
                          kpiParameters: next,
                        }))
                      }
                      onPortChange={updateClientPort}
                    />
                  )}

                  <CollapsibleHeader
                    title="Traffic Source"
                    open={openSections.clientTraffic}
                    onClick={() => toggleSection("clientTraffic")}
                  />

                  {openSections.clientTraffic && (
                    <div className="space-y-4 rounded-xl border border-slate-300 bg-white p-5">
                      <RadioGroup
                        label="Traffic Type"
                        value={clientConfig.traffic.source}
                        options={["Local File", "Docker Image"]}
                        onChange={(value) =>
                          setClientConfig((current) => ({
                            ...current,
                            traffic: {
                              ...current.traffic,
                              source: value as TrafficSource,
                            },
                          }))
                        }
                      />

                      {clientConfig.traffic.source === "Local File" ? (
                        <>
                          <Select
                            label="Local File"
                            value={clientConfig.traffic.localProfile}
                            onChange={(value) =>
                              selectLocalTrafficProfile(
                                value as LocalTrafficProfile,
                              )
                            }
                            options={[
                              "bulk_http",
                              "web_api",
                              "volumetric_tiles",
                              "interactive_xr_ws",
                              "abr_video",
                            ].map((item) => ({
                              label: item,
                              value: item,
                            }))}
                          />

                          <Input
                            label="Port"
                            value={clientConfig.traffic.port}
                            onChange={updateClientPort}
                          />
                        </>
                      ) : (
                        <>
                          <Input
                            label="Docker Image"
                            value={clientConfig.traffic.dockerImage}
                            onChange={(value) =>
                              setClientConfig((current) => ({
                                ...current,
                                traffic: {
                                  ...current.traffic,
                                  dockerImage: value,
                                },
                              }))
                            }
                          />

                          <Input
                            label="Port"
                            value={clientConfig.traffic.port}
                            onChange={updateClientPort}
                          />
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="KPI Controller Configuration" className="mt-6">
          <p className="mb-5 text-sm text-slate-700">
            Configure the server-side KPI controller that corresponds to the
            selected client controller.
          </p>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-6">
              <div>
                <h4 className="mb-3 font-semibold">KPIs</h4>
                <MultiSelect
                  values={kpiConfig.selectedKpis}
                  options={["E2E latency", "retransmissions"]}
                  onToggle={toggleKpiControllerKpi}
                />
              </div>

              <Select
                label="Mode"
                value={kpiConfig.mode}
                onChange={(value) =>
                  setKpiConfig((current) => ({
                    ...current,
                    mode: value as ConfigurationMode,
                  }))
                }
                options={[
                  { label: "Default", value: "Default" },
                  { label: "Custom", value: "Custom" },
                ]}
              />
            </div>

            <div>
              {kpiConfig.mode === "Custom" ? (
                <KpiParametersForm
                  title="KPI Controller Parameters"
                  config={kpiConfig.kpiParameters}
                  open={openSections.kpiParams}
                  onToggle={() => toggleSection("kpiParams")}
                  onChange={(next) =>
                    setKpiConfig((current) => ({
                      ...current,
                      kpiParameters: next,
                    }))
                  }
                  onPortChange={updateClientPort}
                />
              ) : (
                <div className="rounded-xl border border-slate-300 bg-white p-5 text-sm text-slate-700">
                  KPI parameter configuration is hidden in Default mode.
                </div>
              )}
            </div>
          </div>
        </Panel>

        <Panel title="" className="mt-6">
          <CollapsibleHeader
            title="Ericsson Controller / Thresholds"
            open={openSections.ericsson}
            onClick={() => toggleSection("ericsson")}
          />

          {openSections.ericsson && (
            <div className="mt-5 grid gap-6 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-300 bg-white p-5">
                <h4 className="mb-4 font-semibold">L4S Thresholds</h4>

                <div className="grid gap-4 md:grid-cols-2">
                  <Input
                    label="High Threshold"
                    value={ericssonConfig.l4sThresholds.highThreshold}
                    onChange={(value) =>
                      setEricssonConfig((current) => ({
                        ...current,
                        l4sThresholds: {
                          ...current.l4sThresholds,
                          highThreshold: value,
                        },
                      }))
                    }
                    suffix="ms"
                  />

                  <Input
                    label="Low Threshold"
                    value={ericssonConfig.l4sThresholds.lowThreshold}
                    onChange={(value) =>
                      setEricssonConfig((current) => ({
                        ...current,
                        l4sThresholds: {
                          ...current.l4sThresholds,
                          lowThreshold: value,
                        },
                      }))
                    }
                    suffix="ms"
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-300 bg-white p-5">
                <h4 className="font-semibold">Network Metrics Script</h4>
                <p className="mt-2 text-sm text-slate-700">
                  Metrics collection is not exposed as a manual GUI control. It
                  will be triggered by the orchestrator together with the
                  experiment start request.
                </p>
              </div>
            </div>
          )}
        </Panel>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <Panel title="">
            <CollapsibleHeader
              title="Schedule / Send Configuration"
              open={openSections.schedule}
              onClick={() => toggleSection("schedule")}
            />

            {openSections.schedule && (
              <div className="mt-5">
                <DateTimePicker
                  label="Start Date & Time"
                  value={startDateTime}
                  onChange={setStartDateTime}
                />
                <p className="mt-2 text-xs text-slate-600">
                  Choose when the experiment should begin.
                </p>

                <div
                  className={`mt-4 rounded-xl border p-4 text-sm ${
                    availability.available
                      ? "border-emerald-700 bg-emerald-700 text-white"
                      : "border-red-700 bg-red-700 text-white"
                  }`}
                >
                  <p className="font-semibold">
                    {availability.available ? "Available" : "Unavailable"}
                  </p>
                  <p className="mt-1 text-xs">{availability.text}</p>
                </div>


                <button
                  type="button"
                  onClick={scheduleExperiment}
                  disabled={!availability.available}
                  className="mt-3 w-full rounded-xl border border-cyan-700 bg-cyan-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:bg-cyan-800 hover:shadow-md active:translate-y-0 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                >
                  Schedule Experiment & Send Configuration
                </button>
              </div>
            )}
          </Panel>

          <Panel title="Scheduled Experiments">
            <div className="space-y-3">
              {visibleExperiments.length === 0 ? (
                <p className="text-sm text-slate-700">
                  No experiments scheduled.
                </p>
              ) : (
                visibleExperiments.map((experiment) => {
                  const start = new Date(experiment.startsAt);
                  const end = getEndTime(experiment);
                  const status = getDisplayStatus(experiment, now);

                  return (
                    <button
                      key={experiment.id}
                      onClick={() => setSelectedExperiment(experiment)}
                      className={`w-full rounded-xl border p-4 text-left shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99] ${
                        selectedExperiment?.id === experiment.id
                          ? "border-cyan-700 bg-cyan-700 text-white"
                          : "border-slate-300 bg-white hover:border-cyan-600 hover:bg-cyan-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="font-semibold">{experiment.name}</p>
                          <p className="mt-1 text-xs text-slate-700">
                            {experiment.mode} · {experiment.durationMinutes} min
                          </p>
                          <p className="mt-1 text-xs text-slate-700">
                            {formatDateTime(start)} - {formatTime(end)}
                          </p>
                        </div>

                        <Badge
                          color={
                            status === "Running"
                              ? "emerald"
                              : status === "Paused"
                                ? "amber"
                                : status === "Scheduled"
                                  ? "cyan"
                                  : "slate"
                          }
                          label={status}
                        />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Experiment Configuration" className="mt-6">
          {selectedExperiment ? (
            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <h4 className="mb-3 font-semibold text-cyan-800">Summary</h4>
                <Detail label="Name" value={selectedExperiment.name} />
                <Detail label="Mode" value={selectedExperiment.mode} />
                <Detail
                  label="Start"
                  value={formatDateTime(new Date(selectedExperiment.startsAt))}
                />
                <Detail
                  label="Duration"
                  value={`${selectedExperiment.durationMinutes} min`}
                />
                <Detail
                  label="Status"
                  value={getDisplayStatus(selectedExperiment, now)}
                />
              </div>

              <div>
                <h4 className="mb-3 font-semibold text-cyan-800">
                  Controllers
                </h4>
                <Detail
                  label="Configured Clients"
                  value={Object.keys(selectedExperiment.clientControllers).join(
                    ", ",
                  )}
                />
                <Detail
                  label="Selected Client KPIs"
                  value={(
                    selectedExperiment.clientControllers[
                      selectedClientControllerId
                    ] ?? Object.values(selectedExperiment.clientControllers)[0]
                  ).selectedKpis.join(", ")}
                />
                <Detail
                  label="Selected KPI Controller KPIs"
                  value={(
                    selectedExperiment.kpiControllers[
                      selectedClientControllerId
                    ] ?? Object.values(selectedExperiment.kpiControllers)[0]
                  ).selectedKpis.join(", ")}
                />
                <Detail
                  label="Selected Traffic Port"
                  value={(
                    selectedExperiment.clientControllers[
                      selectedClientControllerId
                    ] ?? Object.values(selectedExperiment.clientControllers)[0]
                  ).traffic.port}
                />
                <Detail
                  label="Ericsson Low Threshold"
                  value={
                    selectedExperiment.ericssonController.l4sThresholds
                      .lowThreshold
                  }
                />
                <Detail
                  label="Ericsson High Threshold"
                  value={
                    selectedExperiment.ericssonController.l4sThresholds
                      .highThreshold
                  }
                />
              </div>

              <div>
                <h4 className="mb-3 font-semibold text-cyan-800">Actions</h4>
                <button
                  onClick={() => cancelExperiment(selectedExperiment.id)}
                  disabled={
                    getDisplayStatus(selectedExperiment, now) === "Running"
                  }
                  className="w-full rounded-xl border border-red-700 bg-red-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Cancel Scheduled Experiment
                </button>

                {getDisplayStatus(selectedExperiment, now) === "Running" && (
                  <p className="mt-3 text-xs text-slate-700">
                    Running experiments can only be controlled from the Home
                    page.
                  </p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-700">
              Click an experiment to inspect its scheduled configuration.
            </p>
          )}
        </Panel>
      </section>
    </main>
  );
}

function KpiParametersForm({
  title,
  config,
  open,
  onToggle,
  onChange,
  onPortChange,
}: {
  title: string;
  config: KpiParameterConfiguration;
  open: boolean;
  onToggle: () => void;
  onChange: (next: KpiParameterConfiguration) => void;
  onPortChange: (port: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
      <CollapsibleHeader title={title} open={open} onClick={onToggle} />

      {open && (
        <div className="mt-5 space-y-6">
          <div>
            <h4 className="mb-3 text-sm font-semibold text-cyan-800">
              Network
            </h4>

            <div className="grid gap-4 md:grid-cols-3">
              <Input
                label="interface"
                value={config.network.interface}
                onChange={(value) =>
                  onChange({
                    ...config,
                    network: {
                      ...config.network,
                      interface: value,
                    },
                  })
                }
              />

              <Input
                label="source_ip"
                value={config.network.source_ip}
                onChange={(value) =>
                  onChange({
                    ...config,
                    network: {
                      ...config.network,
                      source_ip: value,
                    },
                  })
                }
              />

              <Input
                label="port"
                value={config.network.port}
                onChange={onPortChange}
              />
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-cyan-800">
              InfluxDB
            </h4>

            <div className="grid gap-4 md:grid-cols-2">
              {(["url", "token", "org", "bucket", "measurement"] as const).map(
                (key) => (
                  <Input
                    key={key}
                    label={key}
                    value={config.influxdb[key]}
                    onChange={(value) =>
                      onChange({
                        ...config,
                        influxdb: {
                          ...config.influxdb,
                          [key]: value,
                        },
                      })
                    }
                  />
                ),
              )}
            </div>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-cyan-800">
              Experiment
            </h4>

            <div className="grid gap-4 md:grid-cols-3">
              <NumberInput
                label="test_duration"
                value={config.experiment.test_duration}
                onChange={(value) =>
                  onChange({
                    ...config,
                    experiment: {
                      ...config.experiment,
                      test_duration: value,
                    },
                  })
                }
                suffix="sec"
              />

              <NumberInput
                label="repeat"
                value={config.experiment.repeat}
                onChange={(value) =>
                  onChange({
                    ...config,
                    experiment: {
                      ...config.experiment,
                      repeat: value,
                    },
                  })
                }
              />

              <NumberInput
                label="waiting_time"
                value={config.experiment.waiting_time}
                onChange={(value) =>
                  onChange({
                    ...config,
                    experiment: {
                      ...config.experiment,
                      waiting_time: value,
                    },
                  })
                }
                suffix="sec"
              />
            </div>
          </div>

          <RadioGroup
            label="Debug"
            value={config.debug ? "ON" : "OFF"}
            options={["ON", "OFF"]}
            onChange={(value) =>
              onChange({
                ...config,
                debug: value === "ON",
              })
            }
          />
        </div>
      )}
    </div>
  );
}

function parseScheduleDateTime(value: string) {
  const trimmed = value.trim();

  if (!trimmed) return null;

  const englishDateMatch = trimmed.match(
    /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})$/,
  );

  if (englishDateMatch) {
    const [, day, month, year, hour, minute] = englishDateMatch;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );

    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const htmlDateMatch = trimmed.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/,
  );

  if (htmlDateMatch) {
    const [, year, month, day, hour, minute] = htmlDateMatch;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
    );

    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return null;
}

function getEndTime(experiment: Experiment) {
  const start = new Date(experiment.startsAt);
  return new Date(start.getTime() + experiment.durationMinutes * 60 * 1000);
}


function getDisplayStatus(experiment: Experiment, now: Date): DisplayStatus {
  if (experiment.status === "cancelled") return "Cancelled";
  if (experiment.status === "completed") return "Completed";

  const start = new Date(experiment.startsAt).getTime();
  const end = start + experiment.durationMinutes * 60 * 1000;
  const current = now.getTime();

  if (current < start - 1000) return "Scheduled";

  if (current >= start - 1000 && current < end) {
    return experiment.status === "paused" ? "Paused" : "Running";
  }

  return "Finished";
}

function formatTime(date: Date) {
  return date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateTime(date: Date) {
  return date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`glass-card rounded-2xl p-6 shadow-md transition-all duration-300 hover:-translate-y-1 hover:border-cyan-300 hover:shadow-xl ${className}`}
    >
      {title && <h3 className="mb-5 text-lg font-semibold">{title}</h3>}
      {children}
    </section>
  );
}

function CollapsibleHeader({
  title,
  open,
  onClick,
}: {
  title: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-300 bg-white px-5 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-700 hover:bg-cyan-50 hover:shadow-md active:translate-y-0 active:scale-[0.99]"
    >
      <span className="font-semibold text-slate-900">{title}</span>
      <span
        aria-hidden="true"
        className={`flex h-9 w-9 items-center justify-center rounded-full border border-cyan-200 bg-cyan-50 text-lg font-bold text-cyan-800 transition-transform duration-200 ${
          open ? "rotate-180" : "rotate-0"
        }`}
      >
        ⌄
      </span>
    </button>
  );
}

function DateTimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  function openPicker() {
    const input = inputRef.current;
    if (!input) return;

    input.focus({ preventScroll: true });

    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }

    input.click();
  }

  const selectedDate = value ? new Date(value) : null;
  const hasValidDate = selectedDate && !Number.isNaN(selectedDate.getTime());
  const displayValue = hasValidDate
    ? formatDateTime(selectedDate)
    : "Select start date and time";

  return (
    <div className="relative">
      <div className="mb-2 flex items-center justify-between gap-3">
        <label
          htmlFor="experiment-start-datetime"
          className="text-sm font-medium text-slate-700"
        >
          {label}
        </label>

        {hasValidDate && (
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800">
            {formatTime(selectedDate)}
          </span>
        )}
      </div>

      <input
        id="experiment-start-datetime"
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        type="datetime-local"
        className="absolute left-4 top-12 h-px w-px opacity-0 pointer-events-none"
        aria-label={label}
        tabIndex={-1}
      />

      <button
        type="button"
        onClick={openPicker}
        className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-slate-300 bg-gradient-to-r from-white to-slate-50 px-4 py-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-600 hover:from-cyan-50 hover:to-white hover:shadow-md active:translate-y-0 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-cyan-700/30"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-800 transition duration-200 group-hover:border-cyan-700 group-hover:bg-cyan-700 group-hover:text-white">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <path d="M3 10h18" />
              <rect x="3" y="4" width="18" height="18" rx="2" />
            </svg>
          </span>

          <span className="min-w-0">
            <span
              className={`block truncate text-sm ${
                hasValidDate ? "font-semibold text-slate-900" : "text-slate-500"
              }`}
            >
              {displayValue}
            </span>
            <span className="mt-0.5 block text-xs text-slate-500">
              Opens calendar and time selector
            </span>
          </span>
        </span>

        <span className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-600 transition duration-200 group-hover:border-cyan-600 group-hover:text-cyan-800">
          Pick
        </span>
      </button>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text",
  suffix,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "number" | "datetime-local";
  suffix?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700">{label}</span>
      <div className="mt-2 flex rounded-xl border border-slate-300 bg-white shadow-sm transition duration-200 hover:border-cyan-500 hover:bg-cyan-50 focus-within:border-cyan-700 focus-within:bg-white focus-within:shadow-md">
        <input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          type={type}
          placeholder={placeholder}
          lang="en-GB"
          className="w-full rounded-xl bg-transparent px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-500"
        />

        {suffix && (
          <span className="flex items-center px-4 text-sm text-slate-700">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  suffix?: string;
}) {
  return (
    <Input
      label={label}
      value={String(value)}
      onChange={(next) => onChange(Number.parseInt(next || "0", 10))}
      type="number"
      suffix={suffix}
    />
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm text-slate-700">{label}</span>

      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full cursor-pointer rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm transition duration-200 hover:border-cyan-600 hover:bg-cyan-50 focus:border-cyan-700 focus:bg-white focus:shadow-md"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-white">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function RadioGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <p className="mb-3 text-sm text-slate-700">{label}</p>

      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={`rounded-xl border px-4 py-2 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-95 ${
              value === option
                ? "border-cyan-800 bg-cyan-700 text-white ring-2 ring-cyan-200 hover:bg-cyan-800"
                : "border-slate-400 bg-white text-slate-800 hover:border-cyan-700 hover:bg-cyan-50 hover:text-cyan-900"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {value === option && <span aria-hidden="true">✓</span>}
              {option}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function MultiSelect<T extends string>({
  values,
  options,
  onToggle,
}: {
  values: T[];
  options: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {options.map((option) => {
        const selected = values.includes(option);

        return (
          <button
            key={option}
            type="button"
            onClick={() => onToggle(option)}
            aria-pressed={selected}
            className={`rounded-full border px-5 py-2 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-95 ${
              selected
                ? "border-cyan-800 bg-cyan-700 text-white ring-2 ring-cyan-200 hover:bg-cyan-800"
                : "border-slate-400 bg-white text-slate-800 hover:border-cyan-700 hover:bg-cyan-50 hover:text-cyan-900"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {selected && <span aria-hidden="true">✓</span>}
              {option}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ControlButton({
  label,
  color,
  onClick,
  disabled = false,
}: {
  label: string;
  color: "emerald" | "cyan" | "amber" | "red";
  onClick: () => void;
  disabled?: boolean;
}) {
  const colors = {
    emerald:
      "border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800",
    cyan: "border-cyan-700 bg-cyan-700 text-white hover:bg-cyan-800",
    amber: "border-amber-700 bg-amber-600 text-white hover:bg-amber-700",
    red: "border-red-700 bg-red-700 text-white hover:bg-red-800",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:shadow-sm ${colors[color]}`}
    >
      {label}
    </button>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-300 py-2 text-sm last:border-b-0">
      <span className="text-slate-700">{label}</span>
      <span className="text-right text-slate-800">{value || "-"}</span>
    </div>
  );
}

function Badge({
  color,
  label,
}: {
  color: "emerald" | "cyan" | "slate" | "amber";
  label: string;
}) {
  const colors = {
    emerald: "border-emerald-700 bg-emerald-700 text-white",
    cyan: "border-cyan-700 bg-cyan-700 text-white",
    slate: "border-slate-300 bg-slate-200 text-slate-700",
    amber: "border-amber-700 bg-amber-600 text-white",
  };

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold shadow-sm ${colors[color]}`}
    >
      {label}
    </span>
  );
}

function ValidationMessage({ valid, text }: { valid: boolean; text: string }) {
  return (
    <div
      className={`mt-4 rounded-xl border p-4 text-sm ${
        valid
          ? "border-emerald-700 bg-emerald-700 text-white"
          : "border-amber-700 bg-amber-600 text-white"
      }`}
    >
      {text}
    </div>
  );
}
