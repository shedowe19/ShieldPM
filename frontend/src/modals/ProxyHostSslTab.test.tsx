import { cleanup, render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProxyHostSslTab from "./ProxyHostSslTab";

vi.mock("src/components", () => ({
	SSLCertificateField: ({ allowNew, label, name }: { allowNew?: boolean; label: string; name: string }) => (
		<output data-testid="certificate-field" data-allow-new={allowNew} data-label={label} data-name={name} />
	),
	SSLOptionsFields: ({ color }: { color?: string }) => <output data-testid="ssl-options" data-color={color} />,
}));

vi.mock("src/components/ui/tabs", () => ({
	TabsContent: ({ children, value }: PropsWithChildren<{ value: string }>) => <div data-tab={value}>{children}</div>,
}));

describe("ProxyHostSslTab", () => {
	afterEach(cleanup);

	it("keeps the Proxy Host certificate selector and SSL options in the SSL tab", () => {
		render(<ProxyHostSslTab />);

		expect(screen.getByTestId("certificate-field")).toHaveAttribute("data-name", "certificateId");
		expect(screen.getByTestId("certificate-field")).toHaveAttribute("data-label", "ssl-certificate");
		expect(screen.getByTestId("certificate-field")).toHaveAttribute("data-allow-new", "true");
		expect(screen.getByTestId("ssl-options")).toHaveAttribute("data-color", "bg-lime");
		expect(screen.getByTestId("ssl-options").parentElement).toHaveAttribute("data-tab", "ssl");
	});
});
