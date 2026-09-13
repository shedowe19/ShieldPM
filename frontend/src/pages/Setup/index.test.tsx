import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Setup from ".";

const mocks = vi.hoisted(() => ({ createUser: vi.fn(), login: vi.fn() }));
vi.mock("src/api/backend", () => ({ createUser: mocks.createUser }));
vi.mock("src/context", () => ({ useAuthState: () => ({ login: mocks.login }) }));
vi.mock("src/components/LocalePicker", () => ({ LocalePicker: () => null }));
vi.mock("src/components/ThemeSwitcher", () => ({ ThemeSwitcher: () => null }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));

let client: QueryClient;
beforeEach(() => {
	vi.clearAllMocks();
	client = new QueryClient();
	mocks.createUser.mockResolvedValue({ id: 1, email: "admin@example.test" });
	mocks.login.mockResolvedValue(undefined);
});
afterEach(() => {
	cleanup();
	client.clear();
});

function fillSetup(password: string) {
	const view = render(
		<QueryClientProvider client={client}>
			<Setup />
		</QueryClientProvider>,
	);
	fireEvent.change(screen.getByLabelText("user.full-name"), { target: { value: "Admin User" } });
	fireEvent.change(screen.getByLabelText("email-address"), { target: { value: "admin@example.test" } });
	fireEvent.change(screen.getByLabelText("user.new-password"), { target: { value: password } });
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	return view;
}

describe("Setup", () => {
	it("rejects passwords above the user creation API's character limit before sending", async () => {
		fillSetup("p".repeat(73));
		expect(await screen.findByText("error.max-character-length")).toBeInTheDocument();
		expect(mocks.createUser).not.toHaveBeenCalled();
	});
	it("accepts a password at the API character limit", async () => {
		fillSetup("p".repeat(72));
		await waitFor(() => expect(mocks.login).toHaveBeenCalledWith("admin@example.test", "p".repeat(72)));
		expect(mocks.createUser).toHaveBeenCalledWith(
			expect.objectContaining({ auth: { type: "password", secret: "p".repeat(72) } }),
			true,
		);
	});
	it("refreshes setup status after creation even if automatic login fails", async () => {
		mocks.login.mockRejectedValue(new Error("Login temporarily unavailable"));
		const refetch = vi.spyOn(client, "refetchQueries");
		fillSetup("valid-password");
		await waitFor(() => expect(refetch).toHaveBeenCalledWith({ queryKey: ["health"] }));
		expect(mocks.createUser).toHaveBeenCalledTimes(1);
	});
	it("does not start an automatic login after leaving setup while user creation is pending", async () => {
		let finishCreation!: (user: { id: number; email: string }) => void;
		mocks.createUser.mockReturnValue(
			new Promise((resolve) => {
				finishCreation = resolve;
			}),
		);
		const refetch = vi.spyOn(client, "refetchQueries");
		const view = fillSetup("valid-password");
		await waitFor(() => expect(mocks.createUser).toHaveBeenCalledTimes(1));
		view.unmount();
		await act(async () => {
			finishCreation({ id: 1, email: "admin@example.test" });
		});
		expect(mocks.login).not.toHaveBeenCalled();
		expect(refetch).toHaveBeenCalledWith({ queryKey: ["health"] });
	});
});
