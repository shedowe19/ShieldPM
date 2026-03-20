import { decrypt, encrypt } from "../../lib/encryption.js";
import settingModel from "../../models/setting.js";
import internalSetting from "../../internal/setting.js";

const AI_CONFIG_ID = "ai-config";

const withDefaults = (meta = {}) => {
	const next = { ...meta };
	if (!next.num_ctx) next.num_ctx = 8192;
	if (!next.num_batch) next.num_batch = 512;
	if (!next.num_thread) next.num_thread = 4;
	if (!next.keep_alive) next.keep_alive = "5m";
	return next;
};

const decryptApiKey = (meta) => {
	if (meta.api_key) {
		try {
			meta.api_key = decrypt(meta.api_key);
		} catch {}
	}
	return meta;
};

const getConfig = async (access) => {
	await access.can("settings:list");
	try {
		const row = await internalSetting.get(access, { id: AI_CONFIG_ID });
		return decryptApiKey({ ...row.meta });
	} catch {
		return {
			enabled: false,
			provider: "gemini",
			api_key: "",
			base_url: "",
			model: "",
			num_ctx: 8192,
			num_batch: 512,
			num_thread: 4,
			keep_alive: "5m",
		};
	}
};

const getConfigForChat = async () => {
	try {
		const row = await settingModel.query().where("id", AI_CONFIG_ID).first();
		if (!row) return { enabled: false };
		return withDefaults(decryptApiKey(row.meta));
	} catch {
		return { enabled: false };
	}
};

const setConfig = async (access, data) => {
	await access.can("settings:update", AI_CONFIG_ID);
	const dataToSave = { ...data };
	if (dataToSave.api_key) dataToSave.api_key = encrypt(dataToSave.api_key);
	let exists = false;
	try {
		await internalSetting.get(access, { id: AI_CONFIG_ID });
		exists = true;
	} catch (err) {
		if (err.code !== 404 && err.message !== AI_CONFIG_ID) throw err;
	}
	if (exists) {
		await internalSetting.update(access, {
			id: AI_CONFIG_ID,
			description: "AI Agent Configuration",
			value: data.enabled ? "true" : "false",
			meta: dataToSave,
		});
	} else {
		await settingModel.query().insert({
			id: AI_CONFIG_ID,
			name: AI_CONFIG_ID,
			description: "AI Agent Configuration",
			value: data.enabled ? "true" : "false",
			meta: dataToSave,
		});
	}
	return data;
};

export { AI_CONFIG_ID, getConfig, getConfigForChat, setConfig };
