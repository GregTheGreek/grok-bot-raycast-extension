import {
  Action,
  ActionPanel,
  Color,
  Icon,
  LaunchProps,
  List,
  Toast,
  closeMainWindow,
  getPreferenceValues,
  open,
  openExtensionPreferences,
  showToast,
  Keyboard,
} from "@raycast/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { openComposer } from "./lib/composer";
import { Bot, Roster, chatLink, dataFolder, loadRoster } from "./lib/roster";
import { botIcon } from "./lib/avatar";
import { numberSelection } from "./lib/number-selection";

type Mode = "message" | "open";
export type Props = LaunchProps<{
  arguments: { message?: string };
  launchContext: { botId?: string; accountSlot?: string; selectionId?: string };
}>;

async function openChat(bot: Bot) {
  try {
    await open(chatLink(bot.id), "com.anysphere.sand");
    await closeMainWindow();
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: "Could not open chat",
      message: String(error),
    });
  }
}

export function Bots({
  mode,
  initialMessage = "",
  target,
}: {
  mode: Mode;
  initialMessage?: string;
  target?: Props["launchContext"];
}) {
  const folder = dataFolder(
    getPreferenceValues<{ userDataPath?: string }>().userDataPath,
  );
  const [roster, setRoster] = useState<Roster>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const refreshing = useRef(false);
  const [searchText, setSearchText] = useState("");
  const numberSnapshot = useRef<Roster | undefined>(undefined);
  const numberTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const targetOpened = useRef<string | undefined>(undefined);

  const refresh = useCallback(async () => {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      setRoster(await loadRoster(folder));
      setError(undefined);
    } catch (error) {
      setRoster(undefined);
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
      refreshing.current = false;
    }
  }, [folder]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const composerOpen = useRef(false);
  const compose = useCallback(
    async (bot: Bot, accountSlot = roster?.accountSlot) => {
      clearTimeout(numberTimer.current);
      numberSnapshot.current = undefined;
      setSearchText("");
      if (!accountSlot || composerOpen.current) return;
      composerOpen.current = true;
      try {
        await openComposer(bot, folder, accountSlot, initialMessage);
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not open conversation",
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        composerOpen.current = false;
      }
    },
    [folder, initialMessage, roster?.accountSlot],
  );

  useEffect(() => () => clearTimeout(numberTimer.current), []);

  useEffect(() => {
    if (!roster || !target?.botId) return;
    const key = `${target.selectionId ?? ""}/${target.accountSlot}/${target.botId}`;
    if (targetOpened.current === key) return;
    targetOpened.current = key;
    const bot = roster.bots.find((bot) => bot.id === target.botId);
    if (!bot || roster.accountSlot !== target.accountSlot) {
      void showToast({
        style: Toast.Style.Failure,
        title: "Bot selection changed",
        message: "Select the bot again from the current account.",
      });
      return;
    }
    compose(bot, roster.accountSlot);
  }, [
    compose,
    roster,
    target?.botId,
    target?.accountSlot,
    target?.selectionId,
  ]);

  function search(text: string) {
    clearTimeout(numberTimer.current);
    setSearchText(text);
    if (!/^\d+$/.test(text)) {
      numberSnapshot.current = undefined;
      return;
    }
    numberSnapshot.current ??= roster;
    const snapshot = numberSnapshot.current;
    if (!snapshot) return;
    const selection = numberSelection(text, snapshot.bots.length);
    if (!selection) return;
    const select = () => {
      compose(snapshot.bots[selection.index], snapshot.accountSlot);
    };
    if (selection.waitForMoreDigits)
      numberTimer.current = setTimeout(select, 450);
    else select();
  }

  const displayedRoster = /^\d+$/.test(searchText)
    ? (numberSnapshot.current ?? roster)
    : roster;

  const refreshAction = (
    <Action
      title="Refresh Bots"
      icon={Icon.ArrowClockwise}
      shortcut={Keyboard.Shortcut.Common.Refresh}
      onAction={refresh}
    />
  );

  return (
    <List
      isLoading={loading}
      searchBarPlaceholder={`Search bots or type 1–${roster?.bots.length ?? "…"} to message…`}
      searchText={searchText}
      onSearchTextChange={search}
      filtering
      navigationTitle={mode === "message" ? "Message a Bot" : "Open Bot Chat"}
    >
      <List.EmptyView
        title={error ? "Could not load bots" : "No open bots"}
        description={
          error ||
          "Open Grok Bot and wait for its sidebar to load, then refresh."
        }
        icon={error ? Icon.ExclamationMark : Icon.Message}
        actions={
          <ActionPanel>
            {refreshAction}
            <Action
              title="Open Grok Bot"
              icon={Icon.AppWindow}
              onAction={() =>
                open("grokbot://app/v1/open", "com.anysphere.sand")
              }
            />
            <Action
              title="Extension Preferences"
              icon={Icon.Gear}
              onAction={openExtensionPreferences}
            />
          </ActionPanel>
        }
      />
      {displayedRoster?.bots.map((bot, index) => {
        const messageAction = (
          <Action
            title="Message Bot"
            icon={Icon.ArrowUpCircle}
            onAction={() => compose(bot)}
            shortcut={
              mode === "open" ? { modifiers: ["cmd"], key: "m" } : undefined
            }
          />
        );
        const openAction = (
          <Action
            title="Open Chat"
            icon={Icon.AppWindow}
            onAction={() => {
              clearTimeout(numberTimer.current);
              void openChat(bot);
            }}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
        );
        return (
          <List.Item
            key={bot.id}
            id={bot.id}
            title={`${index + 1}. ${bot.name}`}
            subtitle={bot.description.replace(/\s+/g, " ").slice(0, 100)}
            keywords={[bot.id]}
            icon={botIcon(bot, folder)}
            accessories={[
              ...(bot.isPinned
                ? [{ icon: Icon.Pin, tooltip: "Pinned in Grok Bot" }]
                : []),
              ...(bot.hasUnread
                ? [
                    {
                      icon: {
                        source: Icon.CircleFilled,
                        tintColor: Color.Blue,
                      },
                      tooltip: "Unread messages",
                    },
                  ]
                : []),
            ]}
            actions={
              <ActionPanel>
                {mode === "message" || /^\d+$/.test(searchText)
                  ? messageAction
                  : openAction}
                {mode === "message" || /^\d+$/.test(searchText)
                  ? openAction
                  : messageAction}
                <Action.CreateQuicklink
                  title="Create Chat Quicklink"
                  quicklink={{
                    name: `Grok Bot — ${bot.name}`,
                    link: chatLink(bot.id),
                  }}
                />
                <Action.CopyToClipboard
                  title="Copy Chat Link"
                  content={chatLink(bot.id)}
                />
                {refreshAction}
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
