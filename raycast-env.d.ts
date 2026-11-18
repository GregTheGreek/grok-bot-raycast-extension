/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Grok Bot Data Folder - Optional custom Electron user-data folder containing sand-client-persistence. Defaults to ~/Library/Application Support/Grok Bot. */
  "userDataPath"?: string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `send-message` command */
  export type SendMessage = ExtensionPreferences & {}
  /** Preferences accessible in the `bot-wheel` command */
  export type BotWheel = ExtensionPreferences & {}
  /** Preferences accessible in the `open-chat` command */
  export type OpenChat = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `send-message` command */
  export type SendMessage = {
  /** Message */
  "message": string
}
  /** Arguments passed to the `bot-wheel` command */
  export type BotWheel = {
  /** Message */
  "message": string
}
  /** Arguments passed to the `open-chat` command */
  export type OpenChat = {}
}

