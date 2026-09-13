import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { Certificate } from "src/api/backend";
import { afterEach, describe, expect, it, vi } from "vitest";
import Table from "./Table";

const mocks = vi.hoisted(() => ({ canManage: true }));
vi.mock("src/components/Table/Formatter/CertificateInUseFormatter", () => ({ CertificateInUseFormatter: () => null }));
vi.mock("src/components/Table/Formatter/DateFormatter", () => ({ DateFormatter: () => null }));
vi.mock("src/components/Table/Formatter/DomainsFormatter", () => ({ DomainsFormatter: () => null }));
vi.mock("src/components/Table/Formatter/UserAvatar", () => ({ UserAvatar: () => null }));
vi.mock("src/components/HasPermission", () => ({
	HasPermission: ({ children }: PropsWithChildren) => (mocks.canManage ? children : null),
}));
vi.mock("src/components/ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: PropsWithChildren) => children,
	DropdownMenuContent: ({ children }: PropsWithChildren) => children,
	DropdownMenuItem: ({ children }: PropsWithChildren) => <span>{children}</span>,
	DropdownMenuLabel: () => null,
	DropdownMenuSeparator: () => null,
	DropdownMenuTrigger: () => null,
}));
vi.mock("./lazy", () => ({
	showCustomCertificateModal: vi.fn(),
	showDNSCertificateModal: vi.fn(),
	showHTTPCertificateModal: vi.fn(),
	showInternalCertificateModal: vi.fn(),
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => id,
}));
const certificate = { id: 1, domainNames: ["example.test"], niceName: "test", meta: {} } as Certificate;
afterEach(() => {
	cleanup();
	mocks.canManage = true;
});
describe("certificate renewal availability", () => {
	it.each(["other", "internal"])("does not offer ACME renewal for %s certificates", (provider) => {
		render(<Table data={[{ ...certificate, provider }]} />);
		expect(screen.queryByText("action.renew")).not.toBeInTheDocument();
	});
	it("requires management permission to renew a Lets Encrypt certificate", () => {
		mocks.canManage = false;
		render(<Table data={[{ ...certificate, provider: "letsencrypt" }]} />);
		expect(screen.queryByText("action.renew")).not.toBeInTheDocument();
	});
	it("offers renewal for a managed Lets Encrypt certificate", () => {
		render(<Table data={[{ ...certificate, provider: "letsencrypt" }]} />);
		expect(screen.getByText("action.renew")).toBeInTheDocument();
	});
});
