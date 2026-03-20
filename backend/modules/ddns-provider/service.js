import { create, remove, test, update } from "./mutations.js";
import { get, getAll } from "./reads.js";

export default {
	create,
	update,
	get,
	getAll,
	delete: remove,
	test,
};
