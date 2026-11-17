import type { ReactNode } from "react";
import { cn } from "./cn";

type SectionHeadingProps = {
  id?: string;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  className?: string;
};

export function SectionHeading({
  id,
  eyebrow,
  title,
  description,
  align = "center",
  className,
}: SectionHeadingProps) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center", className)}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-medium tracking-[0.2em] text-fg-subtle uppercase">{eyebrow}</p>
      ) : null}
      <h2 id={id} className="text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
        {title}
      </h2>
      {description ? <p className="mt-4 text-base text-pretty text-fg-muted sm:text-lg">{description}</p> : null}
    </div>
  );
}
