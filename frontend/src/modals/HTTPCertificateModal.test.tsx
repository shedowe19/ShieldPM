import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ show: vi.fn(), test: vi.fn() }));
vi.mock("ez-modal-react", () => ({ default: { create: <T,>(c: T) => c, show: mocks.show } }));
vi.mock("src/api/backend", () => ({ createCertificate: vi.fn(), testHttpCertificate: mocks.test }));
vi.mock("src/components", () => ({
	DomainNamesField: ({ onChange }: { onChange: (domains: string[]) => void }) => (
		<input aria-label="Domains" onChange={(e) => onChange([e.target.value])} />
	),
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
afterEach(cleanup);
it("discards reachability results after the domains are edited", async () => {
	let resolveTest: (value: Record<string, string>) => void = () => undefined;
	mocks.test.mockReturnValue(
		new Promise((resolve) => {
			resolveTest = resolve;
		}),
	);
	const { showHTTPCertificateModal } = await import("./HTTPCertificateModal");
	showHTTPCertificateModal();
	const Modal = mocks.show.mock.calls[0]?.[0];
	render(
		<QueryClientProvider client={new QueryClient()}>
			<Modal visible remove={vi.fn()} />
		</QueryClientProvider>,
	);
	fireEvent.change(screen.getByLabelText("Domains"), { target: { value: "old.example" } });
	fireEvent.click(screen.getByRole("button", { name: "test" }));
	expect(mocks.test).toHaveBeenCalledWith(["old.example"]);
	fireEvent.change(screen.getByLabelText("Domains"), { target: { value: "new.example" } });
	await act(async () => resolveTest({ "old.example": "ok" }));
	expect(screen.queryByText("old.example:")).not.toBeInTheDocument();
});
