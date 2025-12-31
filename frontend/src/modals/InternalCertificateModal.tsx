import { IconCertificate, IconShieldLock } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { type ReactNode, useState } from "react";
import { type Certificate, createCertificate } from "src/api/backend";
import { T } from "src/locale";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Button } from "src/components/ui/button";
import { Label } from "src/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent } from "src/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Textarea } from "src/components/ui/textarea";
import { showObjectSuccess } from "src/notifications";

const showInternalCertificateModal = () => {
    EasyModal.show(InternalCertificateModal);
};

const InternalCertificateModal = EasyModal.create(({ visible, remove }: InnerModalProps) => {
    const queryClient = useQueryClient();
    const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const onSubmit = async (values: any, { setSubmitting }: any) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setErrorMsg(null);

        try {
            await createCertificate({
                provider: "internal",
                domain_names: values.domain_names.split(/\s+|,/).filter((d: string) => d.trim().length > 0),
                meta: {
                    years: parseInt(values.years, 10)
                }
            } as unknown as Certificate);

            showObjectSuccess("certificate", "saved");
            remove();
        } catch (err: any) {
            setErrorMsg(err.message || "An error occurred");
        }

        queryClient.invalidateQueries({ queryKey: ["certificates"] });
        setIsSubmitting(false);
        setSubmitting(false);
    };

    return (
        <Dialog open={visible} onOpenChange={(open) => !open && remove()}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <IconCertificate className="h-5 w-5" />
                        <span><T id="certificates.internal.add" /></span>
                    </DialogTitle>
                </DialogHeader>

                <Formik
                    initialValues={{
                        domain_names: "",
                        years: "10",
                    }}
                    onSubmit={onSubmit}
                >
                    {({ errors, touched, setFieldValue, values }: any) => (
                        <Form className="space-y-4">
                            {errorMsg && (
                                <Alert variant="destructive">
                                    <AlertCircle className="h-4 w-4" />
                                    <AlertTitle><T id="notification.error" /></AlertTitle>
                                    <AlertDescription>{errorMsg}</AlertDescription>
                                </Alert>
                            )}

                            <Card className="bg-muted/50">
                                <CardContent className="p-4 space-y-4">
                                    <Alert className="bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                                        <IconShieldLock className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                                        <AlertTitle className="ml-2 font-semibold"><T id="certificates.internal.post_quantum_title" /></AlertTitle>
                                        <AlertDescription className="ml-2">
                                            <T id="certificates.internal.post_quantum_desc" />
                                        </AlertDescription>
                                    </Alert>

                                    <div className="space-y-2">
                                        <Label htmlFor="domain_names"><T id="domain-names" /></Label>
                                        <Field name="domain_names">
                                            {({ field }: any) => (
                                                <Textarea
                                                    {...field}
                                                    id="domain_names"
                                                    placeholder="example.internal, svc.local"
                                                    className={errors.domain_names && touched.domain_names ? "border-destructive" : ""}
                                                />
                                            )}
                                        </Field>
                                        <p className="text-sm text-muted-foreground">
                                            <T id="certificates.internal.domain_names_help" />
                                        </p>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor="years"><T id="certificates.internal.validity" /></Label>
                                        <Select
                                            onValueChange={(val) => setFieldValue("years", val)}
                                            defaultValue={values.years}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select duration" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="1"><T id="str.years" data={{ count: 1 }} /></SelectItem>
                                                <SelectItem value="5"><T id="str.years" data={{ count: 5 }} /></SelectItem>
                                                <SelectItem value="10"><T id="str.years" data={{ count: 10 }} /></SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CardContent>
                            </Card>

                            <DialogFooter>
                                <Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
                                    <T id="cancel" />
                                </Button>
                                <Button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="bg-primary text-primary-foreground shadow-sm"
                                >
                                    {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                    <T id="save" />
                                </Button>
                            </DialogFooter>
                        </Form>
                    )}
                </Formik>
            </DialogContent>
        </Dialog>
    );
});

export { showInternalCertificateModal };
