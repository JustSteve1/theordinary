import type { BeeSnapshot } from "@/lib/integrations/bee/client";
import type { WhoopSnapshot } from "@/lib/integrations/whoop/client";

export type LiveConnection = {
  name: "WHOOP" | "Bee";
  label: string;
  detail: string;
};

export function whoopConnection(whoop: WhoopSnapshot): LiveConnection {
  if (whoop.status === "ok") {
    return {
      name: "WHOOP",
      label: "Connected",
      detail: "Recovery, sleep, and strain score once a day this week.",
    };
  }
  if (whoop.status === "unconfigured") {
    return {
      name: "WHOOP",
      label: "Not configured",
      detail:
        whoop.message ??
        "Add the WHOOP app credentials on the server before connecting.",
    };
  }
  if (whoop.status === "error") {
    return {
      name: "WHOOP",
      label: "Unavailable",
      detail: whoop.message ?? "WHOOP could not be read.",
    };
  }
  return {
    name: "WHOOP",
    label: "Not connected",
    detail:
      whoop.message ?? "Connect once. This member’s tokens stay on the server.",
  };
}

export function beeConnection(bee: BeeSnapshot): LiveConnection {
  if (bee.status === "ok") {
    return {
      name: "Bee",
      label: "Connected",
      detail: `Reading on this machine. Days use ${bee.timezone}.`,
    };
  }
  if (bee.status === "unauthorized") {
    return {
      name: "Bee",
      label: "Sign in needed",
      detail: "Bee needs you to run bee login on this machine.",
    };
  }
  return {
    name: "Bee",
    label: "Quiet",
    detail: "Bee is quiet. Start bee proxy on this machine.",
  };
}

export const laterConnections = [
  {
    name: "Calendar",
    detail: "Bee already holds today’s brief. It does not score this week yet.",
  },
  {
    name: "Workouts",
    detail:
      "WHOOP already includes workouts. The week still scores the cycle’s strain.",
  },
] as const;
