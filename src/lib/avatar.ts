import type { Image } from "@raycast/api";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import palette from "./avatar-colors.json";
import type { Bot } from "./roster";

const shapes = new Set([
  "blob",
  "pebble",
  "bean",
  "egg",
  "squircle",
  "tablet",
  "capsule",
  "cylinder",
  "hex",
  "gem",
  "crystal",
  "wedge",
  "shield",
  "dome",
  "arch",
  "cloud",
  "teardrop",
  "leaf",
  "square",
  "sparkle",
  "clover",
  "flower",
  "heart",
  "house",
  "star",
  "pumpkin",
]);
const defaultShapes = [
  "blob",
  "pebble",
  "squircle",
  "tablet",
  "wedge",
  "hex",
  "cloud",
  "teardrop",
];
const defaultColors = [
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "cyan",
  "blue",
  "violet",
  "magenta",
  "gray",
] as const;

function hashId(id: string): number {
  let hash = 2166136261;
  for (let index = 0; index < id.length; index++) {
    hash = Math.imul(hash ^ id.charCodeAt(index), 16777619);
  }
  return hash >>> 0;
}

// Match Grok Bot's stable default shape and first Mulberry32 colour sample.
function defaultAvatar(id: string) {
  const hash = hashId(id);
  let mixed = Math.imul(hash ^ (hash >>> 16), 73244475);
  mixed = Math.imul(mixed ^ (mixed >>> 13), 3266489909);
  const shape =
    defaultShapes[((mixed ^ (mixed >>> 16)) >>> 0) % defaultShapes.length];
  const seed = (hash + 1831565813) | 0;
  let sample = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  sample = (sample + Math.imul(sample ^ (sample >>> 7), 61 | sample)) ^ sample;
  const fraction = ((sample ^ (sample >>> 14)) >>> 0) / 4294967296;
  return {
    shape,
    color: defaultColors[Math.floor(fraction * defaultColors.length)],
  };
}

export function botIcon(bot: Bot, folder: string): Image.ImageLike {
  if (bot.avatarPhotoKey) {
    const photo = join(folder, "roster-avatars", bot.avatarPhotoKey);
    if (existsSync(photo)) return { source: photo };
  }
  const defaults = defaultAvatar(bot.id);
  const shape = shapes.has(bot.avatarShape) ? bot.avatarShape : defaults.shape;
  const color = Object.hasOwn(palette, bot.avatarColor)
    ? (bot.avatarColor as keyof typeof palette)
    : defaults.color;
  return { source: `bot-avatars/${shape}.svg`, tintColor: palette[color] };
}

export function nativeAvatar(bot: Bot, folder: string, assetsPath: string) {
  const icon = botIcon(bot, folder) as {
    source: string;
    tintColor?: { dark: string };
  };
  return {
    iconPath: isAbsolute(icon.source)
      ? icon.source
      : join(assetsPath, icon.source),
    color: icon.tintColor?.dark,
  };
}
