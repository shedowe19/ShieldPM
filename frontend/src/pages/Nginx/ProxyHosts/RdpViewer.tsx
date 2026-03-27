import { IconKeyboard, IconMaximize, IconMinimize, IconPlayerStop, IconRefresh } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { T } from "src/locale";

// ────────────────────────────────────────────────────────────
// Scancode map (subset of AT-set-1 / RDP scancodes)
// ────────────────────────────────────────────────────────────
const SCANCODE_MAP: Record<string, number> = {
	Escape: 0x01,
	F1: 0x3b,
	F2: 0x3c,
	F3: 0x3d,
	F4: 0x3e,
	F5: 0x3f,
	F6: 0x40,
	F7: 0x41,
	F8: 0x42,
	F9: 0x43,
	F10: 0x44,
	F11: 0x57,
	F12: 0x58,
	Backquote: 0x29,
	Digit1: 0x02,
	Digit2: 0x03,
	Digit3: 0x04,
	Digit4: 0x05,
	Digit5: 0x06,
	Digit6: 0x07,
	Digit7: 0x08,
	Digit8: 0x09,
	Digit9: 0x0a,
	Digit0: 0x0b,
	Minus: 0x0c,
	Equal: 0x0d,
	Backspace: 0x0e,
	Tab: 0x0f,
	KeyQ: 0x10,
	KeyW: 0x11,
	KeyE: 0x12,
	KeyR: 0x13,
	KeyT: 0x14,
	KeyY: 0x15,
	KeyU: 0x16,
	KeyI: 0x17,
	KeyO: 0x18,
	KeyP: 0x19,
	BracketLeft: 0x1a,
	BracketRight: 0x1b,
	Enter: 0x1c,
	ControlLeft: 0x1d,
	KeyA: 0x1e,
	KeyS: 0x1f,
	KeyD: 0x20,
	KeyF: 0x21,
	KeyG: 0x22,
	KeyH: 0x23,
	KeyJ: 0x24,
	KeyK: 0x25,
	KeyL: 0x26,
	Semicolon: 0x27,
	Quote: 0x28,
	ShiftLeft: 0x2a,
	Backslash: 0x2b,
	KeyZ: 0x2c,
	KeyX: 0x2d,
	KeyC: 0x2e,
	KeyV: 0x2f,
	KeyB: 0x30,
	KeyN: 0x31,
	KeyM: 0x32,
	Comma: 0x33,
	Period: 0x34,
	Slash: 0x35,
	ShiftRight: 0x36,
	AltLeft: 0x38,
	Space: 0x39,
	CapsLock: 0x3a,
	ArrowUp: 0x48,
	ArrowLeft: 0x4b,
	ArrowRight: 0x4d,
	ArrowDown: 0x50,
	Delete: 0x53,
	ControlRight: 0x9d,
	AltRight: 0xb8,
	MetaLeft: 0xdb,
	MetaRight: 0xdc,
	ContextMenu: 0xdd,
	Home: 0xc7,
	End: 0xcf,
	PageUp: 0xc9,
	PageDown: 0xd1,
	Insert: 0xd2,
	PrintScreen: 0xb7,
	ScrollLock: 0x46,
	Pause: 0xc5,
};

// ────────────────────────────────────────────────────────────
// Virtual key definitions for the mobile toolbar
// ────────────────────────────────────────────────────────────
interface VKey {
	label: string;
	/** scancode, or list of [scancode, isDown] sequences for combos */
	action: number | Array<[number, boolean]>;
	/** modifier toggle key (stays active until another key is pressed) */
	modifier?: "ctrl" | "alt" | "shift";
	wide?: boolean;
}

// Modifier scancodes
const SC_CTRL = 0x1d; // ControlLeft
const SC_ALT = 0x38; // AltLeft
const SC_SHIFT = 0x2a; // ShiftLeft
const SC_DEL = 0x53;
const SC_WIN = 0xdb;

