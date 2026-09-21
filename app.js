const WEBHOOK = "https://jjhkjhk.app.n8n.cloud/webhook/brain-dump";
const DRAFT_KEY = "brain-dump-draft";
const HISTORY_KEY = "brain-dump-history";
const CLIENT_ID_KEY = "brain-dump-client-id";
const MAX_HISTORY = 20;

const text = document.getElementById("text");
const send = document.getElementById("send");
const record = document.getElementById("record");
const recordText = document.getElementById("recordText");
const attach = document.getElementById("attach");
const fileInput = document.getElementById("file");
const attachment = document.getElementById("attachment");
const audioName = document.getElementById("audioName");
const remove = document.getElementById("remove");
const error = document.getElementById("error");
const statusEl = document.getElementById("status");
const response = document.getElementById("response");
const responseText = document.getElementById("responseText");
const responseMeta = document.getElementById("responseMeta");
const responseDetails = document.getElementById("responseDetails");
const draftHint = document.getElementById("draftHint");
const historySection = document.getElementById("historySection");
const historyList = document.getElementById("historyList");
const clearHistoryBtn = document.getElementById("clearHistory");

let audioFile = null;
let recorder = null;
let stream = null;
let chunks = [];
let recording = false;
let timer = null;
let seconds = 0;
let draftTimer = null;
let sending = false;

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id =
      crypto.randomUUID?.() ||
      "bd-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function metaPayload() {
  return {
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    timestamp: new Date().toISOString(),
    clientId: getClientId(),
  };
}

function updateSend() {
  send.disabled = sending || recording || (!text.value.trim() && !audioFile);
}

function showError(msg) {
  statusEl.hidden = true;
  error.textContent = msg;
  error.hidden = false;
}

function clearError() {
  error.textContent = "";
  error.hidden = true;
}

function showStatus(msg) {
  error.hidden = true;
  statusEl.textContent = msg;
  statusEl.hidden = false;
}

function clearStatus() {
  statusEl.textContent = "";
  statusEl.hidden = true;
}

function showAudio(file) {
  audioFile = file;
  attachment.hidden = false;
  audioName.textContent = file.name;
  updateSend();
}

function removeAudio() {
  audioFile = null;
  attachment.hidden = true;
  fileInput.value = "";
  updateSend();
}

function fmt(s) {
  return (
    String(Math.floor(s / 60)).padStart(2, "0") +
    ":" +
    String(s % 60).padStart(2, "0")
  );
}

function formatWhen(iso) {
  try {
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
}

function saveDraft() {
  const value = text.value;
  if (value.trim()) {
    localStorage.setItem(DRAFT_KEY, value);
    draftHint.textContent = "Draft saved";
  } else {
    localStorage.removeItem(DRAFT_KEY);
    draftHint.textContent = "";
  }
}

function loadDraft() {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved) {
    text.value = saved;
    draftHint.textContent = "Draft restored";
  }
  updateSend();
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, MAX_HISTORY)));
}

function addHistoryEntry(entry) {
  const items = loadHistory();
  items.unshift(entry);
  saveHistory(items);
  renderHistory();
}

function renderHistory() {
  const items = loadHistory();
  historyList.innerHTML = "";

  if (!items.length) {
    historySection.hidden = true;
    return;
  }

  historySection.hidden = false;

  items.forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "history-item";

    const preview =
      item.dump || (item.hadAudio ? "Voice dump" : "Empty dump");
    const reply = item.message || "No reply saved";

    btn.innerHTML =
      '<div class="history-item-top"><span>' +
      escapeHtml(formatWhen(item.at)) +
      "</span><span>" +
      (item.hadAudio ? "Audio" : "Text") +
      "</span></div>" +
      '<div class="history-item-preview">' +
      escapeHtml(preview) +
      "</div>" +
      '<div class="history-item-reply">' +
      escapeHtml(reply) +
      "</div>";

    btn.addEventListener("click", () => {
      showResult(item.data || { message: item.message }, { scroll: true });
    });

    historyList.appendChild(btn);
  });
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function countOf(data, keys) {
  for (const key of keys) {
    if (typeof data[key] === "number") return data[key];
    if (Array.isArray(data[key])) return data[key].length;
  }
  return 0;
}

