import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
	clearDatabaseOperation,
	databaseOperationSnapshot,
	startDatabaseOperation,
} from "src/modules/DatabaseOperationStore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DatabaseOperationView from "./DatabaseOperationView";

const api = vi.hoisted(() => ({
	getDatabaseOperation: vi.fn(),
	getDatabase: vi.fn(),
	acknowledgeDatabaseFailure: vi.fn(),
	testDatabase: vi.fn(),
	setupDatabase: vi.fn(),
	switchDatabase: vi.fn(),
}));
const health = vi.hoisted(() => ({
	data: { status: "MAINTENANCE", setup: false, databaseMaintenance: true, databaseSetupRequired: false },
	isError: false,
	refetch: vi.fn(),
}));
vi.mock("src/api/backend/database", () => api);
vi.mock("src/hooks/useHealth", () => ({ useHealth: () => health }));
vi.mock("src/hooks/usePollingEnvironment", () => ({
	usePollingEnvironment: () => ({ isOnline: true, isDocumentVisible: true }),
}));
const request = {
	id: "fixture-operation",
	state: "requested" as const,
	phase: "requested",
	operationToken: "synthetic-operation-capability",
};
let client: QueryClient;
beforeEach(() => {
	clearDatabaseOperation();
	for (const action of Object.values(api)) action.mockReset();
	health.data = { status: "MAINTENANCE", setup: false, databaseMaintenance: true, databaseSetupRequired: false };
	health.isError = false;
	health.refetch.mockReset().mockResolvedValue({});
	client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});
afterEach(() => {
	cleanup();
	client.clear();
	clearDatabaseOperation();
});
const view = () => (
	<QueryClientProvider client={client}>
		<DatabaseOperationView />
	</QueryClientProvider>
);

