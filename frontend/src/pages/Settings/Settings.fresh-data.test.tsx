import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { TextareaHTMLAttributes } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getData: vi.fn(), submit: vi.fn() }));
vi.mock("src/api/backend", () => ({ getSetting: mocks.getData, updateSetting: mocks.submit }));
vi.mock("src/api/backend/gitops", () => ({
	getGitOpsConfig: mocks.getData,
	getGitOpsHistory: async () => [],
	updateGitOpsConfig: mocks.submit,
	testGitOpsConnection: vi.fn(),
	exportGitOpsConfig: vi.fn(),
	pushGitOps: vi.fn(),
	pullGitOps: vi.fn(),
	revertGitOps: vi.fn(),
	importGitOpsConfig: vi.fn(),
}));
vi.mock("src/hooks", async () => await import("src/hooks/useSetting"));
vi.mock("src/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
vi.mock("src/locale", () => ({
	T: ({ id }: { id: string }) => id,
	intl: { formatMessage: ({ id }: { id: string }) => id },
}));
vi.mock("src/components/LazyCodeEditor", () => ({
	LazyCodeEditor: ({ id, name, value, onChange, onBlur }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
		<textarea id={id} name={name} value={value} onChange={onChange} onBlur={onBlur} />
	),
}));

import DefaultSite from "./DefaultSite";
import GitOps from "./GitOps";

const gitOpsConfig = {
	enabled: true,
	repositoryUrl: "https://cached.example/config.git",
	branch: "main",
	authType: "https",
	encryptedCredentials: "[REDACTED]",
	autoPush: false,
	autoPullOnStartup: false,
	lastError: null,
	lastSync: null,
};
const cases = [
	{
		name: "default site",
		Component: DefaultSite,
		key: ["setting", "default-site"],
		label: "settings.default-site.html",
		cached: { id: "default-site", value: "html", meta: { html: "<h1>Cached page</h1>" } },
		fresh: { id: "default-site", value: "html", meta: { html: "<h1>Current page</h1>" } },
		freshValue: "<h1>Current page</h1>",
		draftValue: "<h1>Unsaved page</h1>",
		freshPayload: { meta: { html: "<h1>Current page</h1>" } },
		draftPayload: { meta: { html: "<h1>Unsaved page</h1>" } },
	},
	{
		name: "GitOps",
		Component: GitOps,
		key: ["gitops-config"],
		label: "settings.gitops.repository_url",
		cached: gitOpsConfig,
		fresh: { ...gitOpsConfig, repositoryUrl: "https://current.example/config.git" },
		freshValue: "https://current.example/config.git",
		draftValue: "https://draft.example/config.git",
		freshPayload: { repositoryUrl: "https://current.example/config.git" },
		draftPayload: { repositoryUrl: "https://draft.example/config.git" },
	},
];
const clients: QueryClient[] = [];
function mountSettings(testCase: (typeof cases)[number], cacheAge = 0) {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
	});
	clients.push(client);
	client.setQueryData(testCase.key, testCase.cached, { updatedAt: Date.now() - cacheAge });
	const Component = testCase.Component;
	render(
		<QueryClientProvider client={client}>
			<Component />
		</QueryClientProvider>,
	);
	return client;
}
function deferred() {
	let resolve!: (value: unknown) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<unknown>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
beforeEach(() => {
	vi.resetAllMocks();
	mocks.submit.mockResolvedValue({});
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

it.each(cases.flatMap((testCase) => [0, 120_000].map((cacheAge) => ({ ...testCase, cacheAge }))))(
	"waits for fresh opening $name values before allowing saves (cache age $cacheAge)",
	async (testCase) => {
		const pending = deferred();
		mocks.getData.mockReturnValue(pending.promise);
		mountSettings(testCase, testCase.cacheAge);
		await waitFor(() => expect(mocks.getData).toHaveBeenCalled());
		expect(screen.queryByLabelText(testCase.label)).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
		await act(async () => pending.resolve(testCase.fresh));
		expect(await screen.findByLabelText(testCase.label)).toHaveValue(testCase.freshValue);
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
		expect(mocks.submit.mock.calls[0][0]).toMatchObject(testCase.freshPayload);
	},
);

it.each(cases)("blocks cached $name values after an opening failure and permits recovery", async (testCase) => {
	const pending = deferred();
	mocks.getData.mockReturnValue(pending.promise);
	const client = mountSettings(testCase);
	await waitFor(() => expect(mocks.getData).toHaveBeenCalled());
	await act(async () => pending.reject(new Error("Opening settings failed")));
	expect(await screen.findByText("Opening settings failed")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	expect(mocks.submit).not.toHaveBeenCalled();
	mocks.getData.mockResolvedValue(testCase.fresh);
	await act(async () => client.refetchQueries({ queryKey: testCase.key }));
	expect(await screen.findByLabelText(testCase.label)).toHaveValue(testCase.freshValue);
});

it.each(cases)("preserves an open $name draft across later refetch failure and recovery", async (testCase) => {
	mocks.getData.mockResolvedValue(testCase.fresh);
	const client = mountSettings(testCase);
	const input = await screen.findByLabelText(testCase.label);
	fireEvent.change(input, { target: { value: testCase.draftValue } });
	act(() => client.setQueryData(testCase.key, testCase.cached));
	expect(input).toHaveValue(testCase.draftValue);
	mocks.getData.mockRejectedValue(new Error("Background settings failed"));
	await act(async () => client.refetchQueries({ queryKey: testCase.key }));
	expect(screen.getByLabelText(testCase.label)).toBe(input);
	expect(input).toHaveValue(testCase.draftValue);
	mocks.getData.mockResolvedValue(testCase.fresh);
	await act(async () => client.refetchQueries({ queryKey: testCase.key }));
	expect(input).toHaveValue(testCase.draftValue);
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
	expect(mocks.submit.mock.calls[0][0]).toMatchObject(testCase.draftPayload);
});

it("allows GitOps operations after the edited configuration has been saved and reloaded", async () => {
	const testCase = cases[1];
	mocks.getData.mockResolvedValue(testCase.fresh);
	mocks.submit.mockImplementation(async (payload: object) => {
		const saved = { ...testCase.fresh, ...payload };
		mocks.getData.mockResolvedValue(saved);
		return saved;
	});
	mountSettings(testCase);
	const input = await screen.findByLabelText(testCase.label);
	fireEvent.change(input, { target: { value: testCase.draftValue } });
	expect(screen.getByRole("button", { name: "settings.gitops.test_connection" })).toBeDisabled();
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(screen.getByRole("button", { name: "settings.gitops.test_connection" })).toBeEnabled());
	expect(input).toHaveValue(testCase.draftValue);
	expect(screen.queryByText("settings.gitops.save-before-action")).not.toBeInTheDocument();
});
