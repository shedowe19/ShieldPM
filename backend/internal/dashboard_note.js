import errs from "../lib/error.js";
import dashboardNoteModel from "../models/dashboard_note.js";
import internalAuditLog from "./audit-log.js";

const internalDashboardNote = {
	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @return {Promise}
	 */
	create: async (access, data) => {
		await access.can("dashboard_notes:create");

		const row = await dashboardNoteModel.query().insertAndFetch(data);

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "dashboard_note",
			object_id: row.id,
			meta: row,
		});

		return row;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	update: async (access, data) => {
		await access.can("dashboard_notes:update", data.id);
		const _row = await internalDashboardNote.get(access, { id: data.id });

		await dashboardNoteModel.query().where({ id: data.id }).patch(data);
		const updatedRow = await internalDashboardNote.get(access, {
			id: data.id,
		});

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "dashboard_note",
			object_id: updatedRow.id,
			meta: updatedRow,
		});

		return updatedRow;
	},

	/**
	 * @param  {import("../lib/types.js").Access}  access
	 * @param  {Object}  data
	 * @param  {Number}  data.id
	 * @return {Promise}
	 */
	delete: async (access, data) => {
		await access.can("dashboard_notes:delete", data.id);
		const row = await internalDashboardNote.get(access, { id: data.id });

		await dashboardNoteModel.query().where({ id: data.id }).delete();

		// Add to audit log
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "dashboard_note",
			object_id: row.id,
			meta: row,
		});

		return true;
	},

	/**
	 * @param  {import("../lib/types.js").Access}   access
	 * @param  {Object}   data
	 * @param  {Number}   data.id
	 * @return {Promise}
	 */
	get: async (access, data) => {
		await access.can("dashboard_notes:get", data.id);
		const row = await dashboardNoteModel.query().where("id", data.id).first();
		if (row) {
			return row;
		}
		throw new errs.ItemNotFoundError(data.id);
	},

	/**
	 * All settings
	 *
	 * @param   {import("../lib/types.js").Access}  access
	 * @returns {Promise}
	 */
	getAll: async (access) => {
		await access.can("dashboard_notes:list");
		return dashboardNoteModel.query().orderBy("position", "ASC");
	},
};

export default internalDashboardNote;
