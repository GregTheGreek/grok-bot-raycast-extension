import {
  LaunchProps,
  LaunchType,
  Toast,
  closeMainWindow,
  environment,
  getPreferenceValues,
  launchCommand,
  showToast,
} from "@raycast/api";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { nativeAvatar } from "./lib/avatar";
import { dataFolder, loadRoster } from "./lib/roster";

export default async function Command(
  props: LaunchProps<{ arguments: { message?: string } }>,
) {
  try {
    const folder = dataFolder(
      getPreferenceValues<{ userDataPath?: string }>().userDataPath,
    );
    const roster = await loadRoster(folder);
    if (!roster.bots.length)
      throw new Error("Open Grok Bot and wait for its sidebar to load first.");
    const bots = roster.bots.map((bot) => {
      return {
        id: bot.id,
        name: bot.name,
        isPinned: bot.isPinned,
        ...nativeAvatar(bot, folder, environment.assetsPath),
      };
    });
    await closeMainWindow();
    const id = await new Promise<string | undefined>((resolve, reject) => {
      const child = spawn(join(environment.assetsPath, "bot-wheel"), [], {
        stdio: ["pipe", "pipe", "pipe"],
      });
      let output = "";
      const stop = () => {
        child.kill("SIGTERM");
      };
      process.once("exit", stop);
      child.stdout
        .setEncoding("utf8")
        .on("data", (chunk: string) => (output += chunk));
      child.stderr.resume();
      child.on("error", (error) => {
        process.removeListener("exit", stop);
        reject(
          new Error(
            `Could not open Bot Wheel. Run bun run build:native. ${error.message}`,
          ),
        );
      });
      child.on("close", () => {
        process.removeListener("exit", stop);
        try {
          const result: { selectedId?: string; error?: string } =
            JSON.parse(output);
          if (result.error) throw new Error(result.error);
          if (
            result.selectedId &&
            !roster.bots.some((bot) => bot.id === result.selectedId)
          )
            throw new Error("The wheel returned an unknown bot.");
          resolve(result.selectedId || undefined);
        } catch (error) {
          reject(error);
        }
      });
      child.stdin.on("error", () => undefined);
      child.stdin.end(JSON.stringify({ bots }));
    });
    if (id)
      await launchCommand({
        name: "send-message",
        type: LaunchType.UserInitiated,
        arguments: { message: props.arguments.message ?? "" },
        context: {
          botId: id,
          accountSlot: roster.accountSlot,
          selectionId: randomUUID(),
        },
      });
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not open Bot Wheel",
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
