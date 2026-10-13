export const siteConfig = {
  name: "Recall",
  tagline: "A two-minute daily chat about your day.",
  description:
    "A daily check-in about yesterday, and a simple way to see your own trend over time. Recall is not a medical test.",
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  contactEmail: "steve@440hz.uk",
} as const;

export function isSiteLaunched(): boolean {
  return process.env.NEXT_PUBLIC_SITE_LAUNCHED === "true";
}

export function isDevelopment(): boolean {
  return process.env.NODE_ENV === "development";
}

export const PREVIEW_COOKIE_NAME = "site-preview";
