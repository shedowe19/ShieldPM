import errs from "./error.js";

/** Preserve useful domain conflict responses when another writer wins after the optimistic availability check. */
export const translateDomainReservationError = (error) => {
	const native = error?.nativeError || error;
	if (/host_domain_reservation(?:_domain_unique|\.domain_name)/i.test(native?.message || "")) {
		throw new errs.ValidationError("One or more domain names are already in use", error);
	}
	throw error;
};
