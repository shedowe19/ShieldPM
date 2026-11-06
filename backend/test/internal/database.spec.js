import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	demo: false,
	status: vi.fn(),
	test: vi.fn(),
	request: vi.fn(),
}));
vi.mock("../../lib/config.js", () => ({ isDemoMode: () => state.demo }));
vi.mock("../../lib/database-switch.js", () => ({
	databaseStatus: state.status,
	testDatabase: state.test,
	requestDatabaseOperation: state.request,
}));

import database from "../../internal/database.js";

beforeEach(() => {
	vi.clearAllMocks();
	state.demo = false;
});
const permitted = () => ({ can: vi.fn().mockResolvedValue(true) });
const target = {
	engine: "pg",
	host: "database.invalid",
	user: "fixture",
	name: "fixture",
	password: "private-fixture-value",
};
const confirmed = () => ({ target, confirm: true, confirmExclusive: true });

it.each(["get", "test", "switch"])(
	"requires existing settings permission before %s accesses connection state",
	async (action) => {
		const access = { can: vi.fn().mockRejectedValue(new Error("Permission denied")) };
		await expect(database[action](access, confirmed())).rejects.toThrow("Permission denied");
		expect(access.can).toHaveBeenCalledWith("settings:update");
		expect(state.status).not.toHaveBeenCalled();
		expect(state.test).not.toHaveBeenCalled();
		expect(state.request).not.toHaveBeenCalled();
	},
);

it("blocks database probes and switches in demo mode", async () => {
	state.demo = true;
	await expect(database.test(permitted(), target)).rejects.toThrow("disabled in demo mode");
	await expect(database.switch(permitted(), confirmed())).rejects.toThrow("disabled in demo mode");
	expect(state.test).not.toHaveBeenCalled();
	expect(state.request).not.toHaveBeenCalled();
});

it("requires both migration and exclusive-writer confirmations before recording intent", async () => {
	for (const input of [
		{ target, confirm: true },
		{ target, confirmExclusive: true },
	])
		await expect(database.switch(permitted(), input)).rejects.toThrow(
			"Confirm the migration and exclusive ownership",
		);
	expect(state.request).not.toHaveBeenCalled();
	state.request.mockReturnValue({ id: "operation", state: "requested" });
	await expect(database.switch(permitted(), confirmed())).resolves.toEqual({ id: "operation", state: "requested" });
	expect(state.request).toHaveBeenCalledWith(target);
});

it("does not expose credentials or SQL-driver errors from connection testing", async () => {
	state.test.mockRejectedValue(new Error(`Driver SQL contains ${target.password}`));
	try {
		await database.test(permitted(), target);
		throw new Error("expected rejection");
	} catch (error) {
		expect(error.message).toContain("Cannot use the target database");
		expect(error.message).not.toContain(target.password);
	}
});

it("does not expose private request failures through the settings API", async () => {
	state.request.mockImplementation(() => {
		throw new Error(`Private source ${target.password}`);
	});
	await expect(database.switch(permitted(), confirmed())).rejects.toThrow("Cannot start database migration");
});
