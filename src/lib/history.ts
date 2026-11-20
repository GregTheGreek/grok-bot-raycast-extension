import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { chatLink, loadRoster, persistenceFilename } from "./roster";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  timestamp: number;
  attachment?: string;
}

export function parseHistory(value: unknown): ChatMessage[] {
  const cache = value as {
    schemaVersion?: number;
    value?: { entries?: unknown[] };
  };
  if (cache?.schemaVersion !== 1 || !Array.isArray(cache.value?.entries))
    throw new Error("Unsupported Grok Bot conversation cache.");
  return parseEntries(cache.value.entries);
}

// Grok Bot's cache and its live transcript store share these entry shapes.
export function parseEntries(entries: unknown[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const raw of entries) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.id !== "string") continue;
    const message = entry.message as
      { type?: string; content?: string; file_name?: string } | undefined;
    let text: string | undefined;
    let role: ChatMessage["role"] = "assistant";
    let attachment: string | undefined;
    if (entry.kind === "message" && entry.role === "user" && !entry.fromAgent) {
      role = "user";
      if (typeof entry.content === "string") text = entry.content;
    } else if (
      entry.kind === "send-message" &&
      message?.type === "text" &&
      typeof message.content === "string"
    ) {
      text = message.content;
    } else if (
      entry.kind === "send-message" &&
      message?.type === "attachment" &&
      typeof message.file_name === "string"
    ) {
      text = "";
      attachment = message.file_name;
    } else if (
      entry.kind === "user-attachment" &&
      typeof entry.file_name === "string"
    ) {
      role = "user";
      text = "";
      attachment = entry.file_name;
    }
    if (text === undefined || (!text.trim() && !attachment)) continue;
    messages.push({
      id: entry.id,
      role,
      text,
      attachment,
      timestamp: typeof entry.timestampMs === "number" ? entry.timestampMs : 0,
    });
  }
  return messages.slice(-60);
}

export async function loadHistory(
  folder: string,
  accountSlot: string,
  botId: string,
): Promise<ChatMessage[]> {
  chatLink(botId);
  if ((await loadRoster(folder)).accountSlot !== accountSlot)
    throw new Error(
      "The Grok Bot account changed. Close this window and select the bot again.",
    );
  let messages: ChatMessage[];
  try {
    const key = `sand.client.slice.account.${encodeURIComponent(accountSlot)}.transcript.replicas.${botId}`;
    messages = parseHistory(
      JSON.parse(
        await readFile(
          join(folder, "sand-client-persistence", persistenceFilename(key)),
          "utf8",
        ),
      ),
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return [];
    throw error;
  }
  if ((await loadRoster(folder)).accountSlot !== accountSlot)
    throw new Error(
      "The Grok Bot account changed. Close this window and select the bot again.",
    );
  return messages;
}
