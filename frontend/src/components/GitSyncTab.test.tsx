import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GitSyncTab } from "./GitSyncTab";

const mocks = vi.hoisted(() => ({ trigger: vi.fn(), showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock("src/notifications", () => ({ showError: mocks.showError, showSuccess: mocks.showSuccess }));
vi.mock("src/hooks/useGitSync", () => ({
	useGitSyncStatus: () => ({ data: {}, isLoading: false }),
	useTriggerGitSync: () => ({ mutate: mocks.trigger, isPending: false }),
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
afterEach(cleanup);
beforeEach(() => vi.clearAllMocks());
it("starts a sync without submitting unsaved proxy-host edits", async () => {
	const save = vi.fn();
	render(
		<Formik
			initialValues={{
				gitRepoUrl: "https://example.test/repo",
				gitBranch: "main",
				gitCredentials: "",
				gitSyncEnabled: false,
			}}
			onSubmit={save}
		>
			<Form>
				<GitSyncTab hostId={7} />
			</Form>
		</Formik>,
	);
	fireEvent.click(screen.getByRole("button", { name: "proxy-host.git-sync.sync-now" }));
	await waitFor(() => expect(mocks.trigger).toHaveBeenCalled());
	expect(save).not.toHaveBeenCalled();
});

it.each([false, true])("requires a repository only when automatic sync is enabled: %s", async (enabled) => {
	const save = vi.fn();
	render(
		<Formik
			initialValues={{ gitRepoUrl: "", gitBranch: "main", gitCredentials: "", gitSyncEnabled: enabled }}
			onSubmit={save}
		>
			<Form>
				<GitSyncTab hostId={null} />
				<button type="submit">Save host</button>
			</Form>
		</Formik>,
	);
	fireEvent.click(screen.getByRole("button", { name: "Save host" }));
	if (enabled) {
		expect(await screen.findByText("error.required")).toBeInTheDocument();
		expect(save).not.toHaveBeenCalled();
	} else {
		await waitFor(() => expect(save).toHaveBeenCalledOnce());
	}
});

it.each(["success", "failure", "network"])("reports the actual outcome of a manual sync: %s", async (outcome) => {
	mocks.trigger.mockImplementation((_id, callbacks) => {
		if (outcome === "network") callbacks.onError(new Error("Connection failed"));
		else callbacks.onSuccess({ success: outcome === "success", message: "Repository failed" });
	});
	render(
		<Formik initialValues={{ gitRepoUrl: "", gitSyncEnabled: false }} onSubmit={vi.fn()}>
			<Form>
				<GitSyncTab hostId={7} />
			</Form>
		</Formik>,
	);
	fireEvent.click(screen.getByRole("button", { name: "proxy-host.git-sync.sync-now" }));
	if (outcome === "success") {
		expect(mocks.showSuccess).toHaveBeenCalledWith("proxy-host.git-sync.success");
		expect(mocks.showError).not.toHaveBeenCalled();
	} else {
		expect(mocks.showError).toHaveBeenCalledWith(outcome === "network" ? "Connection failed" : "Repository failed");
		expect(mocks.showSuccess).not.toHaveBeenCalled();
	}
});
