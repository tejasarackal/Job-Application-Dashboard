import Link from "next/link";
import { classNames } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  // When provided, the whole card becomes a clickable link to this route.
  // Adds a hover affordance (shadow lift + indigo border tint + "→" indicator).
  href?: string;
}

const baseClass =
  "bg-white border border-brand-border rounded-card shadow-card";
const interactiveClass =
  "group relative cursor-pointer transition-shadow hover:shadow-cardHover hover:border-brand-ink/30";

export function Card({ children, className, href }: CardProps) {
  if (href) {
    return (
      <Link
        href={href}
        className={classNames(baseClass, interactiveClass, "block", className)}
      >
        {children}
        <span
          aria-hidden
          className="absolute top-3 right-4 text-brand-ink opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0"
        >
          →
        </span>
      </Link>
    );
  }
  return <div className={classNames(baseClass, className)}>{children}</div>;
}

interface CardHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  className?: string;
}

export function CardHeader({ title, subtitle, right, className }: CardHeaderProps) {
  return (
    <div className={classNames("px-6 pt-5 pb-4 flex items-start justify-between gap-4", className)}>
      <div>
        <h2 className="text-[16px] font-semibold text-brand-heading leading-tight">{title}</h2>
        {subtitle && <p className="text-[12px] text-brand-muted mt-1">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}

export function CardBody({
  children,
  className,
  padded = true,
}: {
  children: React.ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <div className={classNames(padded ? "px-6 pb-5" : "", className)}>{children}</div>
  );
}