describe("database maintenance progress", () => {
	it("waits for healthy startup after verified activation and clears the capability before continuing", async () => {
		startDatabaseOperation(request, "switch", "pg");
		api.getDatabaseOperation.mockResolvedValue({
			id: request.id,
			state: "completed",
			phase: "completed",
			canCancel: false,
		});
		const rendered = render(view());
		await screen.findByText("Data activation was confirmed. Waiting for ShieldPM to finish restarting.");
		expect(screen.getByRole("button", { name: "Continue to ShieldPM" })).toBeDisabled();
		expect(sessionStorage.getItem("shieldpm.database.operation")).toBeNull();
		health.data = { status: "OK", setup: true, databaseMaintenance: false, databaseSetupRequired: false };
		rendered.rerender(view());
		expect(
			screen.getByText("The destination database is active and verified. ShieldPM is ready."),
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Continue to ShieldPM" }));
		expect(databaseOperationSnapshot()).toBeNull();
	});
	it("treats an interrupted restart connection as unknown rather than failed or successful", async () => {
		startDatabaseOperation(request, "switch", "mysql2");
		api.getDatabaseOperation.mockRejectedValue(new Error("connection unavailable"));
		render(view());
		await screen.findByText(/Restart interruptions are expected/);
		expect(screen.queryByText(/database operation failed/)).not.toBeInTheDocument();
		expect(screen.queryByText(/destination database is active and verified/)).not.toBeInTheDocument();
		expect(databaseOperationSnapshot()?.token).toBe(request.operationToken);
		expect(
			JSON.stringify(
				client
					.getQueryCache()
					.getAll()
					.map((query) => query.queryKey),
			),
		).not.toContain(request.operationToken);
	});
	it("allows acknowledged preactivation setup failure to return to the database chooser", async () => {
		startDatabaseOperation(request, "setup", "pg");
		api.getDatabaseOperation.mockResolvedValue({
			id: request.id,
			state: "failed",
			phase: "preparing",
			canCancel: true,
			error: "Destination must be empty",
		});
		api.acknowledgeDatabaseFailure.mockResolvedValue({ state: "cancelled" });
		health.refetch.mockImplementation(async () => {
			health.data = { status: "OK", setup: false, databaseMaintenance: false, databaseSetupRequired: true };
			return {};
		});
		render(view());
		const recovery = await screen.findByRole("button", { name: "Acknowledge failure and choose a database again" });
		expect(sessionStorage.getItem("shieldpm.database.operation")).not.toBeNull();
		fireEvent.click(recovery);
		await waitFor(() => expect(screen.getByRole("button", { name: "Choose a database again" })).toBeEnabled());
		expect(api.acknowledgeDatabaseFailure).toHaveBeenCalledWith(request.id, request.operationToken);
		expect(sessionStorage.getItem("shieldpm.database.operation")).toBeNull();
	});
	it("never offers recovery acknowledgement for an activation-stage failure without server permission", async () => {
		startDatabaseOperation(request, "switch", "pg");
		api.getDatabaseOperation.mockResolvedValue({
			id: request.id,
			state: "failed",
			phase: "activated",
			canCancel: false,
			error: "Recovery requires operator action",
		});
		render(view());
		await screen.findByText("Recovery requires operator action");
		expect(screen.queryByRole("button", { name: /Acknowledge failure/ })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Continue to ShieldPM" })).toBeDisabled();
	});
	it("clears a stale capability only after fresh normal health and authenticated non-pending database status", async () => {
		startDatabaseOperation(request, "switch", "pg");
		api.getDatabaseOperation.mockRejectedValue(new Error("expired capability"));
		health.data = { status: "OK", setup: true, databaseMaintenance: false, databaseSetupRequired: false };
		health.refetch.mockResolvedValue({ data: health.data, isError: false });
		api.getDatabase.mockResolvedValue({ configured: true, engine: "sqlite", operation: null });
		render(view());
		fireEvent.click(await screen.findByRole("button", { name: "Inspect current database and return" }));
		await waitFor(() => expect(databaseOperationSnapshot()).toBeNull());
		expect(api.getDatabase).toHaveBeenCalledOnce();
		expect(api.acknowledgeDatabaseFailure).not.toHaveBeenCalled();
		expect(screen.queryByText(/destination database is active and verified/)).not.toBeInTheDocument();
	});
	it.each(["pending", "error", "health-changed"])(
		"retains the stale capability when inspection is unconfirmed: %s",
		async (condition) => {
			startDatabaseOperation(request, "switch", "pg");
			api.getDatabaseOperation.mockRejectedValue(new Error("expired capability"));
			health.data = { status: "OK", setup: true, databaseMaintenance: false, databaseSetupRequired: false };
			health.refetch.mockResolvedValue({
				data: condition === "health-changed" ? { ...health.data, databaseMaintenance: true } : health.data,
				isError: false,
			});
			if (condition === "error") api.getDatabase.mockRejectedValue(new Error("Forbidden"));
			else
				api.getDatabase.mockResolvedValue({
					configured: true,
					engine: "sqlite",
					operation: { state: "running" },
				});
			render(view());
			fireEvent.click(await screen.findByRole("button", { name: "Inspect current database and return" }));
			await screen.findByText(/Current database status could not be confirmed/);
			expect(databaseOperationSnapshot()?.token).toBe(request.operationToken);
			if (condition === "health-changed") expect(api.getDatabase).not.toHaveBeenCalled();
		},
	);
	it("does not offer stale monitor exit while the server reports maintenance", async () => {
		startDatabaseOperation(request, "switch", "pg");
		api.getDatabaseOperation.mockRejectedValue(new Error("expired capability"));
		render(view());
		await screen.findByText(/Restart interruptions are expected/);
		expect(screen.queryByRole("button", { name: "Inspect current database and return" })).not.toBeInTheDocument();
		expect(databaseOperationSnapshot()?.token).toBe(request.operationToken);
	});
	it("returns an initialized first installation to account setup without an impossible admin database request", async () => {
		startDatabaseOperation(request, "setup", "pg");
		api.getDatabaseOperation.mockRejectedValue(new Error("expired capability"));
		health.data = { status: "OK", setup: false, databaseMaintenance: false, databaseSetupRequired: false };
		health.refetch.mockResolvedValue({ data: health.data, isError: false });
		render(view());
		fireEvent.click(await screen.findByRole("button", { name: "Inspect current database and return" }));
		await waitFor(() => expect(databaseOperationSnapshot()).toBeNull());
		expect(api.getDatabase).not.toHaveBeenCalled();
	});
});
