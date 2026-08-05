import type { ComponentProps, ReactNode } from "react";

/**
 * Presentational primitives shared by the admin pages. No hooks and no
 * server-only imports, so these render in both server and client components.
 */

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ button */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity] disabled:cursor-not-allowed disabled:opacity-45";

const BUTTON_VARIANTS = {
  primary:
    "bg-accent text-white shadow-panel hover:bg-accent-hover disabled:hover:bg-accent",
  secondary:
    "border border-line bg-panel text-ink shadow-panel hover:border-line-strong hover:bg-panel-muted",
  ghost: "text-muted hover:bg-panel-muted hover:text-ink",
  danger:
    "border border-danger/30 bg-panel text-danger hover:border-danger/50 hover:bg-danger-soft",
} as const;

const BUTTON_SIZES = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-9.5 px-3.5 text-sm",
  lg: "h-11 px-5 text-sm",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return (
    <button
      {...props}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    />
  );
}

/** Anchor styled as a button, for navigation that looks like an action. */
export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  ...props
}: ComponentProps<"a"> & {
  variant?: keyof typeof BUTTON_VARIANTS;
  size?: keyof typeof BUTTON_SIZES;
}) {
  return (
    <a
      {...props}
      className={cx(
        BUTTON_BASE,
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ fields */

export const fieldClass =
  "w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink shadow-panel transition-colors placeholder:text-subtle hover:border-line-strong focus:border-accent focus:outline-none focus:ring-4 focus:ring-[var(--ring)]";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input {...props} className={cx(fieldClass, className)} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return (
    <textarea {...props} className={cx(fieldClass, "resize-y", className)} />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      {...props}
      className={cx(fieldClass, "cursor-pointer appearance-none bg-[length:16px] bg-[right_0.6rem_center] bg-no-repeat pr-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='%23888' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 6l4 4 4-4'/%3E%3C/svg%3E\")",
        ...props.style,
      }}
    />
  );
}

/** Label + control + hint/error, with the error replacing the hint. */
export function Field({
  label,
  htmlFor,
  error,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-ink">
        {label}
      </label>
      {children}
      {hint && !error && (
        <p className="text-xs leading-relaxed text-subtle">{hint}</p>
      )}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- containers */

export function Card({
  className,
  ...props
}: ComponentProps<"div"> & { className?: string }) {
  return (
    <div
      {...props}
      className={cx(
        "rounded-xl border border-line bg-panel shadow-panel",
        className,
      )}
    />
  );
}

export function PageHeader({
  title,
  count,
  description,
  actions,
}: {
  title: string;
  count?: number;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="flex items-center gap-2.5 text-[22px] font-semibold tracking-tight text-ink">
          {title}
          {count !== undefined && (
            <span className="rounded-md bg-panel-muted px-1.5 py-0.5 text-xs font-medium text-muted tabular-nums ring-1 ring-line">
              {count}
            </span>
          )}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm text-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ badges */

const BADGE_VARIANTS = {
  neutral: "bg-panel-muted text-muted ring-line",
  accent: "bg-accent-soft text-accent-text ring-accent/20",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/25",
} as const;

export function Badge({
  variant = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { variant?: keyof typeof BADGE_VARIANTS }) {
  return (
    <span
      {...props}
      className={cx(
        "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        BADGE_VARIANTS[variant],
        className,
      )}
    />
  );
}

/** A published/draft pill — the same colour everywhere it appears. */
export function StatusBadge({ status }: { status: string }) {
  return status === "published" ? (
    <Badge variant="success">
      <Dot className="text-success" />
      已发布
    </Badge>
  ) : (
    <Badge variant="neutral">
      <Dot className="text-subtle" />
      草稿
    </Badge>
  );
}

function Dot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 6 6" className={cx("size-1.5", className)} aria-hidden>
      <circle cx="3" cy="3" r="3" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------ alerts */

export function Alert({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: ReactNode;
}) {
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : undefined}
      className={cx(
        "mb-5 flex items-start gap-2.5 rounded-lg px-3.5 py-3 text-sm ring-1 ring-inset",
        isError
          ? "bg-danger-soft text-danger ring-danger/25"
          : "bg-success-soft text-success ring-success/25",
      )}
    >
      <span className="mt-px shrink-0">{isError ? <IconAlert /> : <IconCheck />}</span>
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-line-strong px-6 py-14 text-center">
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------- icons */

export function IconCheck() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 8.5l3.5 3.5L13 5" />
    </svg>
  );
}

export function IconAlert() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5v3.5M8 11h.01" />
    </svg>
  );
}

export function IconDoc() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 1.5H4.5A1.5 1.5 0 003 3v10a1.5 1.5 0 001.5 1.5h7A1.5 1.5 0 0013 13V5.5L9 1.5z" />
      <path d="M9 1.5V5.5H13M5.5 8.5h5M5.5 11h3" />
    </svg>
  );
}

export function IconGrid() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="2" y="2" width="5" height="5" rx="1.2" />
      <rect x="9" y="2" width="5" height="5" rx="1.2" />
      <rect x="2" y="9" width="5" height="5" rx="1.2" />
      <rect x="9" y="9" width="5" height="5" rx="1.2" />
    </svg>
  );
}

export function IconTag() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7.3 1.8H2.5a.7.7 0 00-.7.7v4.8c0 .2.07.36.2.5l6 6a.7.7 0 001 0l4.8-4.8a.7.7 0 000-1l-6-6a.7.7 0 00-.5-.2z" />
      <path d="M4.9 4.9h.01" />
    </svg>
  );
}

export function IconPlus() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2.5 4h11M6 4V2.8a.8.8 0 01.8-.8h2.4a.8.8 0 01.8.8V4M12.2 4l-.5 8.4a1.2 1.2 0 01-1.2 1.1H5.5a1.2 1.2 0 01-1.2-1.1L3.8 4" />
    </svg>
  );
}

export function IconSparkle() {
  return (
    <svg viewBox="0 0 16 16" className="size-3" fill="currentColor" aria-hidden>
      <path d="M8 0l1.6 4.6L14 6.2l-4.4 1.6L8 12.4 6.4 7.8 2 6.2l4.4-1.6L8 0z" />
    </svg>
  );
}
