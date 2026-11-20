import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ChatMessage, parseEntries } from "./history";

// Raycast talks to the running Grok Bot app through Chromium's DevTools protocol on a
// loopback-only port, and uses the same renderer stores as Grok Bot's own message box:
// the send journal for sending and the transcript store for live updates. These stores
// are internal to Grok Bot (checked against 1.2.3), so every lookup lives in this file.
const port = 9333;
const bundleId = "com.anysphere.sand";
const run = promisify(execFile);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export interface Conversation {
  messages: ChatMessage[];
  ready: boolean;
  failed: boolean;
  available: boolean;
}

interface Target {
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

async function rendererTarget(): Promise<Target | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(1500),
    });
    const targets = (await response.json()) as Target[];
    return targets.find(
      (target) =>
        target.type === "page" &&
        decodeURI(target.url).endsWith(
          "Grok Bot.app/Contents/Resources/app.asar/dist/renderer/index.html",
        ),
    );
  } catch {
    return undefined;
  }
}

async function isRunning(): Promise<boolean> {
  try {
    await run("/usr/bin/pgrep", ["-f", "Grok Bot.app/Contents/MacOS/Grok Bot"]);
    return true;
  } catch {
    return false;
  }
}

/** Quits Grok Bot if it is running and reopens it in the background with the debugging port. */
export async function relaunchGrok(): Promise<void> {
  if (await isRunning()) {
    await run("/usr/bin/osascript", [
      "-e",
      `tell application id "${bundleId}" to quit`,
    ]).catch(() => undefined);
    for (let i = 0; i < 40 && (await isRunning()); i++) await sleep(250);
    if (await isRunning())
      throw new Error(
        "Grok Bot didn’t quit. Quit it yourself, then open the chat again.",
      );
  }
  await run("/usr/bin/open", [
    "-g",
    "-b",
    bundleId,
    "--args",
    `--remote-debugging-port=${port}`,
    "--remote-debugging-address=127.0.0.1",
  ]);
  for (let i = 0; i < 80; i++) {
    if (await rendererTarget()) return;
    await sleep(250);
  }
  throw new Error(
    "Grok Bot reopened, but its window didn’t become available to Raycast.",
  );
}

// Page-side expression for Grok Bot's app services, a React context value found by
// walking up the component tree from rendered elements.
const services = `(() => {
  for (const element of document.querySelectorAll("body *")) {
    const key = Object.keys(element).find((name) => name.startsWith("__reactFiber"));
    for (let fiber = key ? element[key] : null; fiber; fiber = fiber.return) {
      const value = fiber.memoizedProps && fiber.memoizedProps.value;
      if (value && typeof value === "object" && value.sendJournal && typeof value.sendJournal.sendPrompt === "function" && value.transcript && typeof value.transcript.snapshotsFor === "function" && value.roster) return value;
    }
  }
  throw new Error("Raycast couldn’t reach Grok Bot’s conversations. This Grok Bot version may be unsupported.");
})()`;

const watchPage = `async (agentId, accountSlot, sink) => {
  const app = ${services};
  if (app.accountSlot !== accountSlot) throw new Error("The Grok Bot account changed. Choose the bot again from the current list.");
  const registry = (window.__raycastGrok = window.__raycastGrok || {});
  const transcript = app.transcript;
  const pick = (entry) => ({ id: entry.id, kind: entry.kind, role: entry.role, fromAgent: entry.fromAgent, content: entry.content,
    file_name: entry.file_name, timestampMs: entry.timestampMs,
    message: entry.message && { type: entry.message.type, content: entry.message.content, file_name: entry.message.file_name } });
  let last = "", queued = false, stopped = false;
  const offs = [];
  const stop = () => {
    if (stopped) return;
    stopped = true;
    for (const off of offs) if (typeof off === "function") off();
    delete registry[sink];
  };
  const publish = () => {
    queued = false;
    if (stopped) return;
    const snapshot = transcript.snapshotsFor(agentId).get();
    const roster = app.roster.snapshots.get();
    const state = JSON.stringify({
      ready: snapshot.loadState === "ready", failed: !!snapshot.failure,
      available: app.accountSlot === accountSlot && (roster.agentsById.has(agentId) || !roster.hasCompleteRoster),
      entries: snapshot.entries.slice(-300).map(pick),
    });
    if (state === last) return;
    last = state;
    try { window[sink](state); } catch { stop(); }
  };
  const schedule = () => { if (!queued) { queued = true; queueMicrotask(publish); } };
  registry[sink] = stop;
  offs.push(transcript.observeEntries(agentId, schedule), transcript.snapshotsFor(agentId).subscribe(schedule), app.roster.snapshots.subscribe(schedule));
  publish();
}`;