const VKEY_ROWS: VKey[][] = [
	// Row 1 – F keys
	[
		{ label: "Esc", action: SCANCODE_MAP.Escape },
		{ label: "F1", action: SCANCODE_MAP.F1 },
		{ label: "F2", action: SCANCODE_MAP.F2 },
		{ label: "F3", action: SCANCODE_MAP.F3 },
		{ label: "F4", action: SCANCODE_MAP.F4 },
		{ label: "F5", action: SCANCODE_MAP.F5 },
		{ label: "F6", action: SCANCODE_MAP.F6 },
		{ label: "F7", action: SCANCODE_MAP.F7 },
		{ label: "F8", action: SCANCODE_MAP.F8 },
		{ label: "F9", action: SCANCODE_MAP.F9 },
		{ label: "F10", action: SCANCODE_MAP.F10 },
		{ label: "F11", action: SCANCODE_MAP.F11 },
		{ label: "F12", action: SCANCODE_MAP.F12 },
	],
	// Row 2 – modifiers + nav
	[
		{ label: "Ctrl", action: SC_CTRL, modifier: "ctrl" },
		{ label: "Alt", action: SC_ALT, modifier: "alt" },
		{ label: "Shift", action: SC_SHIFT, modifier: "shift", wide: true },
		{ label: "⊞ Win", action: SC_WIN },
		{ label: "Tab", action: SCANCODE_MAP.Tab },
		{ label: "Del", action: SC_DEL },
		{ label: "Ins", action: SCANCODE_MAP.Insert },
		{ label: "Home", action: SCANCODE_MAP.Home },
		{ label: "End", action: SCANCODE_MAP.End },
		{ label: "PgUp", action: SCANCODE_MAP.PageUp },
		{ label: "PgDn", action: SCANCODE_MAP.PageDown },
		{ label: "↑", action: SCANCODE_MAP.ArrowUp },
		{ label: "←", action: SCANCODE_MAP.ArrowLeft },
		{ label: "↓", action: SCANCODE_MAP.ArrowDown },
		{ label: "→", action: SCANCODE_MAP.ArrowRight },
	],
	// Row 3 – combos
	[
		{
			label: "Ctrl+Alt+Del",
			wide: true,
			action: [
				[SC_CTRL, true],
				[SC_ALT, true],
				[SC_DEL, true],
				[SC_DEL, false],
				[SC_ALT, false],
				[SC_CTRL, false],
			],
		},
		{
			label: "Ctrl+C",
			action: [
				[SC_CTRL, true],
				[SCANCODE_MAP.KeyC, true],
				[SCANCODE_MAP.KeyC, false],
				[SC_CTRL, false],
			],
		},
		{
			label: "Ctrl+V",
			action: [
				[SC_CTRL, true],
				[SCANCODE_MAP.KeyV, true],
				[SCANCODE_MAP.KeyV, false],
				[SC_CTRL, false],
			],
		},
		{
			label: "Ctrl+X",
			action: [
				[SC_CTRL, true],
				[SCANCODE_MAP.KeyX, true],
				[SCANCODE_MAP.KeyX, false],
				[SC_CTRL, false],
			],
		},
		{
			label: "Ctrl+Z",
			action: [
				[SC_CTRL, true],
				[SCANCODE_MAP.KeyZ, true],
				[SCANCODE_MAP.KeyZ, false],
				[SC_CTRL, false],
			],
		},
		{
			label: "Ctrl+A",
			action: [
				[SC_CTRL, true],
				[SCANCODE_MAP.KeyA, true],
				[SCANCODE_MAP.KeyA, false],
				[SC_CTRL, false],
			],
		},
		{
			label: "Alt+Tab",
			action: [
				[SC_ALT, true],
				[SCANCODE_MAP.Tab, true],
				[SCANCODE_MAP.Tab, false],
				[SC_ALT, false],
			],
		},
		{
			label: "Alt+F4",
			action: [
				[SC_ALT, true],
				[SCANCODE_MAP.F4, true],
				[SCANCODE_MAP.F4, false],
				[SC_ALT, false],
			],
		},
	],
];

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────
type ConnectionStatus = "idle" | "connecting" | "connected" | "disconnected" | "error";

interface RdpViewerProps {
	hostId: number;
	open: boolean;
	onClose: () => void;
}

