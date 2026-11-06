import { AsyncLocalStorage } from "node:async_hooks";

export const FLOW_SETTING_ID = "traffic-flow";
export const FLOW_DEFAULTS = Object.freeze({ enabled: true, live_enabled: true, client_mode: "prefix" });
const rendering = new AsyncLocalStorage();
let current = { ...FLOW_DEFAULTS };
let nativeAvailable = false;
let initialized = false;
export const flowSettingsReady = () => initialized;
let configurationFailed = false;
export const setFlowConfigurationFailed = (failed) => {
	configurationFailed = failed;
};

/** Legacy variables are read only when creating the persistent setting. */
export function importedFlowSettings(env = process.env) {
	return {
		enabled: env.TRAFFIC_FLOW_ENABLED === undefined || env.TRAFFIC_FLOW_ENABLED === "true",
		live_enabled: env.TRAFFIC_FLOW_LIVE_ENABLED === undefined || env.TRAFFIC_FLOW_LIVE_ENABLED === "true",
		client_mode: env.TRAFFIC_FLOW_CLIENT_MODE === "address" ? "address" : "prefix",
	};
}
export const flowSettings = () => rendering.getStore()?.policy || current;
export const flowNativeAvailable = () => rendering.getStore()?.nativeAvailable ?? nativeAvailable;
export function setFlowSettings(policy, available = nativeAvailable) {
	current = { ...policy };
	initialized = true;
	configurationFailed = false;
	nativeAvailable = available;
}
export const withFlowSettings = (policy, available, callback) =>
	rendering.run({ policy, nativeAvailable: available }, callback);
export function flowRuntime(policy = current, available = nativeAvailable) {
	const failed = !rendering.getStore() && configurationFailed;
	return {
		native_available: available,
		live_effective: policy.enabled && policy.live_enabled && available && !failed,
		reason: failed
			? "configuration_failed"
			: !policy.enabled
				? "disabled"
				: !policy.live_enabled
					? "native_disabled"
					: !available
						? "native_module_unavailable"
						: null,
	};
}
