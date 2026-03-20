import { create, update } from "./mutations.js";
import { disable, enable, remove } from "./lifecycle.js";
import { get, getAll, getCount } from "./reads.js";

export default {
	create,
	update,
	get,
	getAll,
	getCount,
	delete: remove,
	enable,
	disable,
};
