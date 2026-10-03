import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rows: [],
	hosts: [],
	events: [],
	rollbackError: null,
	errorStatusError: null,
	audit: vi.fn(),
	fetch: vi.fn(),
	nginx: {
		withConfigurationLock: vi.fn((callback) => callback()),
		configureHost: vi.fn(),
		test: vi.fn(),
		reload: vi.fn(),
		commitStagedConfig: vi.fn(),
		rollbackStagedConfig: vi.fn(),
	},
}));

const query = (kind) => {
	const filters = [];
	let selected = null;
	let single = false;
	const rows = () => state[kind].filter((row) => filters.every((filter) => filter(row)));
	const result = {
		where: (field, value) => {
			filters.push((row) =>
				typeof row[field] === "boolean" ? Number(row[field]) === Number(value) : row[field] === value,
			);
			return result;
		},
		whereIn: (field, values) => {
			filters.push((row) => values.includes(row[field]));
			return result;
		},
		findById: (id) => {
			filters.push((row) => row.id === id);
			single = true;
			return result;
		},
		orderBy: () => result,
		select: (...fields) => {
			selected = fields;
			return result;
		},
		insertAndFetch: async (data) => {
			const row = {
				...structuredClone(data),
				id: state.rows.length + 1,
				created_on: "2026-10-01",
				modified_on: "2026-10-01",
			};
			state.rows.push(row);
			return structuredClone(row);
		},
		patchAndFetchById: async (id, data) => {
			const row = state[kind].find((item) => item.id === id);
			Object.assign(row, structuredClone(data));
			state.events.push(`patch:${row.entries}`);
			return structuredClone(row);
		},
		patch: async (data) => {
			if (state.rollbackError && Object.hasOwn(data, "entries")) {
				state.events.push("DB rollback failed");
				throw state.rollbackError;
			}
			if (state.errorStatusError && Object.hasOwn(data, "last_error") && !Object.hasOwn(data, "entries")) {
				state.events.push("Error status update failed");
				throw state.errorStatusError;
			}
			for (const row of rows()) Object.assign(row, structuredClone(data));
			state.events.push(`patch:${data.entries ?? "metadata"}`);
			return rows().length;
		},
		// biome-ignore lint/suspicious/noThenProperty: Test double for Objection's thenable query builder.
		then: (resolve, reject) => {
			const values = rows().map((row) =>
				selected ? Object.fromEntries(selected.map((field) => [field, row[field]])) : structuredClone(row),
			);
			return Promise.resolve(single ? values[0] : values).then(resolve, reject);
		},
	};
	return result;
};

vi.mock("../../models/firewall_list.js", () => ({ default: { query: () => query("rows") } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: () => query("hosts") } }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: state.audit } }));
vi.mock("../../internal/nginx.js", () => ({ default: state.nginx }));
vi.mock("../../internal/gitops.js", () => ({ default: { triggerAutoPush: vi.fn() } }));
vi.mock("../../lib/firewall-download.js", () => ({
	fetchIpList: state.fetch,
	validateSourceUrl: (value) => new URL(value),
}));
vi.mock("../../logger.js", () => ({ access: { error: vi.fn() } }));

import service from "../../internal/firewall-list.js";

const access = { can: vi.fn(), token: { getUserId: () => 7 } };
const originalList = () => ({
	id: 1,
	name: "VPN",
	reason: "VPN restricted",
	description: "Private note",
	source_type: "url",
	source_url: "https://example.com/ips.txt",
	update_interval_hours: 24,
	enabled: true,
	entries: "192.0.2.0/24",
	entry_count: 1,
	last_updated_on: "2026-09-01T00:00:00.000Z",
	last_error: null,
	owner_user_id: 7,
	created_on: "2026-09-01",
	modified_on: "2026-09-01",
	is_deleted: false,
});

