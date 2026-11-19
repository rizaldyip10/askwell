import Link from "next/link";
import { BILLING_PATH } from "../../lib/auth/routes";
import type { ApiFailure } from "../projects/api";
import { FieldError } from "../projects/field";

export type FormError = { message: string; upgrade: boolean };

export function toFormError(failure: ApiFailure): FormError {
  return { message: failure.message, upgrade: failure.code === "plan_limit" };
}

/** A form's error, as text. On 403 plan_limit it adds a link to Billing. */
export function FormErrorMessage({ id, error }: { id: string; error: FormError }) {
  return (
    <FieldError id={id}>
      {error.message}{" "}
      {error.upgrade ? (
        <Link href={BILLING_PATH} className="font-medium underline underline-offset-4">
          Go to Billing
        </Link>
      ) : null}
    </FieldError>
  );
}
