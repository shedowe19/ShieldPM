import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Form, Formik } from "formik";
import { afterEach, expect, it, vi } from "vitest";
import { GitSyncTab } from "./GitSyncTab";

const mocks = vi.hoisted(() => ({ trigger: vi.fn() }));
vi.mock("src/hooks/useGitSync", () => ({
	useGitSyncStatus: () => ({ data: {}, isLoading: false }),
	useTriggerGitSync: () => ({ mutate: mocks.trigger, isPending: false }),
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
afterEach(cleanup);
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
