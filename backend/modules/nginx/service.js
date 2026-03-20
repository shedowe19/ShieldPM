import {
	backupConfig,
	deleteBackupConfig,
	deleteConfig,
	deleteFile,
	renameConfigAsError,
	restoreConfig,
} from "./files.js";
import { advancedConfigHasDefaultLocation, getConfigName, getFileFriendlyHostType } from "./helpers.js";
import { generateConfig, renderLocations } from "./render.js";
import { bulkGenerateConfigs, configure, reload, test } from "./runtime.js";

export default {
	configure,
	test,
	reload,
	getConfigName,
	renderLocations,
	generateConfig,
	deleteFile,
	getFileFriendlyHostType,
	deleteConfig,
	renameConfigAsError,
	backupConfig,
	restoreConfig,
	deleteBackupConfig,
	bulkGenerateConfigs,
	advancedConfigHasDefaultLocation,
};
