import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getData: vi.fn(), show: vi.fn(), submit: vi.fn() }));
vi.mock("ez-modal-react", () => ({ default: { create: <T,>(component: T) => component, show: mocks.show } }));
vi.mock("src/api/backend", () => ({
	getAccessList: mocks.getData,
	createAccessList: mocks.submit,
	updateAccessList: mocks.submit,
	getUser: (id: number | string) => (id === "me" ? Promise.resolve({ id: 1 }) : mocks.getData()),
	createUser: mocks.submit,
	updateUser: mocks.submit,
	uploadUserAvatar: vi.fn(),
	createDdnsProvider: mocks.submit,
	updateDdnsProvider: (_id: number, data: unknown) => mocks.submit(data),
	testDdnsProvider: vi.fn(),
}));
vi.mock("src/api/backend/getDdnsProviders", () => ({ getDdnsProviders: mocks.getData }));
vi.mock("src/hooks", async () => ({
	...(await import("src/hooks/useAccessList")),
	...(await import("src/hooks/useUser")),
	useHealth: () => ({ data: { demo: false } }),
}));
vi.mock("src/components", () => ({ Loading: () => <div>Form loading</div> }));
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
vi.mock("src/modals/AccessListFormTabs", async () => {
	const { Field, useFormikContext } = await import("formik");
	return {
		default: () => {
			const { setFieldValue } = useFormikContext();
			return (
				<>
					<Field aria-label="access name" name="name" />
					<button
						type="button"
						onClick={() => setFieldValue("clients", [{ address: "1.2.3.4", directive: "allow" }])}
					>
						Add client
					</button>
				</>
			);
		},
	};
});
vi.mock("src/modals/UserDetailsTab", async () => {
	const { Field } = await import("formik");
	return { default: () => <Field aria-label="user email" name="email" /> };
});
vi.mock("src/modals/UserAvatarTab", () => ({ default: () => null }));
vi.mock("src/pages/Profile/Security", () => ({ default: () => null }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));

import { showAccessListModal } from "./AccessListModal";
import { showDdnsProviderModal } from "./DdnsProviderModal";
import { showUserModal } from "./UserModal";

const access = {
	id: 7,
	name: "Cached access",
	clients: [{ address: "1.2.3.4", directive: "allow" }],
	items: [],
	meta: {},
};
const user = { id: 7, name: "User", nickname: "user", email: "cached@example.test", roles: [], avatarType: "gravatar" };
const ddns = {
	id: 7,
	name: "Provider",
	provider: "cloudflare",
	domains: ["home.example.test"],
	ipVer: "v4",
	config: { token: "cached-token", zoneId: "zone" },
};
const cases = [
	{
		name: "access",
		key: ["access-list", 7, ["items", "clients"]],
		open: showAccessListModal,
		cached: access,
		fresh: { ...access, name: "Fresh access" },
		label: "access name",
		value: "Fresh access",
		draft: "Draft access",
		payload: { name: "Fresh access" },
		draftPayload: { name: "Draft access" },
	},
	{
		name: "user",
		key: ["user", 7],
		open: showUserModal,
		cached: user,
		fresh: { ...user, email: "fresh@example.test" },
		label: "user email",
		value: "fresh@example.test",
		draft: "draft@example.test",
		payload: { email: "fresh@example.test" },
		draftPayload: { email: "draft@example.test" },
	},
	{
		name: "ddns",
		key: ["ddns-providers"],
		open: showDdnsProviderModal,
		cached: [ddns],
		fresh: [{ ...ddns, config: { ...ddns.config, token: "fresh-token" } }],
		label: "ddns-providers.cloudfare_token",
		value: "fresh-token",
		draft: "draft-token",
		payload: { config: { token: "fresh-token" } },
		draftPayload: { config: { token: "draft-token" } },
	},
];
function deferred() {
	let resolve!: (value: unknown) => void;
	let reject!: (error: Error) => void;
	const promise = new Promise<unknown>((yes, no) => {
		resolve = yes;
		reject = no;
	});
	return { promise, resolve, reject };
}
const clients: QueryClient[] = [];
function mount(testCase: (typeof cases)[number], isNew = false) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	// Even a fresh list/detail cache must be checked before opening an edit form.
	if (isNew) {
		if (testCase.name === "access") showAccessListModal("new");
		else if (testCase.name === "user") showUserModal("new");
		else showDdnsProviderModal();
	} else {
		client.setQueryData(testCase.key, testCase.cached);
		testCase.open(7);
	}
	const [Modal, props] = mocks.show.mock.calls[0];
	render(
		<QueryClientProvider client={client}>
			<Modal {...props} visible remove={vi.fn()} />
		</QueryClientProvider>,
	);
	return client;
}
beforeEach(() => {
	vi.clearAllMocks();
	mocks.submit.mockResolvedValue({ id: 7 });
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

it.each(cases)("waits for opening data and saves current pristine $name fields", async (testCase) => {
	const pending = deferred();
	mocks.getData.mockReturnValue(pending.promise);
	mount(testCase);
	await waitFor(() => expect(mocks.getData).toHaveBeenCalled());
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	await act(async () => pending.resolve(testCase.fresh));
	expect(await screen.findByLabelText(testCase.label)).toHaveValue(testCase.value);
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
	expect(mocks.submit.mock.calls[0][0]).toMatchObject(testCase.payload);
});

it.each(cases)("preserves dirty $name fields through later data and refetch errors", async (testCase) => {
	mocks.getData.mockResolvedValue(testCase.fresh);
	const client = mount(testCase);
	const input = await screen.findByLabelText(testCase.label);
	expect(input).toHaveValue(testCase.value);
	fireEvent.change(input, { target: { value: testCase.draft } });
	act(() => client.setQueryData(testCase.key, testCase.cached));
	mocks.getData.mockRejectedValue(new Error("Background fetch failed"));
	await act(async () => {
		await client.refetchQueries({ queryKey: testCase.key });
	});
	expect(input).toHaveValue(testCase.draft);
	expect(screen.getByRole("button", { name: "save" })).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
	expect(mocks.submit.mock.calls[0][0]).toMatchObject(testCase.draftPayload);
});

it.each(cases)("does not offer cached $name saves after opening failure", async (testCase) => {
	const pending = deferred();
	mocks.getData.mockReturnValue(pending.promise);
	mount(testCase);
	await waitFor(() => expect(mocks.getData).toHaveBeenCalled());
	await act(async () => pending.reject(new Error("Opening fetch failed")));
	expect(await screen.findByText("Opening fetch failed")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
	expect(mocks.submit).not.toHaveBeenCalled();
});

it.each(cases)("keeps the new $name form and creates without fetching an existing record", async (testCase) => {
	mount(testCase, true);
	const input = await screen.findByLabelText(testCase.label);
	fireEvent.change(input, { target: { value: testCase.draft } });
	if (testCase.name === "access") fireEvent.click(screen.getByRole("button", { name: "Add client" }));
	if (testCase.name === "ddns") {
		fireEvent.change(screen.getByLabelText("column.name"), { target: { value: "New provider" } });
		fireEvent.change(screen.getByLabelText("ddns-providers.domains"), { target: { value: "home.example.test" } });
	}
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(mocks.submit).toHaveBeenCalled());
	expect(mocks.submit.mock.calls[0][0].id).toBeUndefined();
	expect(mocks.submit.mock.calls[0][0]).toMatchObject(testCase.draftPayload);
	expect(mocks.getData).not.toHaveBeenCalled();
});
