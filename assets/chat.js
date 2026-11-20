"use strict";
const message = document.querySelector("#message");
const sendButton = document.querySelector("#send");
const history = document.querySelector("#history");
const status = document.querySelector("#status");
let sending = false;
let canSend = true;
let initialized = false;
let lastMessages = "";
let avatar = "";

function emit(event) {
  window.webkit.messageHandlers.chat.postMessage(event);
}
function resize() {
  message.style.height = "auto";
  message.style.height = `${Math.min(message.scrollHeight, 160)}px`;
  sendButton.disabled = sending || !canSend || !message.value.trim();
}
function setText(tag, value, className) {
  const node = document.createElement(tag);
  node.textContent = value;
  if (className) node.className = className;
  return node;
}
function renderMessages(messages) {
  const serialized = JSON.stringify(messages);
  if (lastMessages === serialized) return;
  lastMessages = serialized;
  const atBottom =
    history.scrollHeight - history.scrollTop - history.clientHeight < 80;
  const first = !history.children.length;
  const fragment = document.createDocumentFragment();
  let previousTime = 0;
  if (!messages.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    const image = document.createElement("img");
    image.src = avatar;
    image.alt = "";
    empty.append(
      image,
      setText("strong", document.querySelector("#name").textContent),
      setText(
        "span",
        "Send a message, or open the chat in Grok Bot to load recent messages.",
      ),
    );
    fragment.append(empty);
  }
  for (const item of messages) {
    if (item.timestamp && item.timestamp - previousTime > 30 * 60 * 1000) {
      fragment.append(
        setText(
          "div",
          new Date(item.timestamp).toLocaleString([], {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          }),
          "timestamp",
        ),
      );
    }
    previousTime = item.timestamp;
    const row = document.createElement("div");
    row.className = item.role === "user" ? "row user" : "row";
    const bubble = setText("div", item.text, "bubble");
    if (item.attachment) {
      const file = document.createElement("button");
      file.className = "attachment";
      file.append(setText("span", "▤", "file-icon"));
      const label = setText("span", item.attachment);
      label.append(setText("span", "Open in Grok Bot", "file-caption"));
      file.append(label);
      file.addEventListener("click", () => emit({ type: "open" }));
      bubble.append(file);
    }
    row.append(bubble);
    fragment.append(row);
  }
  history.replaceChildren(fragment);
  if (atBottom || first) history.scrollTop = history.scrollHeight;
}

window.updateChat = (state) => {
  if (!initialized) {
    initialized = true;
    document.querySelector("#name").textContent = state.name;
    document.title = state.name;
    avatar = state.avatar;
    document.querySelector("#avatar").src = avatar;
    document.documentElement.style.setProperty("--accent", state.accent);
    message.placeholder = `Message ${state.name}`;
    message.value = state.draft || "";
    message.focus();
  }
  if (state.messages) renderMessages(state.messages);
  if (typeof state.sending === "boolean") sending = state.sending;
  if (typeof state.canSend === "boolean") canSend = state.canSend;
  if (state.clearDraft) message.value = "";
  if (state.status !== undefined) {
    status.textContent = state.status;
    status.classList.toggle("error", !!state.error);
  }
  message.disabled = sending;
  for (const id of ["back", "close", "bot"])
    document.getElementById(id).disabled = sending;
  sendButton.classList.toggle("sending", sending);
  sendButton.setAttribute("aria-busy", String(sending));
  resize();
  if (state.sending === false) message.focus();
};
function submit() {
  if (!sending && canSend && message.value.trim()) {
    sending = true;
    window.updateChat({ sending: true, status: "Sending…" });
    emit({ type: "send", text: message.value });
  }
}
window.requestClose = (back = false) => {
  if (!sending) emit({ type: "close", draft: message.value, back });
};
document.querySelector("#composer").addEventListener("submit", (event) => {
  event.preventDefault();
  submit();
});
message.addEventListener("input", () => {
  window.updateChat({});
  emit({ type: "draft", text: message.value });
});
document
  .querySelector("#bot")
  .addEventListener("click", () => emit({ type: "open" }));
document
  .querySelector("#back")
  .addEventListener("click", () => window.requestClose(true));
document
  .querySelector("#close")
  .addEventListener("click", () => window.requestClose());
document.addEventListener("keydown", (event) => {
  if (event.isComposing) return;
  if (event.key === "Escape") {
    event.preventDefault();
    window.requestClose();
  }
  if (event.metaKey && event.key === "Enter") {
    event.preventDefault();
    submit();
  }
  if (event.metaKey && event.key.toLowerCase() === "o") {
    event.preventDefault();
    emit({ type: "open" });
  }
  if (event.metaKey && event.key.toLowerCase() === "w") {
    event.preventDefault();
    window.requestClose();
  }
});
