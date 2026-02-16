import internalAccessList from "../../access-list.js";

export const get_access_lists = async (access, args) => {
	const lists = await internalAccessList.getAll(access);
	return JSON.stringify(lists.map((l) => ({ id: l.id, name: l.name })));
};

export const create_access_list = async (access, args) => {
	const newList = await internalAccessList.create(access, {
		items: [],
		clients: [],
		meta: {},
		...args,
	});
	return `Created Access List ID: ${newList.id}`;
};

export const update_access_list = async (access, args) => {
	await internalAccessList.update(access, { id: args.id, ...args });
	return `Updated Access List ID: ${args.id}`;
};

export const delete_access_list = async (access, args) => {
	await internalAccessList.delete(access, { id: args.id });
	return `Deleted Access List ID: ${args.id}`;
};