// ────────────────────────────────────────────────────────────
// Helper: detect touch device
// ────────────────────────────────────────────────────────────
const isTouchDevice = () => navigator.maxTouchPoints > 0 || "ontouchstart" in window;

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────
export default function RdpViewer({ hostId, open, onClose }: RdpViewerProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const headerRef = useRef<HTMLDivElement>(null);
	const vkbRef = useRef<HTMLDivElement>(null);

	const [status, setStatus] = useState<ConnectionStatus>("idle");
	const [errorMsg, setErrorMsg] = useState<string | null>(null);
	const [sessionWidth, setSessionWidth] = useState(1280);
	const [sessionHeight, setSessionHeight] = useState(800);
	const [isFullscreen, setIsFullscreen] = useState(false);
	const [showVKB, setShowVKB] = useState(() => isTouchDevice());

	// Sticky modifier states for the virtual keyboard
	const [stickyCtrl, setStickyCtrl] = useState(false);
	const [stickyAlt, setStickyAlt] = useState(false);
	const [stickyShift, setStickyShift] = useState(false);

	// ── WebSocket helpers ──────────────────────────────────
	const sendWs = useCallback((msg: object) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg));
		}
	}, []);

	// ── Measure available canvas area ─────────────────────
	const getMeasuredDimensions = useCallback(() => {
		if (isFullscreen) {
			return { w: screen.width, h: screen.height };
		}
		const container = containerRef.current;
		if (!container) return { w: 1280, h: 800 };
		const w = Math.floor(container.clientWidth) || 1280;
		const h = Math.floor(container.clientHeight) || 800;
		return { w, h };
	}, [isFullscreen]);

	// ── Connect ───────────────────────────────────────────
	// biome-ignore lint/correctness/useExhaustiveDependencies: handleMessage defined later; referentially stable
	const connect = useCallback(() => {
		if (wsRef.current) wsRef.current.close();
		setStatus("connecting");
		setErrorMsg(null);

		const { w, h } = getMeasuredDimensions();

		const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
		const host = window.location.host;
		const wsUrl = `${proto}//${host}/api/nginx/proxy-hosts/${hostId}/rdp/ws?width=${w}&height=${h}`;

		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onmessage = (evt) => {
			try {
				handleMessage(JSON.parse(evt.data));
			} catch (_e) {
				/* ignore */
			}
		};
		ws.onclose = () => {
			wsRef.current = null;
			setStatus((prev) => (prev === "connecting" || prev === "connected" ? "disconnected" : prev));
		};
		ws.onerror = () => {
			setErrorMsg("WebSocket connection failed");
			setStatus("error");
		};
	}, [hostId, getMeasuredDimensions]);

	// ── Disconnect ────────────────────────────────────────
	const disconnect = useCallback(() => {
		wsRef.current?.close();
		wsRef.current = null;
		setStatus("disconnected");
	}, []);

	// ── Handle inbound messages ───────────────────────────
	// biome-ignore lint/correctness/useExhaustiveDependencies: renderBitmap defined later; referentially stable
	const handleMessage = useCallback((msg: Record<string, unknown>) => {
		switch (msg.type) {
			case "status": {
				const s = msg.status as string;
				if (s === "connected") setStatus("connected");
				if (s === "connecting") setStatus("connecting");
				if (s === "disconnected") {
					setStatus("disconnected");
					wsRef.current = null;
				}
				break;
			}
			case "size":
				setSessionWidth((msg.width as number) || 1280);
				setSessionHeight((msg.height as number) || 800);
				break;
			case "error":
				setErrorMsg(msg.message as string);
				setStatus("error");
				break;
			case "bitmap":
				renderBitmap(msg);
				break;
			case "clipboard":
				if (msg.data && navigator.clipboard) {
					navigator.clipboard.writeText(msg.data as string).catch(() => {});
				}
				break;
			default:
				break;
		}
	}, []);

	// ── Render bitmap frame onto canvas ───────────────────
	const renderBitmap = useCallback((msg: Record<string, unknown>) => {
		const canvas = canvasRef.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		const { destLeft, destTop, width, height, bitsPerPixel, data } = msg as {
			destLeft: number;
			destTop: number;
			width: number;
			height: number;
			bitsPerPixel: number;
			data: string;
		};
		if (!data) return;
		try {
			const binary = atob(data);
			const bytes = new Uint8Array(binary.length);
			for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

			const pixelCount = width * height;
			const rgba = new Uint8ClampedArray(pixelCount * 4);

			if (bitsPerPixel === 32) {
				for (let i = 0; i < pixelCount; i++) {
					rgba[i * 4] = bytes[i * 4 + 2];
					rgba[i * 4 + 1] = bytes[i * 4 + 1];
					rgba[i * 4 + 2] = bytes[i * 4];
					rgba[i * 4 + 3] = 255;
				}
			} else if (bitsPerPixel === 24) {
				for (let i = 0; i < pixelCount; i++) {
					rgba[i * 4] = bytes[i * 3 + 2];
					rgba[i * 4 + 1] = bytes[i * 3 + 1];
					rgba[i * 4 + 2] = bytes[i * 3];
					rgba[i * 4 + 3] = 255;
				}
			} else if (bitsPerPixel === 16) {
				for (let i = 0; i < pixelCount; i++) {
					const p = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
					rgba[i * 4] = ((p >> 11) & 0x1f) << 3;
					rgba[i * 4 + 1] = ((p >> 5) & 0x3f) << 2;
					rgba[i * 4 + 2] = (p & 0x1f) << 3;
					rgba[i * 4 + 3] = 255;
				}
			} else {
				// Fallback: treat as 32-bit
				for (let i = 0; i < pixelCount; i++) {
					rgba[i * 4] = bytes[i * 4 + 2];
					rgba[i * 4 + 1] = bytes[i * 4 + 1];
					rgba[i * 4 + 2] = bytes[i * 4];
					rgba[i * 4 + 3] = 255;
				}
			}
			ctx.putImageData(new ImageData(rgba, width, height), destLeft, destTop);
		} catch (_e) {
			/* ignore rendering errors */
		}
	}, []);

	// ── ResizeObserver – reconnect when container changes ─
	useEffect(() => {
		const container = containerRef.current;
		if (!container || !open) return;
		const observer = new ResizeObserver(() => {
			// Only request a resize when already connected
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				const { w, h } = getMeasuredDimensions();
				sendWs({ type: "resize", width: w, height: h });
			}
		});
		observer.observe(container);
		return () => observer.disconnect();
	}, [open, getMeasuredDimensions, sendWs]);

	// ── Connect on open ───────────────────────────────────
	useEffect(() => {
		if (open) connect();
		return () => {
			if (!open) disconnect();
		};
	}, [open, connect, disconnect]);

	// ── Fullscreen: reconnect with screen resolution ──────
	useEffect(() => {
		const onFsChange = () => {
			const fs = !!document.fullscreenElement;
			setIsFullscreen(fs);
			// Reconnect with new resolution
			if (wsRef.current?.readyState === WebSocket.OPEN) {
				const w = fs ? screen.width : containerRef.current?.clientWidth || 1280;
				const h = fs ? screen.height : containerRef.current?.clientHeight || 800;
				sendWs({ type: "resize", width: w, height: h });
			}
		};
		document.addEventListener("fullscreenchange", onFsChange);
		return () => document.removeEventListener("fullscreenchange", onFsChange);
	}, [sendWs]);

	const toggleFullscreen = useCallback(async () => {
		if (!document.fullscreenElement) {
			await containerRef.current?.requestFullscreen();
		} else {
			await document.exitFullscreen();
		}
	}, []);

	// ── Mouse helpers ─────────────────────────────────────
	const getCanvasCoords = useCallback(
		(clientX: number, clientY: number) => {
			const canvas = canvasRef.current;
			if (!canvas) return { x: 0, y: 0 };
			const rect = canvas.getBoundingClientRect();
			const scaleX = sessionWidth / rect.width;
			const scaleY = sessionHeight / rect.height;
			return {
				x: Math.round((clientX - rect.left) * scaleX),
				y: Math.round((clientY - rect.top) * scaleY),
			};
		},
		[sessionWidth, sessionHeight],
	);

	const onMouseDown = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const { x, y } = getCanvasCoords(e.clientX, e.clientY);
			sendWs({ type: "mouse", x, y, button: e.button, isDown: true });
		},
		[getCanvasCoords, sendWs],
	);

	const onMouseUp = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const { x, y } = getCanvasCoords(e.clientX, e.clientY);
			sendWs({ type: "mouse", x, y, button: e.button, isDown: false });
		},
		[getCanvasCoords, sendWs],
	);

	const onMouseMove = useCallback(
		(e: React.MouseEvent<HTMLCanvasElement>) => {
			const { x, y } = getCanvasCoords(e.clientX, e.clientY);
			sendWs({ type: "mouse", x, y, button: 0, isDown: false });
		},
		[getCanvasCoords, sendWs],
	);

	const onWheel = useCallback(
		(e: React.WheelEvent<HTMLCanvasElement>) => {
			const { x, y } = getCanvasCoords(e.clientX, e.clientY);
			sendWs({ type: "wheel", x, y, delta: e.deltaY });
		},
		[getCanvasCoords, sendWs],
	);

	// ── Touch helpers ─────────────────────────────────────
	const touchState = useRef<{
		lastX: number;
		lastY: number;
		lastScrollY: number; // viewport Y for two-finger scroll (separate from canvas lastY)
		longPressTimer: ReturnType<typeof setTimeout> | null;
		pointers: number;
	}>({ lastX: 0, lastY: 0, lastScrollY: 0, longPressTimer: null, pointers: 0 });

	const onTouchStart = useCallback(
		(e: React.TouchEvent<HTMLCanvasElement>) => {
			e.preventDefault();
			const t = e.changedTouches[0];
			const { x, y } = getCanvasCoords(t.clientX, t.clientY);
			touchState.current.lastX = x;
			touchState.current.lastY = y;
			touchState.current.lastScrollY = t.clientY; // init viewport Y for scroll tracking
			touchState.current.pointers = e.touches.length;

			// Long press → right click
			touchState.current.longPressTimer = setTimeout(() => {
				sendWs({ type: "mouse", x, y, button: 2, isDown: true });
				sendWs({ type: "mouse", x, y, button: 2, isDown: false });
			}, 600);

			// Two-finger tap → right click immediately
			if (e.touches.length === 2) {
				if (touchState.current.longPressTimer) {
					clearTimeout(touchState.current.longPressTimer);
					touchState.current.longPressTimer = null;
				}
				sendWs({ type: "mouse", x, y, button: 2, isDown: true });
				sendWs({ type: "mouse", x, y, button: 2, isDown: false });
				return;
			}

			sendWs({ type: "mouse", x, y, button: 0, isDown: true });
		},
		[getCanvasCoords, sendWs],
	);

	const onTouchMove = useCallback(
		(e: React.TouchEvent<HTMLCanvasElement>) => {
			e.preventDefault();
			if (touchState.current.longPressTimer) {
				clearTimeout(touchState.current.longPressTimer);
				touchState.current.longPressTimer = null;
			}

			if (e.touches.length === 1) {
				const t = e.changedTouches[0];
				const { x, y } = getCanvasCoords(t.clientX, t.clientY);
				sendWs({ type: "mouse", x, y, button: 0, isDown: false });
				touchState.current.lastX = x;
				touchState.current.lastY = y;
			} else if (e.touches.length === 2) {
				// Two-finger scroll — use lastScrollY (viewport coords), never mix with canvas lastY
				const t0 = e.touches[0];
				const t1 = e.touches[1];
				const midX = (t0.clientX + t1.clientX) / 2;
				const midY = (t0.clientY + t1.clientY) / 2;
				const { x, y } = getCanvasCoords(midX, midY);
				const dy = t0.clientY - touchState.current.lastScrollY;
				sendWs({ type: "wheel", x, y, delta: dy });
				touchState.current.lastScrollY = t0.clientY; // update viewport scroll Y only
			}
		},
		[getCanvasCoords, sendWs],
	);

	const onTouchEnd = useCallback(
		(e: React.TouchEvent<HTMLCanvasElement>) => {
			e.preventDefault();
			if (touchState.current.longPressTimer) {
				clearTimeout(touchState.current.longPressTimer);
				touchState.current.longPressTimer = null;
			}
			if (e.touches.length === 0) {
				const { lastX, lastY } = touchState.current;
				sendWs({ type: "mouse", x: lastX, y: lastY, button: 0, isDown: false });
			}
		},
		[sendWs],
	);

	// ── Keyboard helpers ──────────────────────────────────
	const onKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			e.preventDefault();
			const sc = SCANCODE_MAP[e.code];
			if (sc !== undefined) sendWs({ type: "key", scancode: sc, isDown: true });
		},
		[sendWs],
	);

	const onKeyUp = useCallback(
		(e: React.KeyboardEvent) => {
			e.preventDefault();
			const sc = SCANCODE_MAP[e.code];
			if (sc !== undefined) sendWs({ type: "key", scancode: sc, isDown: false });
		},
		[sendWs],
	);

	// ── Virtual keyboard press ────────────────────────────
	const handleVKey = useCallback(
		(vkey: VKey) => {
			if (vkey.modifier) {
				// Toggle modifier
				if (vkey.modifier === "ctrl") setStickyCtrl((v) => !v);
				if (vkey.modifier === "alt") setStickyAlt((v) => !v);
				if (vkey.modifier === "shift") setStickyShift((v) => !v);
				return;
			}

			// Build sequence: press sticky modifiers, then the key, then release all
			const sendSeq = (ctrl: boolean, alt: boolean, shift: boolean) => {
				if (typeof vkey.action === "number") {
					if (ctrl) sendWs({ type: "key", scancode: SC_CTRL, isDown: true });
					if (alt) sendWs({ type: "key", scancode: SC_ALT, isDown: true });
					if (shift) sendWs({ type: "key", scancode: SC_SHIFT, isDown: true });
					sendWs({ type: "key", scancode: vkey.action, isDown: true });
					sendWs({ type: "key", scancode: vkey.action, isDown: false });
					if (shift) sendWs({ type: "key", scancode: SC_SHIFT, isDown: false });
					if (alt) sendWs({ type: "key", scancode: SC_ALT, isDown: false });
					if (ctrl) sendWs({ type: "key", scancode: SC_CTRL, isDown: false });
				} else {
					// Combo – send as-is
					for (const [sc, down] of vkey.action) {
						sendWs({ type: "key", scancode: sc, isDown: down });
					}
				}
			};

			sendSeq(stickyCtrl, stickyAlt, stickyShift);

			// Release sticky modifiers after use
			setStickyCtrl(false);
			setStickyAlt(false);
			setStickyShift(false);
		},
		[stickyCtrl, stickyAlt, stickyShift, sendWs],
	);

	// ── Status display helpers ────────────────────────────
	const statusColor: Record<ConnectionStatus, string> = {
		idle: "text-muted-foreground",
		connecting: "text-yellow-500",
		connected: "text-green-500",
		disconnected: "text-muted-foreground",
		error: "text-destructive",
	};
	const statusLabel: Record<ConnectionStatus, string> = {
		idle: "Idle",
		connecting: "rdp.connecting",
		connected: "rdp.connected",
		disconnected: "rdp.disconnected",
		error: "rdp.error",
	};

	// ────────────────────────────────────────────────────────
	// Render
	// ────────────────────────────────────────────────────────
	return (
		<Dialog open={open} onOpenChange={(o) => !o && onClose()}>
			<DialogContent className="max-w-[98vw] max-h-[98vh] w-full h-full p-0 gap-0 flex flex-col overflow-hidden">
				{/* ── Header bar ── */}
				<div ref={headerRef} className="flex-shrink-0">
					<DialogHeader className="px-3 py-1.5 border-b">
						<DialogTitle className="flex items-center gap-2 text-sm">
							<span className="font-semibold">RDP</span>
							<span className={`text-xs font-normal ${statusColor[status]}`}>
								<T id={statusLabel[status]} />
							</span>
							{errorMsg && (
								<span
									className="text-xs text-destructive font-normal truncate max-w-xs"
									title={errorMsg}
								>
									— {errorMsg}
								</span>
							)}

							<div className="ml-auto flex items-center gap-1">
								{/* Virtual keyboard toggle */}
								<Button
									variant={showVKB ? "secondary" : "ghost"}
									size="sm"
									className="h-7 px-2 text-xs"
									onClick={() => setShowVKB((v) => !v)}
									title="Virtual keyboard"
								>
									<IconKeyboard className="h-3.5 w-3.5" />
								</Button>

								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2"
									onClick={connect}
									disabled={status === "connecting"}
									title="Reconnect"
								>
									<IconRefresh className="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2"
									onClick={disconnect}
									disabled={status === "idle" || status === "disconnected"}
									title="Disconnect"
								>
									<IconPlayerStop className="h-3.5 w-3.5" />
								</Button>
								<Button
									variant="ghost"
									size="sm"
									className="h-7 px-2"
									onClick={toggleFullscreen}
									title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
								>
									{isFullscreen ? (
										<IconMinimize className="h-3.5 w-3.5" />
									) : (
										<IconMaximize className="h-3.5 w-3.5" />
									)}
								</Button>
							</div>
						</DialogTitle>
					</DialogHeader>
				</div>

				{/* ── Canvas area ── */}
				<div
					ref={containerRef}
					role="application"
					aria-label="RDP remote desktop"
					className="flex-1 overflow-hidden bg-black flex items-center justify-center relative min-h-0"
					onKeyDown={onKeyDown}
					onKeyUp={onKeyUp}
					tabIndex={-1}
				>
					<canvas
						ref={canvasRef}
						width={sessionWidth}
						height={sessionHeight}
						className="max-w-full max-h-full cursor-default outline-none touch-none"
						style={{ imageRendering: "pixelated" }}
						tabIndex={0}
						// Mouse
						onMouseDown={onMouseDown}
						onMouseUp={onMouseUp}
						onMouseMove={onMouseMove}
						onWheel={onWheel}
						// Touch
						onTouchStart={onTouchStart}
						onTouchMove={onTouchMove}
						onTouchEnd={onTouchEnd}
						onContextMenu={(e) => e.preventDefault()}
					/>

					{/* Overlay – connecting */}
					{status === "connecting" && (
						<div className="absolute inset-0 flex items-center justify-center bg-black/70 pointer-events-none">
							<div className="text-white text-center">
								<div className="animate-spin rounded-full h-10 w-10 border-b-2 border-white mx-auto mb-3" />
								<p className="text-sm">
									<T id="rdp.connecting" />
								</p>
							</div>
						</div>
					)}

					{/* Overlay – disconnected / error */}
					{(status === "disconnected" || status === "error") && (
						<div className="absolute inset-0 flex items-center justify-center bg-black/70">
							<div className="text-white text-center space-y-3">
								<p className="text-lg font-semibold">
									{status === "error" ? <T id="rdp.error" /> : <T id="rdp.disconnected" />}
								</p>
								{errorMsg && <p className="text-sm text-red-300 max-w-xs">{errorMsg}</p>}
								<Button variant="outline" size="sm" onClick={connect}>
									<IconRefresh className="mr-2 h-3.5 w-3.5" />
									<T id="action.reconnect" />
								</Button>
							</div>
						</div>
					)}
				</div>

				{/* ── Virtual keyboard toolbar ── */}
				{showVKB && (
					<div ref={vkbRef} className="flex-shrink-0 border-t bg-background overflow-x-auto">
						{VKEY_ROWS.map((row, rowIdx) => (
							<div key={rowIdx} className="flex items-center gap-0.5 px-1 py-0.5 min-w-max">
								{row.map((vkey, keyIdx) => {
									const isActive =
										(vkey.modifier === "ctrl" && stickyCtrl) ||
										(vkey.modifier === "alt" && stickyAlt) ||
										(vkey.modifier === "shift" && stickyShift);

									return (
										<button
											key={keyIdx}
											type="button"
											className={[
												"rounded border text-xs font-mono px-2 py-1 select-none active:scale-95 transition-transform",
												"focus:outline-none",
												vkey.wide ? "px-3" : "",
												isActive
													? "bg-primary text-primary-foreground border-primary"
													: "bg-muted hover:bg-accent border-border text-foreground",
											].join(" ")}
											onMouseDown={(e) => e.preventDefault()}
											onTouchStart={(e) => {
												e.preventDefault();
												handleVKey(vkey);
											}}
											onClick={() => handleVKey(vkey)}
										>
											{vkey.label}
										</button>
									);
								})}
							</div>
						))}
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
