import { BeeTokenForm, WhoopAppForm } from "@/src/features/integrations/forms";
import {
  disconnectBee,
  requestOrigin,
} from "@/src/features/integrations/actions";
import { loadBee } from "@/src/platform/integrations/bee";
import { loadWhoop, whoopAppStatus } from "@/src/platform/integrations/whoop";
import { getCurrentUser } from "@/src/platform/current-user";
import { sectionLabel } from "@/src/platform/shell/ui";
import { redirect } from "next/navigation";

export async function IntegrationsPanel({ notice }: { notice?: string }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const [bee, whoop, app, origin] = await Promise.all([
    loadBee(user.id),
    loadWhoop(user.id),
    whoopAppStatus(user.id),
    requestOrigin(),
  ]);
  const redirectUri = `${origin}/api/whoop/callback`;
  const savedBee = bee.via === "account" && bee.status === "ok";

  return (
    <section className="rounded-[10px] border border-white/10 p-6">
      <p className={sectionLabel}>Integrations</p>
      <h2 className="mt-3 text-[22px] font-medium tracking-tight">
        Connections
      </h2>
      <p className="mt-2 max-w-md text-[13px] leading-5 text-stone-400">
        Bee and WHOOP are read from here. The chat uses this list, so another
        account can be added without changing the chat.
      </p>

      <div className="mt-6 rounded-[10px] border border-white/10 p-4">
        <h3 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          Bee
        </h3>
        <p className="mt-3 text-[13px] leading-5 text-stone-300">
          {savedBee
            ? `Connected as ${bee.name ?? "your Bee account"}.`
            : bee.status === "ok"
              ? `This machine is signed in${bee.name ? ` as ${bee.name}` : ""}. Save a token to keep it on your account.`
              : bee.status === "unauthorized"
                ? "The saved Bee token was not accepted."
                : "Not connected. Paste the bearer token from your Bee developer login."}
        </p>
        <BeeTokenForm />
        {bee.via === "account" ? (
          <form action={disconnectBee} className="mt-3">
            <button type="submit" className="text-[#0a84ff]">
              Disconnect Bee
            </button>
          </form>
        ) : null}
      </div>

      <div className="mt-4 rounded-[10px] border border-white/10 p-4">
        <h3 className="text-[11px] font-medium tracking-[0.16em] text-stone-500 uppercase">
          WHOOP
        </h3>
        {whoop.status === "ok" ? (
          <p className="mt-3 text-[13px] leading-5 text-stone-300">
            Connected.
            {whoop.recovery?.detail ? ` ${whoop.recovery.detail}.` : ""}
            {whoop.sleep?.detail ? ` ${whoop.sleep.detail}.` : ""}
            {whoop.strain?.detail ? ` ${whoop.strain.detail}.` : ""}
          </p>
        ) : (
          <p className="mt-3 text-[13px] leading-5 text-stone-300">
            {app.ready
              ? "App credentials are saved. Authorize WHOOP to finish."
              : "Add the WHOOP app credentials, then authorize the account."}
          </p>
        )}
        {notice === "error" ? (
          <p className="mt-3 text-[13px] text-[#ffb4ab]" role="alert">
            WHOOP did not connect. Check the redirect URL and try again.
          </p>
        ) : null}
        {notice === "unconfigured" ? (
          <p className="mt-3 text-[13px] text-[#ffb4ab]" role="alert">
            Save the WHOOP client id and secret before authorizing.
          </p>
        ) : null}
        {whoop.status === "error" && whoop.message ? (
          <p className="mt-3 text-[13px] text-stone-400">{whoop.message}</p>
        ) : null}
        {whoop.status === "ok" ? (
          <form action="/api/whoop/disconnect" method="post" className="mt-4">
            <button type="submit" className="text-[#0a84ff]">
              Disconnect WHOOP
            </button>
          </form>
        ) : app.ready ? (
          <a
            href="/api/whoop/connect"
            className="mt-4 inline-block text-[#0a84ff]"
          >
            Authorize WHOOP
          </a>
        ) : null}
        <WhoopAppForm redirectUri={app.redirectUri ?? redirectUri} />
      </div>
    </section>
  );
}