describe("firewall list service", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.rows = [originalList()];
		state.hosts = [];
		state.events = [];
		state.rollbackError = null;
		state.errorStatusError = null;
		access.can.mockResolvedValue({ permission_visibility: "all" });
		state.fetch.mockResolvedValue("203.0.113.5\n");
		state.nginx.configureHost.mockImplementation(async (model, host_type, host) => {
			state.events.push(`render:${host.id}:${state.rows[0].entries}`);
			return { model, host_type, host };
		});
		state.nginx.test.mockResolvedValue(undefined);
		state.nginx.reload.mockResolvedValue(undefined);
		state.nginx.commitStagedConfig.mockResolvedValue(undefined);
		state.nginx.rollbackStagedConfig.mockResolvedValue(undefined);
	});

	it("creates normalized manual lists with the authenticated owner and compact audit data", async () => {
		const result = await service.create(access, {
			name: "Manual",
			reason: "Blocked by operator",
			entries: "1.2.3.9/24\n1.2.3.0/24\n",
		});
		expect(result.entries).toBe("1.2.3.0/24");
		expect(result.entry_count).toBe(1);
		expect(result.owner_user_id).toBe(7);
		expect(state.audit.mock.calls[0][1].meta).not.toHaveProperty("entries");
	});

	it("filters list summaries and individual reads by permission visibility", async () => {
		state.rows.push({ ...originalList(), id: 2, owner_user_id: 19 });
		access.can.mockResolvedValue({ permission_visibility: "user" });
		const summaries = await service.getAll(access);
		expect(summaries.map((row) => row.id)).toEqual([1]);
		expect(summaries[0]).not.toHaveProperty("entries");
		await expect(service.get(access, { id: 2 })).rejects.toMatchObject({ status: 404 });
		await expect(service.update(access, { id: 2, name: "Stolen" })).rejects.toMatchObject({ status: 404 });
	});

	it("prevents deletion of references even on disabled hosts and disabled policies", async () => {
		state.hosts = [
			{ id: 14, enabled: false, is_deleted: false, meta: { ip_firewall: { enabled: false, list_ids: [1] } } },
		];
		await expect(service.delete(access, { id: 1 })).rejects.toThrow(/still assigned/);
		expect(state.rows[0].is_deleted).toBe(false);
		expect(state.audit).not.toHaveBeenCalled();
	});

	it("stages all affected enabled hosts with new data before testing and activating the batch", async () => {
		state.hosts = [10, 11].map((id) => ({
			id,
			enabled: true,
			is_deleted: false,
			meta: { ip_firewall: { enabled: true, list_ids: [1] } },
		}));
		const result = await service.refresh(access, { id: 1 });
		expect(result.entries).toBe("203.0.113.5");
		expect(state.events).toEqual(["patch:203.0.113.5", "render:10:203.0.113.5", "render:11:203.0.113.5"]);
		expect(state.nginx.test).toHaveBeenCalledTimes(1);
		expect(state.nginx.reload).toHaveBeenCalledTimes(1);
		expect(state.nginx.commitStagedConfig).toHaveBeenCalledTimes(2);
	});

	it("restores the DB and all staged files after a reload failure and retains the old refresh timestamp", async () => {
		state.hosts = [10, 11].map((id) => ({
			id,
			enabled: true,
			is_deleted: false,
			meta: { ip_firewall: { enabled: true, list_ids: [1] } },
		}));
		state.nginx.reload.mockRejectedValueOnce(new Error("reload failed"));
		await expect(service.refresh(access, { id: 1 })).rejects.toThrow(/previous list retained/);
		expect(state.rows[0].entries).toBe("192.0.2.0/24");
		expect(state.rows[0].last_updated_on).toBe("2026-09-01T00:00:00.000Z");
		expect(state.rows[0].last_error).toMatch(/reload failed/);
		expect(state.nginx.rollbackStagedConfig).toHaveBeenCalledTimes(2);
		expect(state.nginx.reload).toHaveBeenCalledTimes(2);
		expect(state.nginx.commitStagedConfig).not.toHaveBeenCalled();
	});

	it("restores earlier stages when a later host cannot render", async () => {
		state.hosts = [10, 11].map((id) => ({
			id,
			enabled: true,
			is_deleted: false,
			meta: { ip_firewall: { enabled: true, list_ids: [1] } },
		}));
		state.nginx.configureHost
			.mockImplementationOnce(async (model, host_type, host) => ({ model, host_type, host }))
			.mockRejectedValueOnce(new Error("render failed"));
		await expect(service.update(access, { id: 1, reason: "New reason" })).rejects.toThrow(/previous list retained/);
		expect(state.rows[0].reason).toBe("VPN restricted");
		expect(state.nginx.rollbackStagedConfig).toHaveBeenCalledTimes(1);
		expect(state.nginx.commitStagedConfig).not.toHaveBeenCalled();
	});
	it.each([false, true])(
		"restores files despite a database rollback failure, status write fails=%s",
		async (statusFails) => {
			state.hosts = [10, 11].map((id) => ({
				id,
				enabled: true,
				is_deleted: false,
				meta: { ip_firewall: { enabled: true, list_ids: [1] } },
			}));
			state.rollbackError = new Error("Database connection lost while restoring list");
			if (statusFails) state.errorStatusError = state.rollbackError;
			state.nginx.test.mockRejectedValueOnce(new Error("invalid new config"));
			state.nginx.rollbackStagedConfig.mockImplementation(async (stage) => {
				state.events.push(`restore:${stage.host.id}`);
			});
			state.nginx.reload.mockImplementation(async () => {
				state.events.push("restored config reload");
			});

			await expect(service.refresh(access, { id: 1 })).rejects.toThrow(
				"recovery incomplete (list data): invalid new config",
			);

			expect(state.events).toEqual([
				"patch:203.0.113.5",
				"render:10:203.0.113.5",
				"render:11:203.0.113.5",
				"DB rollback failed",
				"restore:10",
				"restore:11",
				"restored config reload",
				statusFails ? "Error status update failed" : "patch:metadata",
			]);
			expect(state.rows[0].entries).toBe("203.0.113.5");
			if (statusFails) expect(state.rows[0].last_error).toBe(null);
			else expect(state.rows[0].last_error).toMatch(/recovery incomplete \(list data\)/);
			expect(state.nginx.rollbackStagedConfig).toHaveBeenCalledTimes(2);
			expect(state.nginx.reload).toHaveBeenCalledOnce();
			expect(state.nginx.commitStagedConfig).not.toHaveBeenCalled();
			expect(state.audit).not.toHaveBeenCalled();
		},
	);
	it.each(["host configuration/status", "Nginx reload"])(
		"reports incomplete %s recovery instead of claiming the previous configuration was retained",
		async (failure) => {
			state.hosts = [10, 11].map((id) => ({
				id,
				enabled: true,
				is_deleted: false,
				meta: { ip_firewall: { enabled: true, list_ids: [1] } },
			}));
			state.nginx.test.mockRejectedValueOnce(new Error("invalid new config"));
			if (failure === "host configuration/status") {
				state.nginx.rollbackStagedConfig.mockRejectedValueOnce(new Error("First host restore failed"));
			} else {
				state.nginx.reload.mockRejectedValueOnce(new Error("Previous configuration reload failed"));
			}

			await expect(service.refresh(access, { id: 1 })).rejects.toThrow(`recovery incomplete (${failure})`);

			expect(state.rows[0].entries).toBe("192.0.2.0/24");
			expect(state.nginx.rollbackStagedConfig).toHaveBeenCalledTimes(2);
			expect(state.nginx.reload).toHaveBeenCalledOnce();
			expect(state.nginx.commitStagedConfig).not.toHaveBeenCalled();
		},
	);

	it.each(["bad-address\n", "# Empty downloaded file\n"])(
		"retains working entries for invalid or empty downloaded content",
		async (content) => {
			state.fetch.mockResolvedValue(content);
			await expect(service.refresh(access, { id: 1 })).rejects.toThrow();
			expect(state.rows[0].entries).toBe("192.0.2.0/24");
			expect(state.rows[0].last_error).toBeTruthy();
			expect(state.nginx.configureHost).not.toHaveBeenCalled();
		},
	);

	it("preserves the host's rule order and returns only enabled lists with parsed entries", async () => {
		state.rows.push(
			{ ...originalList(), id: 2, entries: "2001:db8::/64", enabled: false },
			{ ...originalList(), id: 3, name: "Other", entries: "203.0.113.9" },
		);
		expect(await service.getForHost([3, 2, 1])).toEqual([
			{ id: 3, name: "Other", reason: "VPN restricted", entries: ["203.0.113.9"] },
			{ id: 1, name: "VPN", reason: "VPN restricted", entries: ["192.0.2.0/24"] },
		]);
		await expect(service.getForHost([999])).rejects.toThrow(/no longer exists/);
	});

	it("checks all assigned IDs including disabled lists before a serialized host write", async () => {
		state.rows[0].enabled = false;
		await expect(service.assertExistForHost([1])).resolves.toBeUndefined();
		state.rows[0].is_deleted = true;
		await expect(service.assertExistForHost([1])).rejects.toThrow(/no longer exists/);
	});

	it("backs off failed scheduled refreshes and ignores disabled or manual lists", async () => {
		state.rows[0].id = 71;
		state.rows.push(
			{ ...originalList(), id: 72, enabled: false },
			{ ...originalList(), id: 73, source_type: "manual" },
		);
		state.fetch.mockRejectedValue(new Error("DNS timeout"));
		await service.process();
		await service.process();
		expect(state.fetch).toHaveBeenCalledTimes(1);
		expect(state.rows[0].entries).toBe("192.0.2.0/24");
		expect(state.rows[0].last_error).toBe("DNS timeout");
	});
});
