export const siteConfig = {
  name: "The Ordinary",
  tagline: "Something thoughtful is on its way.",
  description:
    "The Ordinary — a new project from 440Hz. Currently in development.",
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
