import Link from "next/link";

const buttonClass =
  "inline-flex min-h-12 items-center justify-center rounded-[10px] px-4 text-[18px] leading-none font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a84ff] disabled:opacity-50";

export function buttonStyles(variant: "primary" | "secondary" | "quiet" = "primary") {
  if (variant === "quiet") {
    return `${buttonClass} text-[#0a84ff]`;
  }
  if (variant === "secondary") {
    return `${buttonClass} border border-white/15 bg-white/10 text-[#f5f5f4]`;
  }
  return `${buttonClass} bg-[#0a84ff] text-[#0a0a0a]`;
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "quiet";
}) {
  return (
    <button
      className={`${buttonStyles(variant)} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: string;
  variant?: "primary" | "secondary" | "quiet";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className={`${buttonStyles(variant)} ${className}`}>
      {children}
    </Link>
  );
}

export function RecallFrame({
  children,
  homeHref = "/",
  indicator,
  aside,
}: {
  children: React.ReactNode;
  homeHref?: string;
  indicator?: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <div className="recall min-h-screen bg-[#0a0a0a] text-[18px] leading-[1.5] text-[#f5f5f4]">
      <header className="flex min-h-16 items-center justify-between gap-3 border-b border-white/10 px-5">
        <Link href={homeHref} className="font-medium tracking-tight">
          Recall
        </Link>
        <div className="flex items-center gap-2">
          {indicator}
          {aside}
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-5 py-8">{children}</main>
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-[10px] border border-white/10 bg-white/[0.04] p-5 ${className}`}
    >
      {children}
    </section>
  );
}

export function FieldLabel({
  label,
  name,
  type = "text",
  autoComplete,
  value,
  onChange,
  onBlur,
  error,
  showPassword,
  onTogglePassword,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  showPassword?: boolean;
  onTogglePassword?: () => void;
}) {
  const inputType =
    type === "password" ? (showPassword ? "text" : "password") : type;
  const errorId = `${name}-error`;
  return (
    <label className="block">
      <span className="text-[#d6d3d1]">{label}</span>
      <span className="mt-1 flex gap-2">
        <input
          name={name}
          type={inputType}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="min-h-12 w-full rounded-[10px] border border-white/15 bg-transparent px-3 text-[18px] outline-none"
        />
        {type === "password" && onTogglePassword ? (
          <button
            type="button"
            className="min-h-12 shrink-0 rounded-[10px] px-3 text-[#0a84ff]"
            aria-pressed={showPassword}
            onClick={onTogglePassword}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        ) : null}
      </span>
      {error ? (
        <span id={errorId} className="mt-1 block text-[#ffb4ab]" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function FooterLinks() {
  return (
    <footer className="mt-10 flex gap-4 text-[#d6d3d1]">
      <Link href="/privacy" className="min-h-12 py-3 text-[#0a84ff]">
        Privacy policy
      </Link>
      <Link href="/terms" className="min-h-12 py-3 text-[#0a84ff]">
        Terms
      </Link>
    </footer>
  );
}
