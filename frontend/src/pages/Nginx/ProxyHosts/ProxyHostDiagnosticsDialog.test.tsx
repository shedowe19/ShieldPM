import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type PropsWithChildren, StrictMode } from "react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProxyHostDiagnosticsDialog } from "./ProxyHostDiagnosticsDialog";

const mocks = vi.hoisted(() => ({
	mutate: vi.fn(),
	useProxyHostDiagnostics: vi.fn(),
}));

vi.mock("src/hooks/useProxyHostDiagnostics", () => ({ useProxyHostDiagnostics: mocks.useProxyHostDiagnostics }));
vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren) => <div role="dialog">{children}</div>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));

describe("proxy host diagnostics dialog", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		await changeLocale("en");
	});
	afterEach(cleanup);

	it("runs a single on-demand diagnosis, shows results, and allows a retry", () => {
		mocks.useProxyHostDiagnostics.mockReturnValue({
			mutate: mocks.mutate,
			isPending: false,
			error: null,
			data: {
				hostId: 71,
				domain: "proxy.example.test",
				checkedAt: "2026-09-23T09:00:00Z",
				checks: [
					{ key: "route", status: "fail", message: "route.serverError", detail: "502" },
					{ key: "tls", status: "warn", message: "tls.expiring", detail: "3" },
					{ key: "websocket", status: "warn", message: "websocket.authProtected", detail: "302" },
				],
			},
		});
		render(
			<StrictMode>
				<ProxyHostDiagnosticsDialog hostId={71} domain="proxy.example.test" onClose={vi.fn()} />
			</StrictMode>,
		);

		expect(mocks.mutate).toHaveBeenCalledTimes(1);
		expect(mocks.mutate).toHaveBeenCalledWith({ id: 71, websocketPath: "/" });
		expect(screen.getByText("The proxy route returned a server error.")).toBeInTheDocument();
		expect(screen.getByText("HTTP 502")).toBeInTheDocument();
		expect(screen.getByText("3 days remaining")).toBeInTheDocument();
		expect(
			screen.getByText("Tested an unauthenticated handshake at / only; other WebSocket paths are not checked."),
		).toBeInTheDocument();
		fireEvent.change(screen.getByRole("textbox", { name: "WebSocket endpoint path" }), {
			target: { value: "//invalid" },
		});
		expect(screen.getByRole("button", { name: "Run again" })).toBeDisabled();
		expect(mocks.mutate).toHaveBeenCalledTimes(1);
		fireEvent.change(screen.getByRole("textbox", { name: "WebSocket endpoint path" }), {
			target: { value: "/api/ws" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Run again" }));
		expect(mocks.mutate).toHaveBeenCalledTimes(2);
		expect(mocks.mutate).toHaveBeenLastCalledWith({ id: 71, websocketPath: "/api/ws" });
	});

	it("does not claim a WebSocket handshake occurred when the check was skipped", () => {
		mocks.useProxyHostDiagnostics.mockReturnValue({
			mutate: mocks.mutate,
			isPending: false,
			error: null,
			data: {
				hostId: 71,
				domain: "proxy.example.test",
				checkedAt: "2026-09-23T09:00:00Z",
				checks: [{ key: "websocket", status: "skip", message: "websocket.notConfigured" }],
			},
		});
		render(<ProxyHostDiagnosticsDialog hostId={71} domain="proxy.example.test" onClose={vi.fn()} />);

		expect(screen.getByText("WebSocket upgrades are not enabled for this host.")).toBeInTheDocument();
		expect(screen.queryByText(/Tested an unauthenticated handshake/)).not.toBeInTheDocument();
	});
});
