import { get } from "./base";

export interface FlowRate {
	uploadSemantics?: string[];
	downloadSemantics?: string[];
	uploadBytesPerSecond: number;
	downloadBytesPerSecond: number;
	bytesPerSecond: number;
	smoothedBytesPerSecond: number;
	windowStart: string;
	windowEnd: string;
	samples: number;
}

export interface FlowClient {
	id: string;
	label: string;
	requests: number;
	completedBytes: number;
	lastSeen: string;
	currentBytesPerSecond: number | null;
	rate?: FlowRate;
	rateIncomplete?: boolean;
	mixedSemantics?: boolean;
	unknownReason?: string;
	rateComponents?: (FlowRate & { id: string; activeRequests?: number })[];
	activeRequests?: number;
}

export interface FlowTarget {
	id: string;
	label: string;
	kind: "configured" | "observed" | "unknown";
	origins?: ("configured" | "observed")[];
	requests: number | null;
	lastSeen: string | null;
	currentBytesPerSecond: number | null;
	rate?: FlowRate;
	rateIncomplete?: boolean;
	mixedSemantics?: boolean;
	unknownReason?: string;
	rateComponents?: (FlowRate & { id: string; activeRequests?: number })[];
	activeRequests?: number;
}

export interface FlowHost {
	clientRate?: FlowRate | null;
	clientRateIncomplete?: boolean;
	id: number;
	domains: string[];
	enabled: boolean;
	targets: FlowTarget[];
	clients: FlowClient[];
	truncated: boolean;
}

export interface TrafficFlowSnapshot {
	clientMode?: "prefix" | "address" | "hidden";
	diagnostics?: {
		liveEnabled: boolean;
		receiverState: string;
		nativeLastObservedAt: string | null;
		reason: string | null;
	};
	enabled: boolean;
	generatedAt: string;
	configurationRevision: string;
	sampleComplete: false;
	window: { start: string; end: string };
	capabilities: {
		currentRates: boolean;
		source: "completed_requests" | "native_http_transport";
		byteSemantics?: string;
	};
	hosts: FlowHost[];
	truncated: boolean;
	collector: { state: "disabled" | "waiting" | "receiving" | "error"; lastObservedAt: string | null };
	pollIntervalMs: number;
}

export const getTrafficFlow = (signal?: AbortSignal): Promise<TrafficFlowSnapshot> =>
	get({ url: "/nginx/analytics/flow" }, signal ? { signal } : undefined);
