import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getHost: vi.fn(), show: vi.fn(), submit: vi.fn() }));
vi.mock("ez-modal-react", () => ({ default: { create: <T,>(component: T) => component, show: mocks.show } }));
vi.mock("src/api/backend", () => ({
	getProxyHost: mocks.getHost,
	getDeadHost: mocks.getHost,
	getRedirectionHost: mocks.getHost,
	getStream: mocks.getHost,
	createProxyHost: mocks.submit,
	updateProxyHost: mocks.submit,
	createDeadHost: mocks.submit,
	updateDeadHost: mocks.submit,
	createRedirectionHost: mocks.submit,
	updateRedirectionHost: mocks.submit,
	createStream: mocks.submit,
	updateStream: mocks.submit,
}));
vi.mock("src/hooks", async () => ({
	...(await import("src/hooks/useProxyHost")),
	...(await import("src/hooks/useDeadHost")),
	...(await import("src/hooks/useRedirectionHost")),
	...(await import("src/hooks/useStream")),
	useUser: () => ({ data: { id: 1 }, isLoading: false }),
}));
vi.mock("src/components", async () => {
	const { Field } = await import("formik");
	return {
		HasPermission: ({ children }: PropsWithChildren) => children,
		Loading: () => <div>Host loading</div>,
		NoteWarning: () => null,
		DomainNamesField: () => <Field aria-label="host note" name="note" />,
		SSLCertificateField: () => null,
		SSLOptionsFields: () => null,
	};
});
vi.mock("src/components/Form/NginxConfigField", () => ({ NginxConfigField: () => null }));
vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => children,
	DialogFooter: ({ children }: PropsWithChildren) => children,
	DialogHeader: ({ children }: PropsWithChildren) => children,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));
vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({ children }: PropsWithChildren) => children,
	TabsContent: ({ children }: PropsWithChildren) => children,
	TabsList: ({ children }: PropsWithChildren) => children,
	TabsTrigger: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("src/modals/ProxyHostFormTabs", async () => {
	const { Field } = await import("formik");
	return { default: () => <Field aria-label="forward host" name="forwardHost" /> };
});
vi.mock("src/modals/ProxyHostConfigPreview", () => ({ default: () => null }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));

import { showDeadHostModal } from "./DeadHostModal";
import { showProxyHostModal } from "./ProxyHostModal";
import { showRedirectionHostModal } from "./RedirectionHostModal";
import { showStreamModal } from "./StreamModal";

const cases = [
	{ key: "proxy-host", open: showProxyHostModal, field: "forwardHost", label: "forward host" },
	{ key: "dead-host", open: showDeadHostModal, field: "note", label: "host note" },
	{
		key: "redirection-host",
		open: showRedirectionHostModal,
		field: "forwardDomainName",
		label: "redirection-host.forward-domain",
	},
	{ key: "stream", open: showStreamModal, field: "forwardingHost", label: "forwardingHost" },
];
const host = {
	id: 7,
	domainNames: ["host.example"],
	forwardHost: "cached.example",
	forwardDomainName: "cached.example",
	forwardScheme: "http",
	forwardingHost: "cached.example",
	incomingPort: 8443,
	forwardingPort: 443,
	note: "cached.example",
	meta: {},
};
function deferred() {
	let resolve!: (value: typeof host) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<typeof host>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
function mountModal(testCase: (typeof cases)[number], cacheAge = 120_000) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	client.setQueryData([testCase.key, 7], host, { updatedAt: Date.now() - cacheAge });
	testCase.open(7);
	const Modal = mocks.show.mock.calls[0][0];
	const view = render(
		<QueryClientProvider client={client}>
			<Modal id={7} visible remove={vi.fn()} />
		</QueryClientProvider>,
	);
	return { client, view };
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.submit.mockResolvedValue(host);
});
afterEach(cleanup);

it.each(cases.flatMap((testCase) => [0, 120_000].map((cacheAge) => ({ ...testCase, cacheAge }))))(
	"uses the opening fetch rather than cached $key fields when saving (cache age $cacheAge)",
	async (testCase) => {
		const pending = deferred();
		mocks.getHost.mockReturnValue(pending.promise);
		mountModal(testCase, testCase.cacheAge);
		await waitFor(() => expect(mocks.getHost).toHaveBeenCalled());
		expect(screen.queryByLabelText(testCase.label)).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
		await act(async () => pending.resolve({ ...host, [testCase.field]: "current.example" }));
		expect(await screen.findByLabelText(testCase.label)).toHaveValue("current.example");
		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
		expect(mocks.submit.mock.calls[0][0][testCase.field]).toBe("current.example");
	},
);

it.each(cases)("preserves an edited $key draft through a later cache update", async (testCase) => {
	mocks.getHost.mockResolvedValue({ ...host, [testCase.field]: "current.example" });
	const { client } = mountModal(testCase);
	const input = await screen.findByLabelText(testCase.label);
	await waitFor(() => expect(input).toHaveValue("current.example"));
	fireEvent.change(input, { target: { value: "draft.example" } });
	act(() => client.setQueryData([testCase.key, 7], { ...host, [testCase.field]: "later.example" }));
	expect(input).toHaveValue("draft.example");
	mocks.getHost.mockRejectedValue(new Error("Background refresh failed"));
	await act(async () => client.refetchQueries({ queryKey: [testCase.key, 7] }));
	expect(screen.getByLabelText(testCase.label)).toHaveValue("draft.example");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
	expect(mocks.submit.mock.calls[0][0][testCase.field]).toBe("draft.example");
});

it.each(cases)("keeps $key creation available without fetching an existing host", async (testCase) => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	testCase.open("new");
	const Modal = mocks.show.mock.calls[0][0];
	render(
		<QueryClientProvider client={client}>
			<Modal id="new" visible remove={vi.fn()} />
		</QueryClientProvider>,
	);
	const input = await screen.findByLabelText(testCase.label);
	fireEvent.change(input, { target: { value: "created.example" } });
	if (testCase.key === "stream") {
		fireEvent.change(screen.getByLabelText("incomingPort"), { target: { value: "8443" } });
		fireEvent.change(screen.getByLabelText("forwardingPort"), { target: { value: "443" } });
	}
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
	expect(mocks.submit.mock.calls[0][0]).toMatchObject({ [testCase.field]: "created.example" });
	expect(mocks.submit.mock.calls[0][0].id).toBeUndefined();
	expect(mocks.getHost).not.toHaveBeenCalled();
});

it.each(cases)("does not submit cached $key fields after the opening fetch fails", async (testCase) => {
	const pending = deferred();
	mocks.getHost.mockReturnValue(pending.promise);
	const { client } = mountModal(testCase);
	await waitFor(() => expect(mocks.getHost).toHaveBeenCalled());
	await act(async () => pending.reject(new Error("Host could not be loaded")));
	expect(await screen.findByText("Host could not be loaded")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	expect(mocks.submit).not.toHaveBeenCalled();
	mocks.getHost.mockResolvedValue({ ...host, [testCase.field]: "recovered.example" });
	await act(async () => client.refetchQueries({ queryKey: [testCase.key, 7] }));
	expect(await screen.findByLabelText(testCase.label)).toHaveValue("recovered.example");
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
	expect(mocks.submit.mock.calls[0][0][testCase.field]).toBe("recovered.example");
});
