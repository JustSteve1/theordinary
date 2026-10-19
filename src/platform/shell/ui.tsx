import Link from "next/link";

const buttonClass =
  "flex items-center text-[13px] font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0a84ff] disabled:opacity-50";

export const sectionLabel =
  "text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase";

export function buttonStyles(variant: "primary" | "secondary" | "quiet" = "primary") {
  if (variant === "secondary") {
    return `${buttonClass} text-stone-400`;
  }
  return `${buttonClass} text-[#0a84ff]`;
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

const nav = [
  { href: "/map", label: "Journey" },
  { href: "/home", label: "Home" },
  { href: "/app", label: "Membership" },
  { href: "/settings", label: "Settings" },
];

export function RecallFrame({
  children,
  homeHref = "/home",
  indicator,
  account,
  wide = false,
}: {
  children: React.ReactNode;
  homeHref?: string;
  indicator?: React.ReactNode;
  account?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-base leading-6 text-stone-100">
      <header className="border-b border-white/10">
        <div className="flex h-12 items-center justify-between gap-3 px-4">
          <Link href={homeHref} className="font-medium tracking-tight">
            The Ordinary
          </Link>
          <div className="flex items-center gap-4">
            {indicator}
            {account ?? (
              <Link href="/login" className="text-[#0a84ff]">
                Log in
              </Link>
            )}
          </div>
        </div>
        <nav className="flex gap-4 overflow-x-auto px-4 pb-3">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="shrink-0 text-[#0a84ff]">
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main
        className={`mx-auto w-full px-4 py-5 ${wide ? "max-w-6xl" : "max-w-2xl"}`}
      >
        {children}
      </main>
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
      className={`rounded-[10px] border border-white/10 p-4 ${className}`}
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
      <span className="text-stone-400">{label}</span>
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
          className="h-9 w-full rounded-[10px] border border-white/15 bg-transparent px-3 text-[13px] text-white outline-none focus:border-[#0a84ff]"
        />
        {type === "password" && onTogglePassword ? (
          <button
            type="button"
            className="shrink-0 px-2 text-[#0a84ff]"
            aria-pressed={showPassword}
            onClick={onTogglePassword}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        ) : null}
      </span>
      {error ? (
        <span id={errorId} className="mt-1 block text-white" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}

export function FooterLinks() {
  return (
    <footer className="mt-8 flex gap-4">
      <Link href="/privacy" className="text-[#0a84ff]">
        Privacy policy
      </Link>
      <Link href="/terms" className="text-[#0a84ff]">
        Terms
      </Link>
    </footer>
  );
}
