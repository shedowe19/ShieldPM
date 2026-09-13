import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Field, useFormikContext } from "formik";
import type { ComponentProps, PropsWithChildren } from "react";
import { SSLOptionsFields } from "src/components/Form/SSLOptionsFields";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	show: vi.fn(),
	setStream: vi.fn(),
}));

vi.mock("ez-modal-react", () => ({
	default: { create: <T,>(Component: T) => Component, show: mocks.show },
}));
vi.mock("src/hooks", () => ({
	useStream: () => ({
		data: {
			id: 7,
			incomingPort: 8443,
			forwardingHost: "upstream.example.test",
			forwardingPort: 443,
			tcpForwarding: true,
			certificateId: 4,
			meta: {},
		},
		isLoading: false,
	}),
	useSetStream: () => ({ mutate: mocks.setStream }),
}));
vi.mock("src/components", () => {
	return {
		Loading: () => null,
		NoteWarning: () => null,
		SSLOptionsFields: (props: ComponentProps<typeof SSLOptionsFields>) => <SSLOptionsFields {...props} />,
		SSLCertificateField: () => {
			const { setFieldValue } = useFormikContext();
			return (
				<button type="button" onClick={() => setFieldValue("certificateId", "new")}>
					New certificate
				</button>
			);
		},
		DomainNamesField: () => {
			const { setFieldValue } = useFormikContext();
			return (
				<button type="button" onClick={() => setFieldValue("domainNames", ["stream.example.test"])}>
					Add domain
				</button>
			);
		},
		DNSProviderFields: () => <Field aria-label="DNS provider credentials" name="meta.dnsProviderCredentials" />,
	};
});
vi.mock("src/components/ui/dialog", () => ({
	Dialog: ({ children }: PropsWithChildren) => <>{children}</>,
	DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogFooter: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
	DialogTitle: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
}));
vi.mock("src/components/ui/tabs", () => ({
	Tabs: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsList: ({ children }: PropsWithChildren) => <div>{children}</div>,
	TabsTrigger: ({ children }: PropsWithChildren) => <span>{children}</span>,
}));
vi.mock("src/locale", () => ({
	intl: { formatMessage: ({ id }: { id: string }) => id },
	T: ({ id }: { id: string }) => <>{id}</>,
}));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));

const renderStream = async () => {
	const { showStreamModal } = await import("./StreamModal");
	showStreamModal(7);
	const Modal = mocks.show.mock.calls[0][0];
	render(<Modal id={7} visible remove={vi.fn()} />);
};

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("StreamModal TLS", () => {
	it("omits HTTP-only settings and certificate domain names when editing a stream", async () => {
		await renderStream();
		expect(screen.queryByText("domains.force-ssl")).not.toBeInTheDocument();
		expect(screen.queryByText("domains.http2-support")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "save" }));
		await waitFor(() => expect(mocks.setStream).toHaveBeenCalled());
		const payload = mocks.setStream.mock.calls[0][0];
		expect(payload).not.toHaveProperty("domainNames");
		expect(payload).not.toHaveProperty("sslForced");
		expect(payload).not.toHaveProperty("http2Support");
	});

	it("collects domains and forces DNS validation when requesting a new stream certificate", async () => {
		await renderStream();
		fireEvent.click(screen.getByRole("button", { name: "New certificate" }));
		fireEvent.click(await screen.findByRole("button", { name: "Add domain" }));
		const credentials = await screen.findByLabelText("DNS provider credentials");
		fireEvent.change(credentials, { target: { value: "synthetic-test-token" } });
		expect(screen.getByRole("switch", { name: "domains.use-dns" })).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "save" }));

		await waitFor(() => expect(mocks.setStream).toHaveBeenCalled());
		expect(mocks.setStream.mock.calls[0][0]).toMatchObject({
			certificateId: "new",
			domainNames: ["stream.example.test"],
			meta: { dnsChallenge: true, dnsProviderCredentials: "synthetic-test-token" },
		});
	});
});
