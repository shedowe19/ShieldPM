import { get } from "./base";

export interface FlowClient {
	id: string;
	label: string;
	requests: number;
	completedBytes: number;
	lastSeen: string;
	currentBytesPerSecond: null;
}

export interface FlowTarget {
	id: string;
	label: string;
	kind: "configured" | "observed" | "unknown";
	requests: number | null;
	lastSeen: string | null;
	currentBytesPerSecond: null;
}

export interface FlowHost {
	id: number;
	domains: string[];
	enabled: boolean;
	targets: FlowTarget[];
	clients: FlowClient[];
	truncated: boolean;
}

export interface TrafficFlowSnapshot {
	enabled: boolean;
	generatedAt: string;
	configurationRevision: string;
	sampleComplete: false;
	window: { start: string; end: string };
	capabilities: { currentRates: false; source: "completed_requests" };
	hosts: FlowHost[];
	truncated: boolean;
	collector: { state: "disabled" | "waiting" | "receiving" | "error"; lastObservedAt: string | null };
	pollIntervalMs: number;
}

export const getTrafficFlow = (signal?: AbortSignal): Promise<TrafficFlowSnapshot> =>
	get({ url: "/nginx/analytics/flow" }, signal ? { signal } : undefined);
