import { build, getFilename, maskItems, omissions } from "./helpers.js";
import { create, remove, update } from "./mutations.js";
import { get, getAll, getCount } from "./reads.js";

export default {
	create,
	update,
	get,
	delete: remove,
	getAll,
	getCount,
	maskItems,
	getFilename,
	build,
	omissions,
};
