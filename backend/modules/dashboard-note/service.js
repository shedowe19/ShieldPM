import errs from "../../lib/error.js";
import dashboardNoteModel from "../../models/dashboard_note.js";
import internalAuditLog from "../audit-log/service.js";

const dashboardNoteService = {
	create: async (access, data) => {
		await access.can("dashboard_notes:create");
		const row = await dashboardNoteModel.query().insertAndFetch(data);
		await internalAuditLog.add(access, {
			action: "created",
			object_type: "dashboard_note",
			object_id: row.id,
			meta: row,
		});
		return row;
	},

	update: async (access, data) => {
		await access.can("dashboard_notes:update", data.id);
		await dashboardNoteService.get(access, { id: data.id });
		await dashboardNoteModel.query().where({ id: data.id }).patch(data);
		const updatedRow = await dashboardNoteService.get(access, { id: data.id });
		await internalAuditLog.add(access, {
			action: "updated",
			object_type: "dashboard_note",
			object_id: updatedRow.id,
			meta: updatedRow,
		});
		return updatedRow;
	},

	delete: async (access, data) => {
		await access.can("dashboard_notes:delete", data.id);
		const row = await dashboardNoteService.get(access, { id: data.id });
		await dashboardNoteModel.query().where({ id: data.id }).delete();
		await internalAuditLog.add(access, {
			action: "deleted",
			object_type: "dashboard_note",
			object_id: row.id,
			meta: row,
		});
		return true;
	},

	get: async (access, data) => {
		await access.can("dashboard_notes:get", data.id);
		const row = await dashboardNoteModel.query().where("id", data.id).first();
		if (row) return row;
		throw new errs.ItemNotFoundError(data.id);
	},

	getAll: async (access) => {
		await access.can("dashboard_notes:list");
		return dashboardNoteModel.query().orderBy("position", "ASC");
	},
};

export default dashboardNoteService;