function showResult(data, { scroll = false } = {}) {
  const message =
    typeof data?.message === "string"
      ? data.message
      : typeof data?.reply === "string"
        ? data.reply
        : typeof data?.text === "string"
          ? data.text
          : "";

  if (!message && !data) return;

  const body = message || "Done.";
  if (typeof marked !== "undefined" && marked.parse) {
    responseText.innerHTML = marked.parse(body);
  } else {
    responseText.textContent = body;
  }

  const calendar = asArray(data.calendar || data.events || data.calendarItems);
  const emails = asArray(data.emails || data.drafts || data.emailDrafts);
  const errors = asArray(data.errors || data.errorItems);
  const calendarCount = calendar.length || countOf(data, ["calendarCount", "eventsCreated"]);
  const emailCount = emails.length || countOf(data, ["emailCount", "draftsCreated"]);
  const errorCount = errors.length || countOf(data, ["errorCount"]);

  responseMeta.innerHTML = "";
  responseDetails.innerHTML = "";

  const chips = [];
  if (calendarCount) chips.push(["ok", calendarCount + " calendar"]);
  if (emailCount) chips.push(["ok", emailCount + " email draft" + (emailCount === 1 ? "" : "s")]);
  if (errorCount) chips.push(["warn", errorCount + " issue" + (errorCount === 1 ? "" : "s")]);
  if (!calendarCount && !emailCount && !errorCount && data.summary) {
    chips.push(["", String(data.summary)]);
  }

  if (chips.length) {
    chips.forEach(([type, label]) => {
      const chip = document.createElement("span");
      chip.className = "chip" + (type ? " " + type : "");
      chip.textContent = label;
      responseMeta.appendChild(chip);
    });
    responseMeta.hidden = false;
  } else {
    responseMeta.hidden = true;
  }

  const detailItems = [];

  calendar.forEach((item) => {
    const title = item.title || item.summary || item.name || "Calendar event";
    const when = item.start || item.when || item.date || "";
    detailItems.push(["Calendar", title + (when ? " · " + when : "")]);
  });

  emails.forEach((item) => {
    const to = item.to || item.recipient || "";
    const subject = item.subject || item.title || "Email draft";
    detailItems.push(["Email draft", (to ? to + " — " : "") + subject]);
  });

  errors.forEach((item) => {
    const msg =
      typeof item === "string"
        ? item
        : item.message || item.error || "Something failed";
    detailItems.push(["Issue", msg]);
  });

  if (detailItems.length) {
    detailItems.forEach(([label, body]) => {
      const li = document.createElement("li");
      li.innerHTML =
        '<span class="label">' +
        escapeHtml(label) +
        "</span>" +
        escapeHtml(body);
      responseDetails.appendChild(li);
    });
    responseDetails.hidden = false;
  } else {
    responseDetails.hidden = true;
  }

  response.hidden = false;

  if (scroll) {
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  }
}

async function readResponse(res) {
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return res.json();
  }

  const raw = await res.text();
  try {
    return JSON.parse(raw);
  } catch {
    return { message: raw };
  }
}

