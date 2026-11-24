import type { Plan } from "@askwell/shared";
import Link from "next/link";
import { BILLING_PATH } from "../../lib/auth/routes";
import { Badge } from "../ui/badge";
import { PLAN_LABEL } from "./plan-details";
import { TAP_MIN } from "../ui/tap-target";

/** "Free" / "Pro" next to the profile button. Links to Billing. The plan comes from the server. */
export function PlanBadge({ plan }: { plan: Plan }) {
  return (
    <Link
      href={BILLING_PATH}
      aria-label={`${PLAN_LABEL[plan]} plan. Open billing`}
      className={`inline-flex items-center justify-center rounded-pill ${TAP_MIN} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fg`}
      data-plan={plan}
    >
      <Badge variant={plan === "pro" ? "solid" : "glass"}>{PLAN_LABEL[plan]}</Badge>
    </Link>
  );
}
