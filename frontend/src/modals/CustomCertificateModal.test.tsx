import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { changeLocale } from "src/locale";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	create: vi.fn(),
	validate: vi.fn(),
	upload: vi.fn(),
	put: vi.fn(),
	show: vi.fn(),
	remove: vi.fn(),
}));
vi.mock("ez-modal-react", () => ({ default: { create: <T,>(component: T) => component, show: mocks.show } }));
vi.mock("src/api/backend", () => ({
	createCertificate: mocks.create,
	validateCertificate: mocks.validate,
	uploadCertificate: mocks.upload,
}));
vi.mock("src/api/backend/base", () => ({ put: mocks.put }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));

beforeEach(async () => {
	vi.clearAllMocks();
	mocks.validate.mockResolvedValue({});
	mocks.create.mockResolvedValue({ id: 77 });
	mocks.put.mockResolvedValue({});
	mocks.upload.mockResolvedValue({});
	await changeLocale("en");
});
afterEach(cleanup);

async function openPasteModal(header: string) {
	const { showCustomCertificateModal } = await import("./CustomCertificateModal");
	showCustomCertificateModal();
	const Modal = mocks.show.mock.calls[0]?.[0];
	render(
		<QueryClientProvider client={new QueryClient()}>
			<Modal visible remove={mocks.remove} />
		</QueryClientProvider>,
	);
	fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gateway" } });
	fireEvent.mouseDown(screen.getByRole("tab", { name: "Paste Input" }), { button: 0, ctrlKey: false });
	await screen.findByLabelText("Private Key (PEM)");
	fireEvent.change(screen.getByLabelText("Private Key (PEM)"), {
		target: { value: `-----BEGIN ${header}-----\nkey\n-----END ${header}-----` },
	});
	fireEvent.change(screen.getByLabelText("Certificate Body (PEM)"), {
		target: { value: "-----BEGIN CERTIFICATE-----\ncert\n-----END CERTIFICATE-----" },
	});
}

it.each(["PRIVATE KEY", "RSA PRIVATE KEY", "EC PRIVATE KEY"])(
	"sends pasted %s keys to server validation",
	async (header) => {
		await openPasteModal(header);
		fireEvent.click(screen.getByRole("button", { name: "Save" }));
		await waitFor(() => expect(mocks.upload).toHaveBeenCalledWith(77, expect.any(FormData)));
		expect(mocks.validate).toHaveBeenCalledTimes(1);
		expect(mocks.remove).toHaveBeenCalledTimes(1);
	},
);

it("retries failed uploads against the existing certificate and applies an edited name", async () => {
	mocks.upload.mockRejectedValueOnce(new Error("Upload failed")).mockResolvedValue({});
	await openPasteModal("RSA PRIVATE KEY");
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await screen.findByText("Upload failed");
	fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Gateway renamed" } });
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	await waitFor(() => expect(mocks.remove).toHaveBeenCalledTimes(1));
	expect(mocks.create).toHaveBeenCalledTimes(1);
	expect(mocks.put).toHaveBeenCalledWith({
		url: "/nginx/certificates/77",
		data: { id: 77, niceName: "Gateway renamed" },
	});
	expect(mocks.upload.mock.calls.map(([id]) => id)).toEqual([77, 77]);
});
