import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useTorOnion } from "@/hooks/useTorOnion";
import type { TorOnion } from "@/api/backend";
import { Loader2 } from "lucide-react";
import { T, intl } from "@/locale";

const formSchema = z.object({
    name: z.string().min(1, intl.formatMessage({ id: "error.required_field" })),
    virtualPort: z.number().min(1).max(65535),
    targetPort: z.number().min(1).max(65535),
});

type FormValues = z.infer<typeof formSchema>;

interface TorOnionModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    service?: TorOnion | null;
}

export function TorOnionModal({ open, onOpenChange, service }: TorOnionModalProps) {
    const { create, update } = useTorOnion();

    const form = useForm<FormValues>({
        resolver: zodResolver(formSchema),
        defaultValues: {
            name: "",
            virtualPort: 80,
            targetPort: 80,
        },
    });

    useEffect(() => {
        if (open) {
            form.reset({
                name: service?.name || "",
                virtualPort: service?.virtualPort || 80,
                targetPort: service?.targetPort || 80,
            });
        }
    }, [open, service, form]);

    const onSubmit = (values: FormValues) => {
        if (service) {
            update.mutate(
                {
                    id: service.id,
                    data: {
                        name: values.name,
                        virtualPort: values.virtualPort,
                        targetPort: values.targetPort,
                    },
                },
                {
                    onSuccess: () => onOpenChange(false),
                },
            );
        } else {
            create.mutate(
                {
                    name: values.name,
                    virtualPort: values.virtualPort,
                    targetPort: values.targetPort,
                },
                {
                    onSuccess: () => onOpenChange(false),
                },
            );
        }
    };

    const isSubmitting = create.isPending || update.isPending;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg p-0 gap-0 overflow-hidden flex flex-col">
                <DialogHeader className="px-6 py-4 border-b">
                    <DialogTitle className="flex items-center gap-2">
                        <span className="text-xl">🧅</span>
                        <T id={service ? "tor.edit" : "tor.add"} />
                    </DialogTitle>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="contents">
                        <div className="p-6 space-y-4">
                            <FormField
                                control={form.control}
                                name="name"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>
                                            <T id="name" />
                                        </FormLabel>
                                        <FormControl>
                                            <Input placeholder="My Onion Service" {...field} />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <FormField
                                    control={form.control}
                                    name="virtualPort"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>
                                                <T id="tor.virtual_port" />
                                            </FormLabel>
                                            <FormControl>
                                                <Input type="number" min={1} max={65535} {...field} />
                                            </FormControl>
                                            <FormDescription>
                                                Port on the .onion address
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                                <FormField
                                    control={form.control}
                                    name="targetPort"
                                    render={({ field }) => (
                                        <FormItem>
                                            <FormLabel>Target Port</FormLabel>
                                            <FormControl>
                                                <Input type="number" min={1} max={65535} {...field} />
                                            </FormControl>
                                            <FormDescription>
                                                Local port to forward to (e.g., 80, 443)
                                            </FormDescription>
                                            <FormMessage />
                                        </FormItem>
                                    )}
                                />
                            </div>

                            {service?.onionAddress && (
                                <div className="p-4 bg-muted rounded-lg">
                                    <p className="text-sm text-muted-foreground mb-1">Onion Address</p>
                                    <code className="text-sm font-mono break-all">{service.onionAddress}</code>
                                </div>
                            )}
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
