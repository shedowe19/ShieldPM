import fs from "node:fs/promises";
import path from "node:path";
import { v4 as uuidv4 } from "uuid";
import errs from "../lib/error.js";
import internalAuditLog from "./audit-log.js";
import WasmModule from "../models/wasm_module.js";
import proxyHostModel from "../models/proxy_host.js";

const WASM_PATH = "/data/wasm";

const internalWasmModule = {
	async setup() {
		try {
			await fs.mkdir(WASM_PATH, { recursive: true });
		} catch (err) {
			if (err.code !== "EEXIST") {
				throw err;
			}
		}
	},

	async create(access, data, file) {
		await access.can("settings:list");

		if (!file) {
			throw new errs.ValidationError("No WASM file provided");
		}

		await this.setup();

		const ext = path.extname(file.originalname);
		if (ext !== ".wasm") {
			throw new errs.ValidationError("Only .wasm files are allowed");
		}

		const uniqueFilename = `${uuidv4()}${ext}`;
		const destPath = path.join(WASM_PATH, uniqueFilename);

		await fs.copyFile(file.path, destPath);
		await fs.unlink(file.path);

		const moduleData = {
			owner_user_id: access.token.getUserId(1),
			name: data.name || file.originalname,
			description: data.description || "",
			filename: uniqueFilename,
		};

		const row = await WasmModule.query().insertAndFetch(moduleData);

		internalAuditLog.add(access, {
			action: "created",
			meta: {
				id: row.id,
				name: row.name,
			},
		});

		return row;
	},

	async update(access, data) {
		await access.can("settings:list");

		const row = await WasmModule.query().where("id", data.id).where("is_deleted", 0).first();

		if (!row) {
			throw new errs.ItemNotFoundError(data.id);
		}

		const updatedRow = await WasmModule.query().patchAndFetchById(row.id, {
			name: data.name,
			description: data.description,
		});

		internalAuditLog.add(access, {
			action: "updated",
			meta: {
				id: updatedRow.id,
				name: updatedRow.name,
			},
		});

		return updatedRow;
	},

	async get(access, data) {
		await access.can("settings:list");

		const row = await WasmModule.query().where("id", data.id).where("is_deleted", 0).first();

		if (!row) {
			throw new errs.ItemNotFoundError(data.id);
		}

		return row;
	},

	async getAll(access, expand) {
		await access.can("settings:list");

		let query = WasmModule.query().where("is_deleted", 0).orderBy("name", "ASC");

		if (expand && expand.includes("owner")) {
			query = query.withGraphFetched("owner");
		}

		return query;
	},

	async delete(access, data) {
		await access.can("settings:list");

		const row = await WasmModule.query().where("id", data.id).where("is_deleted", 0).first();

		if (!row) {
			throw new errs.ItemNotFoundError(data.id);
		}

		// Check if it's in use by any proxy host
		const inUseCount = await proxyHostModel.query().where("wasm_module_id", data.id).where("is_deleted", 0).resultSize();
		if (inUseCount > 0) {
			throw new errs.ValidationError("WASM Module is currently in use by one or more proxy hosts");
		}

		await WasmModule.query().patchAndFetchById(row.id, { is_deleted: 1 });

		try {
			await fs.unlink(path.join(WASM_PATH, row.filename));
		} catch (err) {
			// Ignore error if file is already deleted or not found
			if (err.code !== "ENOENT") {
				console.error("Failed to delete WASM file", err);
			}
		}

		internalAuditLog.add(access, {
			action: "deleted",
			meta: {
				id: row.id,
				name: row.name,
			},
		});

		return true;
	},
};

export default internalWasmModule;
