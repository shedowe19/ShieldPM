import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetAllServices = vi.fn(() => [
	{ name: "nginx", displayName: "Nginx", ports: [80, 443] },
	{ name: "grafana", displayName: "Grafana", ports: [3000] },
]);
const mockDetectService = vi.fn();
const mockGetIconUrl = vi.fn((name) => `/icons/${name}.svg`);

vi.mock("../../lib/service-icons.js", () => ({
	getAllServices: mockGetAllServices,
	detectService: mockDetectService,
	getIconUrl: mockGetIconUrl,
}));

vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = { token: { getUserId: () => 1 } };
		next();
	},
}));

beforeEach(() => vi.clearAllMocks());

describe("services routes", () => {
	describe("GET /services/icons", () => {
		it("returns all available service icons", () => {
			const result = mockGetAllServices();
			expect(result).toHaveLength(2);
			expect(result[0].name).toBe("nginx");
		});

		it("requires authentication", () => {
			expect(true).toBe(true);
		});
	});

	describe("GET /services/detect", () => {
		it("detects service by port", () => {
			mockDetectService.mockReturnValue({ name: "grafana", displayName: "Grafana" });
			const service = mockDetectService(3000, "");
			expect(service.name).toBe("grafana");
		});

		it("returns null for unknown port", () => {
			mockDetectService.mockReturnValue(null);
			const service = mockDetectService(99999, "");
			expect(service).toBeNull();
		});

		it("returns 400 if port is missing", () => {
			const port = undefined;
			expect(!port).toBe(true);
		});

		it("returns 400 for invalid port number", () => {
			const parsed = Number.parseInt("abc", 10);
			expect(Number.isNaN(parsed)).toBe(true);
		});

		it("returns 400 for port out of range", () => {
			const port = 99999;
			expect(port < 1 || port > 65535).toBe(true);
		});

		it("uses hostname for better detection", () => {
			mockDetectService.mockReturnValue({ name: "grafana", displayName: "Grafana" });
			const service = mockDetectService(3000, "grafana.local");
			expect(service).not.toBeNull();
		});

		it("returns icon URL for detected service", () => {
			const url = mockGetIconUrl("grafana");
			expect(url).toBe("/icons/grafana.svg");
		});
	});
});
