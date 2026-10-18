"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { verifyBeeToken } from "@/src/platform/integrations/bee";
import {
  deleteSecrets,
  writeSecret,
} from "@/src/platform/integrations/secrets";
import { getCurrentUser } from "@/src/platform/current-user";
import { field, type FormState } from "@/src/platform/recall/form";

async function member() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requestOrigin() {
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") ??
    headerList.get("host") ??
    "localhost:3000";
  const forwarded = headerList.get("x-forwarded-proto");
  const proto =
    forwarded ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

function refreshIntegrations() {
  revalidatePath("/app");
  revalidatePath("/app/chat");
}

export async function saveBeeToken(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await member();
  const token = field(formData, "token");
  if (token.length < 20) {
    return { error: "Paste the Bee access token." };
  }
  const account = await verifyBeeToken(token);
  if (!account) {
    return { error: "Bee did not accept that token." };
  }
  await writeSecret(user.id, "bee", "access_token", token);
  refreshIntegrations();
  return {};
}

export async function disconnectBee() {
  const user = await member();
  await deleteSecrets(user.id, "bee");
  refreshIntegrations();
}

export async function saveWhoopApp(
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await member();
  const clientId = field(formData, "client_id");
  const clientSecret = field(formData, "client_secret");
  if (clientId.length < 8 || clientSecret.length < 8) {
    return { error: "Enter the WHOOP client id and client secret." };
  }
  const redirectUri = `${await requestOrigin()}/api/whoop/callback`;
  await writeSecret(user.id, "whoop", "client_id", clientId);
  await writeSecret(user.id, "whoop", "client_secret", clientSecret);
  await writeSecret(user.id, "whoop", "redirect_uri", redirectUri);
  refreshIntegrations();
  return {};
}

export async function disconnectWhoopApp() {
  const user = await member();
  await deleteSecrets(user.id, "whoop");
  refreshIntegrations();
}
