import Ajv from "ajv/dist/2020.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ payload: null, users: [], query: vi.fn(), proxies: vi.fn() }));
vi.mock("../../models/token.js", () => ({
	default: () => {
		let payload;
		return {
			load: async () => {
				payload = structuredClone(state.payload);
				return payload;
			},
			get: (key) => payload[key],
			hasScope: (scope) => payload.scope.includes(scope),
			getUserId: () => payload.attrs.id,
		};
	},
}));
vi.mock("../../models/user.js", () => ({ default: { query: state.query } }));
vi.mock("../../models/proxy_host.js", () => ({ default: { query: state.proxies } }));
vi.mock("../../logger.js", () => ({ access: { error: vi.fn() } }));

const compile = vi.spyOn(Ajv.prototype, "compile");
const { default: Access } = await import("../../lib/access.js");

beforeEach(() => {
	state.payload = { attrs: { id: 7 }, scope: ["user"] };
	state.users = [7, 8].map((id) => ({
		id,
		roles: [],
		is_deleted: 0,
		is_disabled: 0,
		permissions: { visibility: "user", proxy_hosts: "manage" },
	}));
	state.proxies.mockClear();
	state.query.mockReset().mockImplementation(() => {
		const filters = [];
		const query = {
			where: (key, value) => {
				filters.push([key, value]);
				return query;
			},
			andWhere: (key, value) => {
				filters.push([key, value]);
				return query;
			},
			allowGraph: () => query,
			withGraphFetched: () => query,
			first: async () =>
				structuredClone(state.users.find((user) => filters.every(([key, value]) => user[key] === value))),
		};
		return query;
	});
});

describe("cached permission validators keep actor identity and permissions as fresh data", () => {
	it("does not compile or load all proxy IDs for each list request", async () => {
		const before = compile.mock.calls.length;
		for (let index = 0; index < 100; index++) {
			const access = new Access("signed");
			await access.load();
			expect((await access.can("proxy_hosts:list")).permission_visibility).toBe("user");
		}
		expect(compile.mock.calls.length - before).toBe(1);
		expect(state.query).toHaveBeenCalledTimes(100);
		expect(state.proxies).not.toHaveBeenCalled();
	});

	it("keeps the self-account boundary across different actors sharing one validator", async () => {
		const first = new Access("first");
		await first.load();
		await expect(first.can("users:update", "7")).resolves.toMatchObject({ data: 7 });
		await expect(first.can("users:update", 8)).rejects.toThrow("Permission Denied");
		state.payload.attrs.id = 8;
		const second = new Access("second");
		await second.load();
		await expect(second.can("users:update", 8)).resolves.toMatchObject({ data: 8 });
		await expect(second.can("users:update", 7)).rejects.toThrow("Permission Denied");
	});

	it("uses current roles and capabilities for every new request", async () => {
		state.users[0].roles = ["admin"];
		await expect(new Access("admin").can("users:password", 8)).resolves.toBeTruthy();
		state.users[0].roles = [];
		await expect(new Access("former-admin").can("users:password", 8)).rejects.toThrow("Permission Denied");
		state.users[0].permissions.proxy_hosts = "hidden";
		await expect(new Access("hidden").can("proxy_hosts:list")).rejects.toThrow("Permission Denied");
	});

	it.each(["is_disabled", "is_deleted"])("rejects a current %s account before permissions", async (field) => {
		state.users[0][field] = 1;
		await expect(new Access("unavailable").load()).rejects.toThrow("User cannot be loaded");
	});

	it("rejects pending second-factor scopes", async () => {
		state.payload.scope = ["2fa_pending"];
		await expect(new Access("pending").load()).rejects.toThrow("Invalid token scope");
	});
});
