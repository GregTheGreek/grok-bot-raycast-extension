import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "docs/screenshots");
fs.mkdirSync(output, { recursive: true });
const assetsPath = path.join(root, "assets");
const palette = JSON.parse(
  fs.readFileSync(path.join(root, "src/lib/avatar-colors.json"), "utf8"),
);
const examples = [
  ["Research", "sparkle", "cyan"],
  ["Calendar", "clover", "red"],
  ["Inbox", "blob", "orange"],
  ["Writing", "cloud", "violet"],
  ["Tasks", "hex", "green"],
  ["Notes", "star", "yellow"],
  ["Travel", "teardrop", "blue"],
  ["Reading", "square", "magenta"],
  ["Projects", "wedge", "cyan"],
  ["Learning", "flower", "brown"],
  ["Ideas", "bean", "yellow"],
  ["Home", "house", "green"],
];
const bots = examples.map(([name, shape, color], index) => ({
  id: `demo-${index + 1}`,
  name,
  isPinned: index < 2,
  iconPath: path.join(assetsPath, `bot-avatars/${shape}.svg`),
  color: palette[color].dark,
}));
const now = Date.now();
const chat = {
  ...bots[0],
  assetsPath,
  draft: "Could you turn those into three practical next steps?",
  messages: [
    {
      id: "sample-1",
      role: "user",
      text: "I saved a few articles about better research workflows. What should I try first?",
      timestamp: now - 220000,
    },
    {
      id: "sample-2",
      role: "assistant",
      text: "Start with one question you need to answer this week. I grouped your reading into three themes:\n\n• Capture the original source and a short note.\n• Compare the claims across two independent sources.\n• Turn the conclusion into a concrete action.",
      timestamp: now - 210000,
    },
    {
      id: "sample-3",
      role: "user",
      text: "Keep it lightweight. I'd like something I can finish in twenty minutes.",
      timestamp: now - 130000,
    },
    {
      id: "sample-4",
      role: "assistant",
      text: "A twenty-minute pass works well. Spend five minutes on the question, ten on the evidence, and five writing the next step. I put the outline in a short note.",
      timestamp: now - 120000,
    },
    {
      id: "sample-5",
      role: "assistant",
      text: "",
      attachment: "research-outline.md",
      timestamp: now - 110000,
    },
  ],
  previewPath: path.join(output, "chat.png"),
};
execFileSync(path.join(assetsPath, "bot-chat"), [], {
  input: JSON.stringify(chat) + "\n",
  stdio: ["pipe", "pipe", "inherit"],
  timeout: 30000,
});
execFileSync(path.join(assetsPath, "bot-wheel"), [], {
  input: JSON.stringify({
    bots,
    previewPath: path.join(output, "wheel.png"),
  }),
  stdio: ["pipe", "pipe", "inherit"],
  timeout: 30000,
});
const unsafe = {
  ...chat,
  messages: [
    {
      id: "unsafe",
      role: "assistant",
      text: '<img src="https://example.invalid" onerror="window.injected=true">',
      timestamp: now,
    },
  ],
};
const test = execFileSync(path.join(assetsPath, "bot-chat"), ["--self-test"], {
  input: JSON.stringify(unsafe) + "\n",
  stdio: ["pipe", "pipe", "inherit"],
  timeout: 30000,
}).toString();
console.log(test.trim());
console.log("Created README screenshots using sample conversations.");
