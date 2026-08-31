import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Shield } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { WireguardPeer } from "@/api/backend";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useWireguardPeer } from "@/hooks/useWireguardPeer";
import { intl, T } from "@/locale";

const formSchema = z.object({
	name: z.string().min(1, intl.formatMessage({ id: "error.required_field" })),
	description: z.string().optional(),
	allowed_ips: z.string().optional(),
	persistent_keepalive: z.number().min(0).max(65535).optional(),
	dns: z.string().optional(),
});

interface WireguardPeerModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	peer?: WireguardPeer | null;
	onCreated?: (peer: WireguardPeer) => void;
}

export function WireguardPeerModal({ open, onOpenChange, peer, onCreated }: WireguardPeerModalProps) {
	const { create, update } = useWireguardPeer();

	const form = useForm<z.infer<typeof formSchema>>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			name: "",
			description: "",
			allowed_ips: "10.8.0.0/24",
			persistent_keepalive: 25,
			dns: "1.1.1.1",
		},
	});

	useEffect(() => {
		if (open) {
			form.reset({
				name: peer?.name || "",
				description: peer?.description || "",
				allowed_ips: peer?.allowedIps || "10.8.0.0/24",
				persistent_keepalive: peer?.persistentKeepalive || 25,
				dns: peer?.dns || "1.1.1.1",
			});
		}
	}, [open, peer, form]);

	const onSubmit = (values: z.infer<typeof formSchema>) => {
		if (peer) {
			update.mutate(
				{ id: peer.id, data: values },
				{
					onSuccess: () => onOpenChange(false),
				},
			);
		} else {
			create.mutate(values, {
				onSuccess: (newPeer) => {
					onOpenChange(false);
					if (onCreated) {
						onCreated(newPeer);
					}
				},
			});
		}
	};

	const isSubmitting = create.isPending || update.isPending;
	const isEditing = !!peer;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col">
				<DialogHeader className="px-6 py-4 border-b">
					<DialogTitle className="flex items-center gap-2">
						<Shield className="h-5 w-5" />
						<T id={isEditing ? "wireguard.edit" : "wireguard.add"} />
					</DialogTitle>
				</DialogHeader>
				<Form {...form}>
					<form onSubmit={form.handleSubmit(onSubmit)} className="contents">
						<div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
							<FormField
								control={form.control}
								name="name"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											<T id="wireguard.peer.name" />
										</FormLabel>
										<FormControl>
											<Input placeholder="Home Raspberry Pi" {...field} />
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="description"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											<T id="wireguard.peer.description" />
										</FormLabel>
										<FormControl>
											<Textarea
												placeholder="Nextcloud, Home Assistant, etc."
												{...field}
												rows={2}
											/>
										</FormControl>
										<FormMessage />
									</FormItem>
								)}
							/>
							<FormField
								control={form.control}
								name="allowed_ips"
								render={({ field }) => (
									<FormItem>
										<FormLabel>
											<T id="wireguard.peer.allowedIps" />
										</FormLabel>
										<FormControl>
											<Input placeholder="0.0.0.0/0, ::/0" {...field} />
										</FormControl>
										<FormDescription className="text-xs">
											<T id="wireguard.peer.allowedIps.hint" />
										</FormDescription>
										<FormMessage />
									</FormItem>
								)}
							/>
							<div className="grid grid-cols-2 gap-4">
								<FormField
									control={form.control}
									name="persistent_keepalive"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												<T id="wireguard.peer.keepalive" />
											</FormLabel>
											<FormControl>
												<Input
													type="number"
													min={0}
													max={65535}
													{...field}
													onChange={(e) => {
														const val =
															e.target.value === ""
																? undefined
																: Number.parseInt(e.target.value, 10);
														field.onChange(val);
													}}
												/>
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
								<FormField
									control={form.control}
									name="dns"
									render={({ field }) => (
										<FormItem>
											<FormLabel>
												<T id="wireguard.peer.dns" />
											</FormLabel>
											<FormControl>
												<Input placeholder="1.1.1.1" {...field} />
											</FormControl>
											<FormMessage />
										</FormItem>
									)}
								/>
							</div>
						</div>
						<DialogFooter className="px-6 py-4 border-t bg-muted/10">
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								<T id="cancel" />
							</Button>
							<Button
								type="submit"
								disabled={isSubmitting}
								className="bg-purple-600/90 text-white hover:bg-purple-600 shadow-sm"
							>
								{isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
								<T id="save" />
							</Button>
						</DialogFooter>
					</form>
				</Form>
			</DialogContent>
		</Dialog>
	);
}
