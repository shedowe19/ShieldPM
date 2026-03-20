import fs from "node:fs";
import errs from "../../lib/error.js";
import settingModel from "../../models/setting.js";
import { auditLogService } from "../../modules/audit-log/index.js";
import { nginxService } from "../../modules/nginx/index.js";
import { get } from "./reads.js";

const update = async (access, data) => {
	await access.can("settings:update", data.id);
	const row = await get(access, { id: data.id });
	if (row.id !== data.id) {
		throw new errs.InternalValidationError(`Setting could not be updated, IDs do not match: ${row.id} !== ${data.id}`);
	}
	await settingModel.query().where({ id: data.id }).patch(data);
	const updatedRow = await get(access, { id: data.id });
	if (updatedRow.id === "default-site") {
		if (updatedRow.value === "html") {
			fs.writeFileSync("/data/html/index.html", updatedRow.meta.html, { encoding: "utf8" });
		}
		try {
			await nginxService.deleteConfig("default");
			await nginxService.generateConfig("default", updatedRow);
			await nginxService.test();
			await nginxService.reload();
		} catch (_err) {
			await nginxService.deleteConfig("default");
			await nginxService.test();
			await nginxService.reload();
			throw new errs.ValidationError("Could not reconfigure Nginx. Please check logs.");
		}
	}
	await auditLogService.add(access, {
		action: "updated",
		object_type: "setting",
		object_id: 0,
		meta: {
			setting_id: updatedRow.id,
			name: updatedRow.name,
			description: updatedRow.description,
			value: updatedRow.value,
		},
	});
	return updatedRow;
};

export { update };
