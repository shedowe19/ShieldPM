import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Layout from "./Layout";

const health = vi.hoisted(() => ({ data: { demo: false } }));

vi.mock("@/hooks/useHealth", () => ({ useHealth: () => health }));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("./DefaultSite", () => ({ default: () => <div>Default site settings</div> }));
vi.mock("./Ai", () => ({ default: () => <div>AI settings</div> }));
vi.mock("./GitOps", () => ({ default: () => <div>GitOps settings</div> }));
vi.mock("./Certificates", () => ({ default: () => <div>Certificate profile settings</div> }));

beforeEach(() => {
	health.data.demo = false;
});
afterEach(cleanup);

it("opens the certificate settings tab and returns to the default site tab", () => {
	render(<Layout />);
	expect(screen.getByText("Default site settings")).toBeInTheDocument();
	expect(screen.queryByText("Certificate profile settings")).not.toBeInTheDocument();

	fireEvent.click(screen.getByRole("button", { name: "settings.certificates.title" }));
	expect(screen.getByText("Certificate profile settings")).toBeInTheDocument();
	expect(screen.queryByText("Default site settings")).not.toBeInTheDocument();
	expect(screen.queryByText("AI settings")).not.toBeInTheDocument();
	expect(screen.queryByText("GitOps settings")).not.toBeInTheDocument();

	fireEvent.click(screen.getByRole("button", { name: "settings.default-site" }));
	expect(screen.getByText("Default site settings")).toBeInTheDocument();
	expect(screen.queryByText("Certificate profile settings")).not.toBeInTheDocument();
});

it("keeps certificate profile settings unavailable in demo mode", () => {
	health.data.demo = true;
	render(<Layout />);

	expect(screen.getByText("Global Settings are disabled in Demo Mode.")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "settings.certificates.title" })).not.toBeInTheDocument();
	expect(screen.queryByText("Certificate profile settings")).not.toBeInTheDocument();
});
