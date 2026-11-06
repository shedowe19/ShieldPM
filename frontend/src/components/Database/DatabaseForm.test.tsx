import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import DatabaseSettings from "src/pages/Settings/Database";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseForm } from "./DatabaseForm";

const api = vi.hoisted(() => ({
	testDatabase: vi.fn(),
	setupDatabase: vi.fn(),
	switchDatabase: vi.fn(),
	getDatabase: vi.fn(),
}));
const start = vi.hoisted(() => vi.fn());
vi.mock("src/api/backend/database", () => api);
vi.mock("src/modules/DatabaseOperationStore", () => ({ startDatabaseOperation: start }));
vi.mock("src/components/ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		disabled,
		children,
	}: {
		value: string;
		onValueChange: (value: string) => void;
		disabled?: boolean;
		children: ReactNode;
	}) => (
		<select
			id="database-engine"
			value={value}
			onChange={(event) => onValueChange(event.target.value)}
			disabled={disabled}
		>
			{children}
		</select>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
	SelectContent: ({ children }: { children: ReactNode }) => children,
	SelectItem: ({ value, children }: { value: string; children: ReactNode }) => (
		<option value={value}>{children}</option>
	),
}));
const accepted = {
	id: "database-test-operation",
	state: "requested",
	phase: "requested",
	operationToken: "synthetic-capability-only",
};
beforeEach(() => {
	for (const method of Object.values(api)) method.mockReset();
	start.mockReset();
	api.testDatabase.mockResolvedValue({ ok: true });
	api.setupDatabase.mockResolvedValue(accepted);
	api.switchDatabase.mockResolvedValue(accepted);
});
afterEach(cleanup);
const testConnection = async () => {
	fireEvent.click(screen.getByRole("button", { name: "Test connection" }));
	await screen.findByText(/Connection test succeeded/);
};
const fillServer = () => {
	fireEvent.change(screen.getByLabelText("Database host"), { target: { value: "database.invalid" } });
	fireEvent.change(screen.getByLabelText("Database name"), { target: { value: "empty_target" } });
	fireEvent.change(screen.getByLabelText("Database user"), { target: { value: "fixture" } });
	fireEvent.change(screen.getByLabelText("Database password"), { target: { value: "synthetic-db-password" } });
};

describe("database selection and conversion form", () => {
	it("requires a successful test before choosing SQLite and never claims conversion on acceptance", async () => {
		render(<DatabaseForm kind="setup" engines={["sqlite", "mysql2", "pg"]} />);
		expect(screen.getByRole("combobox")).toHaveValue("sqlite");
		expect(screen.queryByLabelText("Database password")).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Use database and continue" })).toBeDisabled();
		await testConnection();
		fireEvent.click(screen.getByRole("button", { name: "Use database and continue" }));
		await waitFor(() => expect(start).toHaveBeenCalledWith(accepted, "setup", "sqlite"));
		expect(api.setupDatabase).toHaveBeenCalledWith({ engine: "sqlite" });
		expect(screen.queryByText(/destination database is active/)).not.toBeInTheDocument();
	});
	it("requires backup and exclusive-use confirmations, then clears passwords after acceptance", async () => {
		render(<DatabaseForm kind="switch" engines={["mysql2", "pg"]} />);
		fillServer();
		await testConnection();
		const submit = screen.getByRole("button", { name: "Convert database and restart" });
		expect(submit).toBeDisabled();
		fireEvent.click(screen.getByRole("checkbox", { name: /current, verified backup/ }));
		expect(submit).toBeDisabled();
		fireEvent.click(screen.getByRole("checkbox", { name: /stopped all other ShieldPM/ }));
		fireEvent.click(submit);
		await waitFor(() => expect(start).toHaveBeenCalledWith(accepted, "switch", "mysql2"));
		expect(api.switchDatabase).toHaveBeenCalledWith(
			expect.objectContaining({ engine: "mysql2", password: "synthetic-db-password" }),
		);
		expect(screen.getByLabelText("Database password")).toHaveValue("");
	});
	it("invalidates connection verification and agreements when target credentials change", async () => {
		render(<DatabaseForm kind="switch" engines={["pg"]} />);
		fillServer();
		await testConnection();
		fireEvent.click(screen.getByRole("checkbox", { name: /current, verified backup/ }));
		fireEvent.click(screen.getByRole("checkbox", { name: /stopped all other ShieldPM/ }));
		fireEvent.change(screen.getByLabelText("Database host"), { target: { value: "another.invalid" } });
		expect(screen.queryByText(/Connection test succeeded/)).not.toBeInTheDocument();
		expect(screen.getByRole("checkbox", { name: /stopped all other ShieldPM/ })).not.toBeChecked();
		expect(screen.getByRole("button", { name: "Convert database and restart" })).toBeDisabled();
	});
	it("shows target rejection without starting a monitor or asserting success", async () => {
		api.setupDatabase.mockRejectedValue(new Error("Destination must be empty"));
		render(<DatabaseForm kind="setup" engines={["sqlite"]} />);
		await testConnection();
		fireEvent.click(screen.getByRole("button", { name: "Use database and continue" }));
		await screen.findByText("Destination must be empty");
		expect(start).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "Use database and continue" })).toBeDisabled();
	});
	it.each(["mysql2", "pg"])(
		"excludes direct server-to-server conversion from %s even if the API advertises it",
		async (engine) => {
			api.getDatabase.mockResolvedValue({
				engine,
				configured: true,
				editable: true,
				supportedTransitions: ["sqlite", "mysql2", "pg"],
				operation: null,
				connection: null,
				source: "managed",
			});
			const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
			render(
				<QueryClientProvider client={client}>
					<DatabaseSettings />
				</QueryClientProvider>,
			);
			await screen.findByText(/Current database:/);
			expect(screen.getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["sqlite"]);
			expect(
				screen.getByText(/Direct MySQL\/MariaDB ↔ PostgreSQL conversion is not supported/),
			).toBeInTheDocument();
			client.clear();
		},
	);
});
