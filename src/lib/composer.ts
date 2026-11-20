import {
  Alert,
  LocalStorage,
  LaunchType,
  Toast,
  closeMainWindow,
  confirmAlert,
  environment,
  launchCommand,
  open,
  showToast,
} from "@raycast/api";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { nativeAvatar } from "./avatar";
import { GrokApp, relaunchGrok } from "./grok-app";
import { loadHistory } from "./history";
import { Bot, chatLink, loadRoster } from "./roster";

async function connectGrok(): Promise<GrokApp> {
  const connected = await GrokApp.connect();
  if (connected) return connected;
  const restart = await confirmAlert({
    title: "Restart Grok Bot for Raycast?",
    message:
      "Raycast messages your bots through Grok Bot itself. Grok Bot will quit and reopen with a debugging port that only programs on this Mac can reach. It stays open until Grok Bot next quits, and any program on this Mac can use it to act in Grok Bot as you.",
    primaryAction: {
      title: "Restart Grok Bot",
      style: Alert.ActionStyle.Default,
    },
  });
  if (!restart)
    throw new Error(
      "Messaging from Raycast needs Grok Bot’s debugging port. Use Open Bot Chat to message in Grok Bot instead.",
    );
  const toast = await showToast({
    style: Toast.Style.Animated,
    title: "Restarting Grok Bot",
  });
  await relaunchGrok();
  await toast.hide();
  const app = await GrokApp.connect();
  if (!app) throw new Error("Raycast couldn’t connect to Grok Bot.");
  return app;
}

export async function openComposer(
  bot: Bot,
  folder: string,
  accountSlot: string,
  initialMessage: string,
) {
  const current = await loadRoster(folder);
  if (
    current.accountSlot !== accountSlot ||
    !current.bots.some((item) => item.id === bot.id && item.name === bot.name)
  ) {
    throw new Error(
      "The account or bot changed. Select the bot again from the current list.",
    );
  }
  const key = `chat-draft-${createHash("sha256").update(`${accountSlot}/${bot.id}`).digest("hex")}`;
  const saved = await LocalStorage.getItem<string>(key);
  let draft = initialMessage || (typeof saved === "string" ? saved : "");
  const messages = await loadHistory(folder, accountSlot, bot.id).catch(
    () => [],
  );
  const grok = await connectGrok();
  await closeMainWindow();
  const result = await new Promise<{ type: string; back?: boolean }>(
    (resolve, reject) => {
      const child = spawn(join(environment.assetsPath, "bot-chat"), [], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let buffer = "";
      let closed = false;
      let sending = false;
      let liveFailed = false;
      let closeResult: { type: string; back?: boolean } | undefined;
      let saveTimer: ReturnType<typeof setTimeout> | undefined;
      let saves = Promise.resolve();
      const persist = () => {
        const value = draft;
        saves = saves
          .catch(() => undefined)
          .then(() => LocalStorage.setItem(key, value));
        return saves;
      };
      const write = (state: object) => {
        if (!closed && !child.stdin.destroyed)
          child.stdin.write(`${JSON.stringify(state)}\n`);
      };
      const stop = () => {
        child.kill("SIGTERM");
      };
      process.once("exit", stop);
      const fail = (status: string, canSend: boolean) => {
        liveFailed = true;
        write({ canSend, status, error: true });
      };
      grok.onClose(() =>
        fail(
          "Grok Bot closed. Open it, then open this chat again to keep messaging.",
          false,
        ),
      );
      grok
        .watch(bot.id, accountSlot, (conversation) => {
          if (!conversation.available)
            return fail(
              "The Grok Bot account or bot changed. Close this window and choose the bot again.",
              false,
            );
          if (conversation.failed)
            return fail(
              "Recent messages are unavailable. Open this chat in Grok Bot to refresh them.",
              true,
            );
          if (!conversation.ready) return;
          write({
            messages: conversation.messages,
            canSend: true,
            ...(liveFailed ? { status: "", error: false } : {}),
          });
          liveFailed = false;
        })
        .catch((error) =>
          fail(error instanceof Error ? error.message : String(error), false),
        );
      const handle = async (event: {
        type?: string;
        text?: string;
        draft?: string;
        back?: boolean;
        error?: string;
      }) => {
        if (event.error) {
          reject(new Error(event.error));
          child.kill("SIGTERM");
          return;
        }
        if (event.type === "draft" && typeof event.text === "string") {
          draft = event.text;
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            void persist().catch(() =>
              write({ status: "The draft could not be saved.", error: true }),
            );
          }, 250);
        }
        if (event.type === "close" || event.type === "open") {
          if (typeof event.draft === "string") draft = event.draft;
          closeResult = { type: event.type, back: event.back };
        }
        if (
          event.type !== "send" ||
          typeof event.text !== "string" ||
          !event.text.trim() ||
          sending
        )
          return;
        sending = true;
        draft = event.text;
        clearTimeout(saveTimer);
        try {
          await persist();
          const delivery = await grok.send(bot.id, accountSlot, event.text);
          if (closed) return;
          draft = "";
          write({
            sending: false,
            clearDraft: true,
            status:
              delivery === "queued"
                ? "Queued. Grok Bot will send it when it can."
                : "Sent",
            error: false,
          });
          await persist().catch(() =>
            write({
              status: "Sent. The saved draft could not be cleared.",
              error: true,
            }),
          );
        } catch (error) {
          write({
            sending: false,
            status: error instanceof Error ? error.message : String(error),
            error: true,
          });
        } finally {
          sending = false;
        }
      };
      child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
        buffer += chunk;
        let newline: number;
        while ((newline = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newline);
          buffer = buffer.slice(newline + 1);
          try {
            const event: unknown = JSON.parse(line);
            if (!event || typeof event !== "object" || Array.isArray(event))
              throw new Error("Invalid chat event.");
            void handle(event).catch((error) => {
              reject(error);
              child.kill("SIGTERM");
            });
          } catch {
            reject(new Error("The chat window returned an invalid response."));
            child.kill("SIGTERM");
          }
        }
      });
      child.stderr.resume();
      child.stdin.on("error", () => undefined);
      child.on("error", (error) => {
        void grok.close();
        process.removeListener("exit", stop);
        reject(
          new Error(
            `Could not open the chat window. Run bun run build:native. ${error.message}`,
          ),
        );
      });
      child.on("close", () => {
        closed = true;
        void grok.close();
        clearTimeout(saveTimer);
        process.removeListener("exit", stop);
        void persist()
          .then(() =>
            closeResult
              ? resolve(closeResult)
              : reject(
                  new Error(
                    "The chat window closed unexpectedly. Your draft was saved. Check Grok Bot before sending it again.",
                  ),
                ),
          )
          .catch(reject);
      });
      write({
        name: bot.name,
        ...nativeAvatar(bot, folder, environment.assetsPath),
        assetsPath: environment.assetsPath,
        draft,
        messages,
      });
    },
  );
  if (result.type === "open")
    await open(chatLink(bot.id), "com.anysphere.sand");
  else if (result.back)
    await launchCommand({
      name: "send-message",
      type: LaunchType.UserInitiated,
    });
}
