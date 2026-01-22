import { useEffect, useRef, useState } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "xterm-addon-fit";
import { WebLinksAddon } from "xterm-addon-web-links";
import "xterm/css/xterm.css";

import type { TerminalHost } from "../../api/backend";

interface Props {
	host: TerminalHost;
	onClose: () => void;
}

const WebTerminal = ({ host, onClose }: Props) => {
	const terminalRef = useRef<HTMLDivElement>(null);
	const [status, setStatus] = useState<string>("connecting");
	const wsRef = useRef<WebSocket | null>(null);
	const xtermRef = useRef<Terminal | null>(null);

	useEffect(() => {
		if (!terminalRef.current) return;

		const term = new Terminal({
			cursorBlink: true,
			fontSize: 14,
			fontFamily: 'Menlo, Monaco, "Courier New", monospace',
			theme: {
				background: "#000000",
			},
		});

		const fitAddon = new FitAddon();
		term.loadAddon(fitAddon);
		term.loadAddon(new WebLinksAddon());

		term.open(terminalRef.current);
		fitAddon.fit();
		xtermRef.current = term;

		// Construct WebSocket URL
		// We use the same host/port as the current window, but with 'ws' or 'wss' protocol.
		const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
		const wsUrl = `${protocol}//${window.location.host}/api/nginx/terminal/ws?id=${host.id}`;

		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			setStatus("connected");

			// Send initial resize
			const dims = { cols: term.cols, rows: term.rows };
			ws.send(JSON.stringify({ type: "resize", ...dims }));

			term.focus();
		};

		ws.onmessage = (event) => {
			try {
				const msg = JSON.parse(event.data);
				if (msg.type === "data") {
					term.write(msg.data);
				} else if (msg.type === "error") {
					term.write(`\r\n\x1b[31mError: ${msg.message}\x1b[0m\r\n`);
				} else if (msg.type === "status") {
					// Update status if needed
				}
			} catch (_e) {
				// Fallback for raw text if backend sends it?
				// backend/internal/terminal.js sends JSON.
			}
		};

		ws.onclose = (event) => {
			setStatus("disconnected");
			if (event.code === 1008) {
				term.write(`\r\n\x1b[31mConnection closed: ${event.reason}\x1b[0m\r\n`);
			} else {
				term.write("\r\n\x1b[31mConnection closed.\x1b[0m\r\n");
			}
		};

		ws.onerror = (e) => {
			console.error("WS Error", e);
			setStatus("error");
			term.write("\r\n\x1b[31mConnection error.\x1b[0m\r\n");
		};

		term.onData((data) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "data", data }));
			}
		});

		term.onResize((size) => {
			if (ws.readyState === WebSocket.OPEN) {
				ws.send(JSON.stringify({ type: "resize", cols: size.cols, rows: size.rows }));
			}
		});

		// Handle container resize
		const resizeObserver = new ResizeObserver(() => {
			fitAddon.fit();
		});
		resizeObserver.observe(terminalRef.current);

		// Initial fit delay to ensure layout is settled
		setTimeout(() => fitAddon.fit(), 100);

		return () => {
			resizeObserver.disconnect();
			if (ws.readyState === WebSocket.OPEN) {
				ws.close();
			}
			term.dispose();
		};
	}, [host.id]);

	return (
		<div className="flex flex-col h-full w-full bg-black">
			<div className="flex justify-between items-center p-2 bg-gray-900 text-white border-b border-gray-800">
				<span className="font-mono text-sm">
					{host.username}@{host.host} {status === "connected" ? "🟢" : "🔴"}
				</span>
				<button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
					✕
				</button>
			</div>
			<div ref={terminalRef} className="flex-1 w-full overflow-hidden" />
		</div>
	);
};

export default WebTerminal;
