import { mkdir, readFile, rename, writeFile } from "fs/promises";
import path from "path";

function dataPath(name: string) {
  return path.join(process.cwd(), ".data", name);
}

export async function readJsonFile<T>(name: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(dataPath(name), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(name: string, value: unknown) {
  const directory = path.join(process.cwd(), ".data");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const target = dataPath(name);
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporary, target);
}
