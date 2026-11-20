# Security

This extension reads the signed-in account's local Grok Bot cache and sends messages through the installed macOS app. Drafts are saved in Raycast's local storage. Message text reaches the chat window over standard input and Grok Bot over its loopback debugging connection.

## Grok Bot debugging port

Chats connect to Grok Bot through Chromium's DevTools protocol on `127.0.0.1:9333`. Raycast asks before it restarts Grok Bot with that port. The port is not reachable from the network, but while it is open any program running on this Mac can act in Grok Bot as the signed-in user. It closes when Grok Bot quits. Raycast connects only to a page loaded from `Grok Bot.app`, sends through Grok Bot's own send journal with the expected account, and stops its transcript subscription when the chat window closes. The extension makes no network requests of its own and never reads Grok Bot's credentials.

## Focused review on 18 November 2026

The source review covered cache and account isolation, recipient selection, native child processes, WebKit rendering, draft persistence, asset generation, and the dependency graph. An independent reviewer rechecked the fixes in source.

- Sends name the bot ID and the expected account. Grok Bot rejects a send when the signed-in account changed. No window focus, typing, or Grok Bot draft is involved.
- Confirmed submission clears the visible composer before draft cleanup. A storage failure produces a separate warning, so it cannot turn a confirmed send into an apparent failure.
- The WebKit composer uses a nonpersistent data store, a restrictive Content Security Policy, and exact local-page navigation checks. Native events are accepted from the owned main frame.
- Cached message text is inserted with `textContent`. Internal assistant entries and bot-to-bot exchanges are excluded from visible history. Attachment cards open the full Grok chat.
- Bot IDs and cached avatar keys are validated before path construction. Account checks surround history reads. Sending validates the current account and bot again.
- Executable paths are fixed. Child processes receive structured JSON through pipes. Message text and bot IDs reach Grok Bot as JSON arguments, never as code.

## Dependency audit

The vulnerable `minimatch` development dependency was replaced with a patched release.

GHSA-fc5q-39xc-vjpf against `picomatch` produces one advisory in `bun audit` and 16 affected dependency entries in `npm audit`. GitHub marks this advisory as withdrawn on 18 November 2026. No patched version is published. The installed version is 4.0.7. This withdrawn advisory is the only remaining audit alert at review time. [Withdrawn advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)

## Validation and limits

Validation includes unit tests, a live WebKit literal-HTML rendering and send-event self-test, native wheel selection checks, TypeScript compilation, and dependency auditing. The screenshots use synthetic bots and conversations.

The integration depends on Grok Bot's undocumented local cache format and internal renderer stores. The renderer client was checked against Grok Bot 1.2.3 while signed out; sending from a signed-in account was not exercised in that check.

Asset generation executes renderer code from the locally installed Grok Bot app. Builds trust that installation. Grok Bot branding and artwork belong to their respective owners.
