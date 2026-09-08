import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DeadHosts from "./DeadHosts/TableWrapper";
import ProxyHosts from "./ProxyHosts/TableWrapper";
import RedirectionHosts from "./RedirectionHosts/TableWrapper";
import Streams from "./Streams/TableWrapper";

type TableProps = {
	data: unknown[];
	onDelete: (id: number) => void;
	onDisableToggle: (id: number, enabled: boolean) => Promise<void>;
};
const mocks = vi.hoisted(() => ({
	toggle: vi.fn(),
	remove: vi.fn(),
	error: vi.fn(),
	success: vi.fn(),
	invalidate: vi.fn(),
	confirm: vi.fn(),
	table: null as TableProps | null,
	rows: [
		{
			id: 7,
			domainNames: ["HOST.example"],
			forwardingHost: "HOST.example",
			incomingPort: 80,
			forwardingPort: 8080,
		},
	],
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidate }) }));
vi.mock("src/api/backend", () => ({
	toggleDeadHost: mocks.toggle,
	toggleProxyHost: mocks.toggle,
	toggleRedirectionHost: mocks.toggle,
	toggleStream: mocks.toggle,
	deleteDeadHost: mocks.remove,
	deleteProxyHost: mocks.remove,
	deleteRedirectionHost: mocks.remove,
	deleteStream: mocks.remove,
}));
vi.mock("src/components", () => ({
	HasPermission: ({ children }: PropsWithChildren) => children,
	LoadingPage: () => null,
}));
vi.mock("src/notifications", () => ({ showError: mocks.error, showObjectSuccess: mocks.success }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
vi.mock("src/hooks", () => ({
	useDeadHosts: () => ({ data: mocks.rows }),
	useRedirectionHosts: () => ({ data: mocks.rows }),
	useStreams: () => ({ data: mocks.rows }),
	useProxyHostsPage: () => ({ data: { items: mocks.rows, pagination: { page: 1, totalPages: 1, totalItems: 1 } } }),
}));
vi.mock("./DeadHosts/lazy", () => ({
	showDeadHostModal: vi.fn(),
	showHelpModal: vi.fn(),
	showDeleteConfirmModal: mocks.confirm,
}));
vi.mock("./ProxyHosts/lazy", () => ({
	showProxyHostModal: vi.fn(),
	showAccessListModal: vi.fn(),
	showHelpModal: vi.fn(),
	showDeleteConfirmModal: mocks.confirm,
}));
vi.mock("./RedirectionHosts/lazy", () => ({
	showRedirectionHostModal: vi.fn(),
	showHelpModal: vi.fn(),
	showDeleteConfirmModal: mocks.confirm,
}));
vi.mock("./Streams/lazy", () => ({
	showStreamModal: vi.fn(),
	showHelpModal: vi.fn(),
	showDeleteConfirmModal: mocks.confirm,
}));
vi.mock("./DeadHosts/Table", () => ({
	default: (props: TableProps) => {
		mocks.table = props;
		return null;
	},
}));
vi.mock("./ProxyHosts/Table", () => ({
	default: (props: TableProps) => {
		mocks.table = props;
		return null;
	},
}));
vi.mock("./RedirectionHosts/Table", () => ({
	default: (props: TableProps) => {
		mocks.table = props;
		return null;
	},
}));
vi.mock("./Streams/Table", () => ({
	default: (props: TableProps) => {
		mocks.table = props;
		return null;
	},
}));

describe("host actions", () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(cleanup);
	it.each([DeadHosts, ProxyHosts, RedirectionHosts, Streams])(
		"reports toggle failures without rejecting the event handler",
		async (Page) => {
			mocks.toggle.mockRejectedValue(new Error("Nginx reload failed"));
			render(<Page />);
			await expect(mocks.table?.onDisableToggle(7, true)).resolves.toBeUndefined();
			expect(mocks.error).toHaveBeenCalledWith("Nginx reload failed");
			expect(mocks.success).not.toHaveBeenCalled();
			expect(mocks.invalidate).not.toHaveBeenCalled();
		},
	);
	it("refreshes the dead-host collection after deletion", async () => {
		render(<DeadHosts />);
		mocks.table?.onDelete(7);
		const options = mocks.confirm.mock.calls[0][0];
		expect(options.invalidations).toContainEqual(["dead-hosts"]);
		expect(options.invalidations).toContainEqual(["dead-host", 7]);
		await options.onConfirm();
		expect(mocks.remove).toHaveBeenCalledWith(7);
	});
	it("matches stream forwarding hosts without case sensitivity", () => {
		render(<Streams />);
		fireEvent.change(screen.getByRole("searchbox"), { target: { value: "host" } });
		expect(mocks.table?.data).toHaveLength(1);
	});
});
