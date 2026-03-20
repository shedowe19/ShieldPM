import { omissions } from "./helpers.js";
import { disable, enable, remove } from "./lifecycle.js";
import { create, update } from "./mutations.js";
import { get, getAll, getCount } from "./reads.js";

export default {
	create,
	update,
	get,
	delete: remove,
	enable,
	disable,
	getAll,
	getCount,
	omissions,
};