async function sendDump() {
  if (send.disabled || sending || recording) return;

  clearError();
  clearStatus();
  sending = true;
  updateSend();
  send.innerHTML = '<span class="spinner"></span><span>Thinking...</span>';

  const dumpText = text.value.trim();
  const hadAudio = Boolean(audioFile);
  const meta = metaPayload();

  try {
    let res;

    if (audioFile) {
      const form = new FormData();
      form.append("audio", audioFile);
      if (dumpText) form.append("text", dumpText);
      form.append("timezone", meta.timezone);
      form.append("timestamp", meta.timestamp);
      form.append("clientId", meta.clientId);
      res = await fetch(WEBHOOK, { method: "POST", body: form });
    } else {
      res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.value,
          ...meta,
        }),
      });
    }

    const data = await readResponse(res);

    if (!res.ok) {
      const detail =
        (data && (data.message || data.error || data.errorMessage)) ||
        "Request failed (" + res.status + ")";
      throw new Error(detail);
    }

    const message =
      typeof data?.message === "string"
        ? data.message
        : typeof data?.reply === "string"
          ? data.reply
          : typeof data?.text === "string"
            ? data.text
            : null;

    if (!data || (message === null && !data.calendar && !data.emails && !data.errors)) {
      throw new Error("Invalid response from workflow");
    }

    showStatus("Out of your head.");
    showResult(data, { scroll: true });

    addHistoryEntry({
      at: meta.timestamp,
      dump: dumpText,
      hadAudio,
      message: message || "Done.",
      data,
    });

    text.value = "";
    localStorage.removeItem(DRAFT_KEY);
    draftHint.textContent = "";
    removeAudio();
  } catch (e) {
    const msg =
      e && e.message
        ? e.message
        : "Something went wrong while sending your brain dump.";
    showError(
      msg.includes("Failed to fetch")
        ? "Couldn't reach n8n. Check your connection and webhook URL."
        : msg
    );
  } finally {
    sending = false;
    send.innerHTML = "Send <span>→</span>";
    updateSend();
  }
}

text.addEventListener("input", () => {
  clearError();
  updateSend();
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraft, 250);
});

text.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    e.preventDefault();
    sendDump();
  }
});

attach.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;

  if (!f.type.startsWith("audio/")) {
    showError("Please select an audio file.");
    return;
  }

  showAudio(f);
});

remove.addEventListener("click", removeAudio);

clearHistoryBtn.addEventListener("click", () => {
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
});

record.addEventListener("click", async () => {
  clearError();

  if (recording) {
    stopRecording();
    return;
  }

  if (
    !navigator.mediaDevices ||
    !navigator.mediaDevices.getUserMedia ||
    !window.MediaRecorder
  ) {
    showError(
      "Audio recording isn't supported here. You can attach an audio file instead."
    );
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    const types = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4",
      "audio/ogg;codecs=opus",
      "audio/ogg",
    ];
    const type = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";

    recorder = type
      ? new MediaRecorder(stream, { mimeType: type })
      : new MediaRecorder(stream);

    chunks = [];

    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };

    recorder.onstop = () => {
      const mime = recorder.mimeType || type || "audio/webm";
      const ext = mime.includes("ogg")
        ? "ogg"
        : mime.includes("mp4")
          ? "m4a"
          : "webm";
      const blob = new Blob(chunks, { type: mime });

      showAudio(
        new File([blob], "brain-dump-" + Date.now() + "." + ext, {
          type: mime,
        })
      );

      stream.getTracks().forEach((t) => t.stop());
      stream = null;
      recording = false;
      record.classList.remove("recording");
      recordText.textContent = "Record";
      clearInterval(timer);
      updateSend();
    };

    recorder.start();
    recording = true;
    seconds = 0;
    record.classList.add("recording");
    recordText.textContent = "Recording 00:00";

    timer = setInterval(() => {
      seconds++;
      recordText.textContent = "Recording " + fmt(seconds);
    }, 1000);

    updateSend();
  } catch (e) {
    showError(
      "Microphone access was denied or unavailable. You can attach an audio file instead."
    );
  }
});

function stopRecording() {
  if (recorder && recorder.state !== "inactive") {
    recorder.stop();
  } else {
    recording = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    record.classList.remove("recording");
    recordText.textContent = "Record";
    clearInterval(timer);
    updateSend();
  }
}

send.addEventListener("click", sendDump);

loadDraft();
renderHistory();
text.focus();

const isMac = /Mac|iPhone|iPad/.test(navigator.platform || "");
const keyHint = document.querySelector(".hint-keys");
if (keyHint) {
  keyHint.innerHTML = isMac
    ? "<kbd>⌘</kbd><kbd>Enter</kbd> to send"
    : "<kbd>Ctrl</kbd><kbd>Enter</kbd> to send";
}
