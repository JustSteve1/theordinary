export function IntegrationSwitch({
  on,
  disabled = false,
}: {
  on: boolean;
  disabled?: boolean;
}) {
  return (
    <span
      className={`relative inline-flex h-[31px] w-[51px] shrink-0 rounded-full ${
        on ? "bg-[#34c759]" : "bg-[#e9e9eb]"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16)] transition-transform ${
          on ? "translate-x-[22px]" : "translate-x-[2px]"
        }`}
      />
    </span>
  );
}

export function WhoopSwitch({
  status,
}: {
  status: "unconfigured" | "disconnected" | "error" | "ok";
}) {
  const on = status === "ok";
  if (status === "unconfigured") {
    return (
      <button
        type="button"
        disabled
        role="switch"
        aria-checked={false}
        aria-label="WHOOP is not configured"
        className="cursor-not-allowed"
      >
        <IntegrationSwitch on={false} disabled />
      </button>
    );
  }

  if (on) {
    return (
      <form action="/api/whoop/disconnect" method="post">
        <button
          type="submit"
          role="switch"
          aria-checked
          aria-label="Turn WHOOP off"
          className="cursor-pointer"
        >
          <IntegrationSwitch on />
        </button>
      </form>
    );
  }

  return (
    <a
      href="/api/whoop/connect"
      role="switch"
      aria-checked={false}
      aria-label="Turn WHOOP on"
      className="cursor-pointer"
    >
      <IntegrationSwitch on={false} />
    </a>
  );
}
