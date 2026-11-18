import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

export interface Bot {
  id: string;
  name: string;
  description: string;
  isGroup: boolean;
  hasUnread: boolean;
  lastActivityAt: number;
  isPinned: boolean;
  avatarShape: string;
  avatarColor: string;
  avatarPhotoKey?: string;
}

export interface Roster {
  accountSlot: string;
  bots: Bot[];
}

const alphabet = "abcdefghijklmnopqrstuvwxyz234567";

// Grok Bot encodes UTF-8 persistence keys as unpadded, lowercase Base32 filenames.
export function persistenceFilename(key: string): string {
  let buffer = 0;
  let bits = 0;
  let encoded = "";
  for (const byte of Buffer.from(key, "utf8")) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      encoded += alphabet[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  if (bits > 0) encoded += alphabet[(buffer << (5 - bits)) & 31];
  return `${encoded}.blob`;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseRoster(
  value: unknown,
  pinnedIds: readonly string[] = [],
): Bot[] {
  if (
    !record(value) ||
    value.schemaVersion !== 4 ||
    !record(value.value) ||
    !Array.isArray(value.value.rows)
  ) {
    throw new Error(
      "Unsupported Grok Bot roster format. This extension supports the Grok Bot 1.2 roster cache (schema 4).",
    );
  }
  const bots = new Map<string, Bot>();
  const pinned = new Set(pinnedIds);
  for (const row of value.value.rows) {
    if (
      !record(row) ||
      typeof row.id !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(row.id)
    )
      continue;
    if (row.isHiddenFromSidebar === true || row.isRemovedFromSidebar === true)
      continue;
    bots.set(row.id, {
      id: row.id,
      name:
        typeof row.name === "string" && row.name.trim()
          ? row.name
          : "Untitled Bot",
      description: typeof row.description === "string" ? row.description : "",
      isGroup: row.isGroup === true,
      hasUnread: row.hasUnread === true,
      lastActivityAt:
        typeof row.lastActivityAt === "number" ? row.lastActivityAt : 0,
      isPinned: pinned.has(row.id),
      avatarShape: typeof row.avatarShape === "string" ? row.avatarShape : "",
      avatarColor: typeof row.avatarColor === "string" ? row.avatarColor : "",
      avatarPhotoKey:
        record(row.avatarPhoto) &&
        typeof row.avatarPhoto.key === "string" &&
        /^[0-9a-f]{32}$/.test(row.avatarPhoto.key)
          ? row.avatarPhoto.key
          : undefined,
    });
  }
  return [...bots.values()].sort(
    (a, b) =>
      Number(b.isPinned) - Number(a.isPinned) ||
      b.lastActivityAt - a.lastActivityAt ||
      a.name.localeCompare(b.name),
  );
}

export function dataFolder(customPath?: string): string {
  const path = customPath?.trim();
  if (!path)
    return join(homedir(), "Library", "Application Support", "Grok Bot");
  return path.replace(/^~(?=\/|$)/, homedir());
}

async function readSlice(folder: string, key: string): Promise<unknown> {
  return JSON.parse(
    await readFile(
      join(folder, "sand-client-persistence", persistenceFilename(key)),
      "utf8",
    ),
  );
}

async function loadPinnedIds(
  folder: string,
  accountPrefix: string,
): Promise<string[]> {
  let refs: unknown;
  try {
    refs = await readSlice(folder, `${accountPrefix}.ui-agent-refs`);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
  if (
    !record(refs) ||
    refs.schemaVersion !== 1 ||
    !record(refs.value) ||
    !Array.isArray(refs.value.pinnedAgentIds)
  )
    return [];
  return refs.value.pinnedAgentIds.filter(
    (id): id is string => typeof id === "string",
  );
}

export async function loadRoster(folder: string): Promise<Roster> {
  try {
    const account = await readSlice(
      folder,
      "sand.client.slice.client-meta.account-slot",
    );
    if (
      !record(account) ||
      account.schemaVersion !== 1 ||
      typeof account.value !== "string" ||
      !account.value
    ) {
      throw new Error("Open Grok Bot and sign in to load your bots.");
    }
    const accountPrefix = `sand.client.slice.account.${encodeURIComponent(account.value)}`;
    const bots = parseRoster(
      await readSlice(folder, `${accountPrefix}.roster.last-roster`),
      await loadPinnedIds(folder, accountPrefix),
    );
    return { accountSlot: account.value, bots };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      throw new Error(
        "Grok Bot’s local bot index is missing. Open Grok Bot, wait for the sidebar to load, then refresh. Check the data folder in extension preferences if needed.",
      );
    }
    throw error;
  }
}

export function chatLink(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new Error("Invalid bot ID.");
  return `grokbot://app/v1/agent?id=${encodeURIComponent(id)}`;
}
