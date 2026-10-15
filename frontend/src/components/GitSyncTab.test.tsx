import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Field, Form, Formik, useFormikContext } from "formik";
import { ProxyHostGitSyncFeedback } from "src/modals/ProxyHostGitSyncFeedback";
import type { ProxyHostFormValues } from "src/modals/ProxyHostModalFormValues";
import { createProxyHostPayload } from "src/modals/ProxyHostModalSubmission";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GitSyncTab } from "./GitSyncTab";

const mocks = vi.hoisted(() => ({ trigger: vi.fn(), showError: vi.fn(), showSuccess: vi.fn() }));
vi.mock("src/notifications", () => ({ showError: mocks.showError, showSuccess: mocks.showSuccess }));
vi.mock("src/hooks/useGitSync", () => ({
	useGitSyncStatus: () => ({ data: {}, isLoading: false }),
	useTriggerGitSync: () => ({ mutateAsync: mocks.trigger, isPending: false }),
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
afterEach(cleanup);
beforeEach(() => {
	vi.resetAllMocks();
	mocks.trigger.mockResolvedValue({ success: true });
});
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
	mocks.trigger.mockImplementation(async () => {
		if (outcome === "network") throw new Error("Connection failed");
		return { success: outcome === "success", message: "Repository failed" };
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
		await waitFor(() => expect(mocks.showSuccess).toHaveBeenCalledWith("proxy-host.git-sync.success"));
		expect(mocks.showError).not.toHaveBeenCalled();
	} else {
		await waitFor(() =>
			expect(mocks.showError).toHaveBeenCalledWith(
				outcome === "network" ? "Connection failed" : "Repository failed",
			),
		);
		expect(mocks.showSuccess).not.toHaveBeenCalled();
	}
});

function DraftProbe() {
	const { values } = useFormikContext<ProxyHostFormValues>();
	return <output data-testid="draft">{JSON.stringify(createProxyHostPayload({ id: 7, values }))}</output>;
}
it.each([false, true])(
	"reconciles its own delayed sync without discarding unrelated edits; concurrent root edit: %s",
	async (changeRoot) => {
		let finish!: (result: { success: boolean; forwardHost: string; forwardScheme: string }) => void;
		mocks.trigger.mockReturnValue(
			new Promise((resolve) => {
				finish = resolve;
			}),
		);
		render(
			<Formik
				initialValues={{
					forwardScheme: "path",
					forwardHost: "/old",
					note: "saved",
					gitRepoUrl: "https://example.test/repo",
				}}
				onSubmit={vi.fn()}
			>
				<Form>
					<GitSyncTab hostId={7} />
					<ProxyHostGitSyncFeedback />
					<Field name="forwardHost" aria-label="Root" />
					<Field name="note" aria-label="Note" />
					<DraftProbe />
				</Form>
			</Formik>,
		);
		fireEvent.click(screen.getByRole("button", { name: "proxy-host.git-sync.sync-now" }));
		fireEvent.change(screen.getByLabelText("Note"), { target: { value: "unsaved note" } });
		if (changeRoot) fireEvent.change(screen.getByLabelText("Root"), { target: { value: "/my-new-root" } });
		finish({ success: true, forwardHost: "/data/websites/host-7", forwardScheme: "path" });
		await waitFor(() => expect(mocks.showSuccess).toHaveBeenCalled());
		if (changeRoot) {
			expect(screen.getByLabelText("Root")).toHaveValue("/my-new-root");
			expect(screen.getByText("proxy-host.git-sync.root-conflict")).toBeInTheDocument();
			fireEvent.click(screen.getByRole("button", { name: "proxy-host.git-sync.use-synced-root" }));
		}
		await waitFor(() => expect(screen.getByLabelText("Root")).toHaveValue("/data/websites/host-7"));
		expect(screen.getByLabelText("Note")).toHaveValue("unsaved note");
		expect(screen.getByTestId("draft")).not.toHaveTextContent("gitSyncConflict");
		expect(screen.getByTestId("draft")).not.toHaveTextContent("gitSyncedRoot");
		expect(screen.getByTestId("draft")).not.toHaveTextContent("gitSyncPending");
		expect(screen.getByTestId("draft")).toHaveTextContent('"forwardHost":"/data/websites/host-7"');
	},
);
