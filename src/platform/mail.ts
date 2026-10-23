import { StoreError } from "@/src/platform/db";

const mailFailed = "We couldn't send that email. Try again in a minute.";

function hosted() {
  return process.env.NODE_ENV === "production";
}

function subjectFor(url: string) {
  try {
    return new URL(url).pathname === "/reset"
      ? "Reset your password"
      : "Verify your email";
  } catch {
    return url.includes("/reset") ? "Reset your password" : "Verify your email";
  }
}

function textFor(url: string) {
  const reset = subjectFor(url).startsWith("Reset");
  const action = reset
    ? "Reset your password for The Ordinary:"
    : "Verify your email for The Ordinary:";
  return `${action}\n\n${url}\n\nThis link expires in 24 hours. If you didn't ask for this, you can ignore it.`;
}

export async function deliverPlainEmail(input: { to: string; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) {
    return { ok: false as const, reason: "unconfigured" as const };
  }
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
  } catch {
    return { ok: false as const, reason: "network" as const };
  }
  if (!response.ok) {
    return { ok: false as const, reason: "rejected" as const, status: response.status };
  }
  return { ok: true as const };
}

export async function deliverAccountEmail(email: string, url: string) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!key || !from) {
    if (hosted()) {
      throw new StoreError(mailFailed);
    }
    console.info("verification link", email, url);
    return;
  }

  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: subjectFor(url),
        text: textFor(url),
      }),
    });
  } catch (error) {
    if (hosted()) {
      throw new StoreError(mailFailed);
    }
    console.error("mail send failed", error instanceof Error ? error.name : "error");
    console.info("verification link", email, url);
    return;
  }

  if (!response.ok) {
    if (hosted()) {
      throw new StoreError(mailFailed);
    }
    console.error("mail send failed", response.status);
    console.info("verification link", email, url);
  }
}
