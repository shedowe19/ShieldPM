import { cleanup, render, screen } from "@testing-library/react";
import type { ComponentType } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	useDdnsProviders: vi.fn(),
	useDeadHosts: vi.fn(),
	useProxyHosts: vi.fn(),
	useQueryClient: vi.fn(),
	useRedirectionHosts: vi.fn(),
	useStreams: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
	useQuery: mocks.useDdnsProviders,
	useQueryClient: mocks.useQueryClient,
}));

vi.mock("src/api/backend", () => ({
	deleteDdnsProvider: vi.fn(),
	deleteDeadHost: vi.fn(),
	deleteProxyHost: vi.fn(),
	deleteRedirectionHost: vi.fn(),
	deleteStream: vi.fn(),
	getDdnsProviders: vi.fn(),
	toggleDeadHost: vi.fn(),
	toggleProxyHost: vi.fn(),
	toggleRedirectionHost: vi.fn(),
	toggleStream: vi.fn(),
}));

vi.mock("src/components", () => ({
	HasPermission: () => null,
	LoadingPage: () => null,
}));

vi.mock("src/components/HasPermission", () => ({
	HasPermission: () => null,
}));

vi.mock("src/hooks", () => ({
	useDeadHosts: mocks.useDeadHosts,
	useProxyHosts: mocks.useProxyHosts,
	useRedirectionHosts: mocks.useRedirectionHosts,
	useStreams: mocks.useStreams,
}));

vi.mock("src/notifications", () => ({
	showObjectSuccess: vi.fn(),
}));

vi.mock("./DdnsProviders/lazy", () => ({
	showDdnsProviderModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
}));
vi.mock("./DeadHosts/lazy", () => ({
	showDeadHostModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
}));
vi.mock("./ProxyHosts/lazy", () => ({
	showAccessListModal: vi.fn(),
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
	showProxyHostModal: vi.fn(),
}));
vi.mock("./RedirectionHosts/lazy", () => ({
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
	showRedirectionHostModal: vi.fn(),
}));
vi.mock("./Streams/lazy", () => ({
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
	showStreamModal: vi.fn(),
}));

vi.mock("./DdnsProviders/Table", () => ({ default: () => null }));
vi.mock("./DeadHosts/Table", () => ({ default: () => null }));
vi.mock("./ProxyHosts/Table", () => ({ default: () => null }));
vi.mock("./RedirectionHosts/Table", () => ({ default: () => null }));
vi.mock("./Streams/Table", () => ({ default: () => null }));

const tableWrappers: Array<[string, () => Promise<{ default: ComponentType }>]> = [
	["DDNS", () => import("./DdnsProviders/TableWrapper")],
	["Dead Hosts", () => import("./DeadHosts/TableWrapper")],
	["Proxy Hosts", () => import("./ProxyHosts/TableWrapper")],
	["Redirection Hosts", () => import("./RedirectionHosts/TableWrapper")],
	["Streams", () => import("./Streams/TableWrapper")],
];

describe("Nginx table help controls", () => {
	beforeEach(async () => {
		const queryResult = { data: [], isError: false, isFetching: false, isLoading: false };
		mocks.useDdnsProviders.mockReturnValue(queryResult);
		mocks.useDeadHosts.mockReturnValue(queryResult);
		mocks.useProxyHosts.mockReturnValue(queryResult);
		mocks.useRedirectionHosts.mockReturnValue(queryResult);
		mocks.useStreams.mockReturnValue(queryResult);
		mocks.useQueryClient.mockReturnValue({ invalidateQueries: vi.fn() });
		await changeLocale("de");
	});

	afterEach(async () => {
		cleanup();
		vi.clearAllMocks();
		await changeLocale("en");
	});

	it.each(tableWrappers)("gives the %s help control a localized accessible name", async (_name, loadTableWrapper) => {
		const { default: TableWrapper } = await loadTableWrapper();

		render(<TableWrapper />);

		const helpButton = screen.getByRole("button", { name: "Hilfe" });
		expect(helpButton).toHaveAttribute("aria-label", "Hilfe");
	});
});
