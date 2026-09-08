import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import GitOps from "./GitOps";

const mocks = vi.hoisted(() => ({
	useGitOpsConfig: vi.fn(),
	useGitOpsHistory: vi.fn(),
	useGitOps: vi.fn(),
}));

vi.mock("@/hooks/useGitOps", () => mocks);
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));

const config = {
	enabled: true,
	repositoryUrl: "https://example.test/config.git",
	branch: "main",
	authType: "https",
	encryptedCredentials: "[REDACTED]",
	autoPush: false,
	autoPullOnStartup: false,
	lastError: null,
	lastSync: null,
};
const mutations = {
	updateConfig: { mutate: vi.fn(), isPending: false },
	testConnection: { mutate: vi.fn(), isPending: false },
	push: { mutate: vi.fn(), isPending: false },
	pull: { mutate: vi.fn(), isPending: false },
	revert: { mutate: vi.fn(), isPending: false },
	importConfig: { mutate: vi.fn(), isPending: false },
};

beforeEach(() => {
	for (const mutation of Object.values(mutations)) {
		mutation.mutate.mockReset();
		mutation.isPending = false;
	}
	mocks.useGitOpsConfig.mockReturnValue({ data: config, isLoading: false, error: null });
	mocks.useGitOpsHistory.mockReturnValue({
		data: [{ sha: "abcdef123456", message: "Saved config", author: "Admin", date: "2026-09-07T00:00:00Z" }],
	});
	mocks.useGitOps.mockReturnValue(mutations);
});
afterEach(cleanup);

describe("GitOps settings actions", () => {
	it("does not expose editable defaults when the saved configuration cannot be loaded", () => {
		mocks.useGitOpsConfig.mockReturnValue({
			data: undefined,
			isLoading: false,
			error: new Error("Configuration unavailable"),
		});
		render(<GitOps />);
		expect(screen.getByText("Configuration unavailable")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	});

	it("prevents Git operations against the old target while the repository form has unsaved changes", () => {
		render(<GitOps />);
		expect(screen.getByRole("button", { name: "settings.gitops.test_connection" })).toBeEnabled();
		fireEvent.change(screen.getByLabelText("settings.gitops.repository_url"), {
			target: { value: "https://new.example.test/config.git" },
		});
		expect(screen.getByText("settings.gitops.save-before-action")).toBeInTheDocument();
		for (const name of [
			/settings.gitops.test_connection/,
			/settings.gitops.export_push/,
			/settings.gitops.pull_now/,
			/settings.gitops.import/,
			/settings.gitops.revert/,
		]) {
			const button = screen.getByRole("button", { name });
			expect(button).toBeDisabled();
			fireEvent.click(button);
		}
		expect(mutations.testConnection.mutate).not.toHaveBeenCalled();
		expect(mutations.push.mutate).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
	});

	it("disables concurrent operations and settings writes while importing", () => {
		mutations.importConfig.isPending = true;
		render(<GitOps />);
		expect(screen.getByLabelText("settings.gitops.repository_url")).toBeDisabled();
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
		expect(screen.getByRole("button", { name: /settings.gitops.export_push/ })).toBeDisabled();
		expect(screen.getByRole("button", { name: /settings.gitops.import/ })).toBeDisabled();
	});

	it.each([true, false])("closes the import dialog only on success (%s)", (success) => {
		render(<GitOps />);
		fireEvent.click(screen.getByRole("button", { name: /settings.gitops.import/ }));
		fireEvent.click(screen.getByRole("button", { name: "Import" }));
		expect(mutations.importConfig.mutate).toHaveBeenCalledWith(true, expect.any(Object));
		act(() => mutations.importConfig.mutate.mock.calls[0][1].onSuccess({ success }));
		if (success) {
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		} else {
			expect(screen.getByRole("dialog")).toBeInTheDocument();
		}
	});

	it("clears a saved token from the form and omits unchanged credentials on later saves", () => {
		mutations.updateConfig.mutate.mockImplementation((_payload, options) => options.onSuccess(config));
		render(<GitOps />);
		const tokenInput = screen.getByLabelText("Personal Access Token");
		fireEvent.change(tokenInput, { target: { value: "new-test-token" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(mutations.updateConfig.mutate.mock.calls[0][0]).toMatchObject({ credentials: "new-test-token" });
		expect(tokenInput).toHaveValue("");
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(mutations.updateConfig.mutate.mock.calls[1][0]).not.toHaveProperty("credentials");
	});

	it("offers only the token authentication supported by the GitOps backend", () => {
		mocks.useGitOpsConfig.mockReturnValue({ data: { ...config, authType: "ssh" }, isLoading: false });
		render(<GitOps />);
		expect(screen.queryByText("SSH Key")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("SSH Private Key")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		expect(mutations.updateConfig.mutate.mock.calls[0][0]).toMatchObject({ authType: "https" });
	});
});