const sendPage = `async (agentId, accountSlot, prompt) => {
  const app = ${services};
  await Promise.resolve(window.desktop?.main?.signalBoxIntent?.({ agentId, intent: "composer_focus" })).catch(() => {});
  let nonce = null;
  try {
    await app.sendJournal.sendPrompt({ agentId, prompt, expectedAccountSlot: accountSlot, onNonceAssigned: (assigned) => { nonce = assigned.nonce; } });
  } catch (error) {
    const code = error && error.failure && error.failure.code;
    throw new Error("Grok Bot didn’t send the message" + (code ? " (" + code + ")" : "") + ". Nothing was sent, so you can try again.");
  }
  // A resolved send is in Grok Bot's durable journal; "queued" ones wait for the connection or the bot.
  const record = app.sendJournal.snapshots.get().records.find((item) => item.nonce === nonce);
  return record && record.phase === "queued" ? "queued" : "sent";
}`;

export class GrokApp {
  private nextId = 0;
  private pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private bindings = new Map<string, (payload: string) => void>();
  private closeHandlers: (() => void)[] = [];

  private constructor(private socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Runtime.bindingCalled")
        return this.bindings.get(message.params.name)?.(message.params.payload);
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    socket.addEventListener("close", () => {
      for (const request of this.pending.values())
        request.reject(new Error("Grok Bot closed its connection to Raycast."));
      this.pending.clear();
      for (const handler of this.closeHandlers) handler();
    });
  }

  /** Connects to a Grok Bot window that has the debugging port, or returns undefined. */
  static async connect(): Promise<GrokApp | undefined> {
    const target = await rendererTarget();
    if (!target) return undefined;
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener("open", () => resolve(), { once: true });
      socket.addEventListener(
        "error",
        () => reject(new Error("Raycast couldn’t connect to Grok Bot.")),
        { once: true },
      );
    });
    const app = new GrokApp(socket);
    await app.command("Runtime.enable");
    return app;
  }

  private command<T>(method: string, params: object = {}): Promise<T> {
    const id = ++this.nextId;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise<T>((resolve, reject) =>
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
      }),
    );
  }

  private async call<T = void>(fn: string, ...args: unknown[]): Promise<T> {
    const result = await this.command<{
      result: { value: T };
      exceptionDetails?: { text: string; exception?: { description?: string } };
    }>("Runtime.evaluate", {
      expression: `(${fn})(...${JSON.stringify(args)})`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      const description = result.exceptionDetails.exception?.description;
      throw new Error(
        description?.replace(/^Error: /, "").split("\n")[0] ||
          result.exceptionDetails.text,
      );
    }
    return result.result.value;
  }

  /** Streams a bot's conversation from Grok Bot's transcript store until close(). */
  async watch(
    botId: string,
    accountSlot: string,
    onChange: (conversation: Conversation) => void,
  ): Promise<void> {
    const sink = `__raycastGrok_${process.pid}_${this.bindings.size}`;
    this.bindings.set(sink, (payload) => {
      const state = JSON.parse(payload);
      onChange({ ...state, messages: parseEntries(state.entries) });
    });
    await this.command("Runtime.addBinding", { name: sink });
    await this.call(watchPage, botId, accountSlot, sink);
  }

  /** Queues the message in Grok Bot's send journal, which delivers it like the app's message box. */
  send(
    botId: string,
    accountSlot: string,
    text: string,
  ): Promise<"sent" | "queued"> {
    return this.call(sendPage, botId, accountSlot, text);
  }

  onClose(handler: () => void) {
    this.closeHandlers.push(handler);
  }

  async close() {
    const sinks = JSON.stringify([...this.bindings.keys()]);
    await this.call(
      `() => { for (const sink of ${sinks}) window.__raycastGrok?.[sink]?.(); }`,
    ).catch(() => undefined);
    this.socket.close();
  }
}
