import { chat } from "./chat.js";
import { getConfig, getConfigForChat, setConfig } from "./config.js";
import { getModels } from "./models.js";

export default {
	getConfig,
	setConfig,
	getModels,
	chat,
	_getConfigForChat: getConfigForChat,
};
