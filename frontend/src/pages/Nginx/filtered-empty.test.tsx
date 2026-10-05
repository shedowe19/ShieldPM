import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const lastHost = {
	id: 7,
	domainNames: ["last.example"],
	forwardingHost: "last.example",
	forwardingPort: 80,
	incomingPort: 80,
	forwardDomainName: "target.example",
	forwardScheme: "http",
	forwardHttpCode: 301,
};
const mocks = vi.hoisted(() => ({
	rows: [] as {
		id: number;
		domainNames: string[];
		forwardingHost: string;
		forwardingPort: number;
		incomingPort: number;
		forwardDomainName: string;
		forwardScheme: string;
		forwardHttpCode: number;
	}[],
	manage: true,
	showDeadHostModal: vi.fn(),
	showRedirectionHostModal: vi.fn(),
	showStreamModal: vi.fn(),
}));
vi.mock("src/hooks", () => ({
	useDeadHosts: () => ({ data: mocks.rows }),
	useRedirectionHosts: () => ({ data: mocks.rows }),
	useStreams: () => ({ data: mocks.rows }),
}));
vi.mock("src/hooks/useUser", () => ({
	useUser: () => ({
		data: {
			permissions: {
				deadHosts: mocks.manage ? "manage" : "view",
				redirectionHosts: mocks.manage ? "manage" : "view",
				streams: mocks.manage ? "manage" : "view",
			},
			roles: [],
		},
	}),
}));
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock("src/api/backend", () => ({
	deleteDeadHost: vi.fn(),
	toggleDeadHost: vi.fn(),
	deleteRedirectionHost: vi.fn(),
	toggleRedirectionHost: vi.fn(),
	deleteStream: vi.fn(),
	toggleStream: vi.fn(),
}));
vi.mock("src/components", async () => ({
	...(await import("src/components/EmptyData")),
	...(await import("src/components/HasPermission")),
	LoadingPage: () => null,
	CertificateFormatter: () => null,
	DomainsFormatter: () => null,
	UserAvatar: () => null,
	TrueFalseFormatter: () => null,
	ValueWithDateFormatter: () => null,
}));
vi.mock("src/notifications", () => ({ showError: vi.fn(), showObjectSuccess: vi.fn() }));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
vi.mock("src/pages/Nginx/DeadHosts/lazy", () => ({
	showDeadHostModal: mocks.showDeadHostModal,
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
}));
vi.mock("src/pages/Nginx/RedirectionHosts/lazy", () => ({
	showRedirectionHostModal: mocks.showRedirectionHostModal,
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
}));
vi.mock("src/pages/Nginx/Streams/lazy", () => ({
	showStreamModal: mocks.showStreamModal,
	showDeleteConfirmModal: vi.fn(),
	showHelpModal: vi.fn(),
}));

import DeadHosts from "./DeadHosts/TableWrapper";
import RedirectionHosts from "./RedirectionHosts/TableWrapper";
import Streams from "./Streams/TableWrapper";

const pages = [
	{ name: "dead hosts", Page: DeadHosts, showNew: mocks.showDeadHostModal },
	{ name: "redirection hosts", Page: RedirectionHosts, showNew: mocks.showRedirectionHostModal },
	{ name: "streams", Page: Streams, showNew: mocks.showStreamModal },
];
beforeEach(() => {
	vi.clearAllMocks();
	mocks.rows = [lastHost];
	mocks.manage = true;
});
afterEach(cleanup);

it.each(pages)("preserves search and creation after the last filtered $name disappears", ({ Page, showNew }) => {
	const view = render(<Page />);
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "last" } });
	mocks.rows = [];
	view.rerender(<Page />);
	expect(screen.getByRole("searchbox")).toHaveValue("last");
	expect(screen.getByText("empty-search")).toBeInTheDocument();
	fireEvent.click(screen.getByRole("button", { name: "object.add" }));
	expect(showNew).toHaveBeenCalledWith("new");

	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
	expect(screen.queryByText("empty-search")).not.toBeInTheDocument();
	expect(screen.getByText("object.empty")).toBeInTheDocument();
	expect(screen.getByRole("button", { name: "object.add" })).toBeInTheDocument();

	mocks.rows = [lastHost];
	view.rerender(<Page />);
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "absent" } });
	expect(screen.getByText("empty-search")).toBeInTheDocument();
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "last" } });
	expect(screen.queryByText("empty-search")).not.toBeInTheDocument();
});

it.each(pages)("does not expose creation to viewers of empty filtered $name", ({ Page, showNew }) => {
	mocks.manage = false;
	const view = render(<Page />);
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "last" } });
	mocks.rows = [];
	view.rerender(<Page />);
	expect(screen.getByRole("searchbox")).toHaveValue("last");
	expect(screen.queryByRole("button", { name: "object.add" })).not.toBeInTheDocument();
	fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
	expect(screen.getByText("object.empty")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "object.add" })).not.toBeInTheDocument();
	expect(showNew).not.toHaveBeenCalled();
});
