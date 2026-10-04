import { readJsonFile, writeJsonFile } from "@/lib/data-file";

const CONNECTIONS_FILE = "connections.json";

export type Connection = {
  userId: string;
  provider: "whoop";
  providerUserId: string;
  scopes: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

type ConnectionFile = {
  connections: Connection[];
};

export async function getConnection(
  userId: string,
  provider: Connection["provider"],
): Promise<Connection | null> {
  const file = await readConnections();
  return (
    file.connections.find(
      (connection) =>
        connection.userId === userId && connection.provider === provider,
    ) ?? null
  );
}

export async function saveConnection(connection: Connection) {
  const file = await readConnections();
  const index = file.connections.findIndex(
    (entry) =>
      entry.userId === connection.userId &&
      entry.provider === connection.provider,
  );
  if (index >= 0) {
    file.connections[index] = connection;
  } else {
    file.connections.push(connection);
  }
  await writeJsonFile(CONNECTIONS_FILE, file);
}

export async function deleteConnection(
  userId: string,
  provider: Connection["provider"],
) {
  const file = await readConnections();
  file.connections = file.connections.filter(
    (connection) =>
      !(connection.userId === userId && connection.provider === provider),
  );
  await writeJsonFile(CONNECTIONS_FILE, file);
}

async function readConnections(): Promise<ConnectionFile> {
  const file = await readJsonFile<ConnectionFile>(CONNECTIONS_FILE, {
    connections: [],
  });
  if (!file || !Array.isArray(file.connections)) {
    return { connections: [] };
  }
  return file;
}
