import { IconCheck, IconCopy, IconDownload } from "@tabler/icons-react";
import { QrCode, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { getWireguardPeerConfig, getWireguardPeerQRCode } from "@/api/backend";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { intl, T } from "@/locale";

interface WireguardConfigModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	peerId: number;
	peerName: string;
}

export function WireguardConfigModal({ open, onOpenChange, peerId, peerName }: WireguardConfigModalProps) {
	const [config, setConfig] = useState<string | null>(null);
	const [qrcode, setQrcode] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (open && peerId) {
			setLoading(true);
			setCopied(false);

			Promise.all([
				getWireguardPeerConfig(peerId).then((r) => setConfig(r.config)),
				getWireguardPeerQRCode(peerId)
					.then((r) => setQrcode(r.qrcode))
					.catch(() => setQrcode(null)),
			])
				.catch(() => setConfig(null))
				.finally(() => setLoading(false));
		}
	}, [open, peerId]);

	const handleCopy = () => {
		if (config) {
			navigator.clipboard.writeText(config);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		}
	};

	const handleDownload = () => {
		if (config) {
			const blob = new Blob([config], { type: "text/plain" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${peerName.replace(/\s+/g, "_").toLowerCase()}.conf`;
			a.click();
			URL.revokeObjectURL(url);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col">
				<DialogHeader className="px-6 py-4 border-b">
					<DialogTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						<T id="wireguard.config.title" /> — {peerName}
					</DialogTitle>
					<DialogDescription className="sr-only">
						<T id="wireguard.config.description" />
					</DialogDescription>
				</DialogHeader>

				<div className="px-6 py-2">
					<div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-3 text-sm text-yellow-600 dark:text-yellow-400">
						⚠️ <T id="wireguard.config.warning" />
					</div>
				</div>

				{loading ? (
					<div className="p-12 text-center text-muted-foreground">
						<T id="loading" />
					</div>
				) : (
					<Tabs defaultValue="config" className="px-6 pb-4">
						<TabsList className="grid w-full grid-cols-2">
							<TabsTrigger value="config">
								<Shield className="mr-2 h-4 w-4" />
								<T id="wireguard.config.download" />
							</TabsTrigger>
							<TabsTrigger value="qrcode" disabled={!qrcode}>
								<QrCode className="mr-2 h-4 w-4" />
								<T id="wireguard.config.qrcode" />
							</TabsTrigger>
						</TabsList>

						<TabsContent value="config" className="mt-4">
							<div className="relative">
								<pre className="bg-muted/50 border rounded-md p-4 text-xs font-mono overflow-x-auto max-h-[350px] whitespace-pre-wrap">
									{config}
								</pre>
								<Button
									variant="ghost"
									size="icon"
									className="absolute top-2 right-2"
									aria-label={intl.formatMessage({ id: "wireguard.config.copy" })}
									onClick={handleCopy}
								>
									{copied ? (
										<IconCheck className="h-4 w-4 text-green-500" />
									) : (
										<IconCopy className="h-4 w-4" />
									)}
								</Button>
							</div>
						</TabsContent>

						<TabsContent value="qrcode" className="mt-4">
							{qrcode && (
								<div className="flex flex-col items-center gap-4">
									<div className="bg-white rounded-lg p-4">
										<img
											src={qrcode}
											alt={intl.formatMessage({ id: "wireguard.config.qrcode.alt" })}
											className="w-64 h-64"
										/>
									</div>
									<p className="text-xs text-muted-foreground text-center">
										<T id="wireguard.config.qrcode.hint" />
									</p>
								</div>
							)}
						</TabsContent>
					</Tabs>
				)}

				<DialogFooter className="px-6 py-4 border-t bg-muted/10">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						<T id="action.close" />
					</Button>
					<Button
						onClick={handleDownload}
						disabled={!config}
						className="bg-purple-600/90 text-white hover:bg-purple-600 shadow-sm"
					>
						<IconDownload className="mr-2 h-4 w-4" />
						<T id="wireguard.config.download" />
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
