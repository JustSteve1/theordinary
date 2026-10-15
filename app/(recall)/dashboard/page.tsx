import { redirect } from "next/navigation";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ fixture?: string }>;
}) {
  const fixture = (await searchParams).fixture;
  redirect(fixture ? `/app?fixture=${encodeURIComponent(fixture)}` : "/app");
}
