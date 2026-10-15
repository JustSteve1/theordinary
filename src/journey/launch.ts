import type { LaunchMap } from "@/src/features/hello-world";

/** Where Hello World sends someone. The home feature does not choose these. */
export const homeLaunch: LaunchMap = {
  checkin: "/checkin",
  trend: "/dashboard",
  dashboard: "/app",
  settings: "/settings",
};
