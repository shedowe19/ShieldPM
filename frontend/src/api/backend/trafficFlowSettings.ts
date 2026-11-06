import { get, put } from "./base";

export interface TrafficFlowConfig {
	enabled: boolean;
	liveEnabled: boolean;
	clientMode: "prefix" | "address" | "hidden";
}
export interface TrafficFlowSetting {
	id: "traffic-flow";
	value: string;
	meta: TrafficFlowConfig;
	runtime: {
		nativeAvailable: boolean;
		liveEffective: boolean;
		reason: "native_module_unavailable" | "disabled" | "native_disabled" | "configuration_failed" | null;
	};
}
export const getTrafficFlowSetting = (): Promise<TrafficFlowSetting> => get({ url: "/settings/traffic-flow" });
export const saveTrafficFlowSetting = (meta: TrafficFlowConfig): Promise<TrafficFlowSetting> =>
	put({ url: "/settings/traffic-flow", data: { value: "configured", meta } });
