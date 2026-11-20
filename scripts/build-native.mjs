import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") {
  throw new Error(
    "The Grok Bot helpers require macOS and Xcode Command Line Tools.",
  );
}

const root = fileURLToPath(new URL("../", import.meta.url));
for (const [source, binary] of [
  ["BotWheel", "bot-wheel"],
  ["BotChat", "bot-chat"],
]) {
  execFileSync(
    "/usr/bin/xcrun",
    [
      "swiftc",
      "-O",
      "-framework",
      "AppKit",
      "-framework",
      "WebKit",
      `${root}native/${source}.swift`,
      "-o",
      `${root}assets/${binary}`,
    ],
    { stdio: "inherit" },
  );
}
