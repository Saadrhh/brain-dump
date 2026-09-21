const WEBHOOK = "https://jepol27887findizecom.app.n8n.cloud/webhook/brain-dump";
const DRAFT_KEY = "brain-dump-draft";
const SESSION_KEY = "brain-dump-session-id";
const TRANSCRIPT_KEY = "brain-dump-transcript";
const CLIENT_ID_KEY = "brain-dump-client-id";
const THEME_KEY = "brain-dump-theme";

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
const transcript = document.getElementById("transcript");
const messagesEl = document.getElementById("messages");
const clearBtn = document.getElementById("clear");
const themeBtn = document.getElementById("theme");
const themeIcon = document.getElementById("themeIcon");
const themeColorMeta = document.getElementById("themeColor");

let audioFile = null;
let recorder = null;
let stream = null;
let chunks = [];
let recording = false;
let timer = null;
let seconds = 0;
let draftTimer = null;
let sending = false;
let sessionId = getOrCreateSessionId();
let conversation = loadTranscript();

function newId() {
  return (
    crypto.randomUUID?.() ||
    "bd-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  );
}

function getOrCreateSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function rotateSession() {
  sessionId = newId();
  localStorage.setItem(SESSION_KEY, sessionId);
}

function getClientId() {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    id = newId();
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}

function metaPayload() {
  return {
    sessionId,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    timestamp: new Date().toISOString(),
    clientId: getClientId(),
  };
}

function updateSend() {
  send.disabled = sending || recording || (!text.value.trim() && !audioFile);
}

function showError(msg) {
  error.textContent = msg;
  error.hidden = false;
}

function clearError() {
  error.textContent = "";
  error.hidden = true;
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

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(md) {
  if (typeof marked !== "undefined" && marked.parse) {
    return marked.parse(md || "");
  }
  return "<p>" + escapeHtml(md || "") + "</p>";
}

function saveDraft() {
  const value = text.value;
  if (value.trim()) {
    localStorage.setItem(DRAFT_KEY, value);
  } else {
    localStorage.removeItem(DRAFT_KEY);
  }
}

function loadDraft() {
  const saved = localStorage.getItem(DRAFT_KEY);
  if (saved) text.value = saved;
  updateSend();
}

function applyTheme(theme) {
  const dark = theme === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
  themeIcon.textContent = dark ? "◑" : "◐";
  if (themeColorMeta) {
    themeColorMeta.setAttribute("content", dark ? "#141412" : "#f5f5f2");
  }
}

function toggleTheme() {
  const next =
    document.documentElement.getAttribute("data-theme") === "dark"
      ? "light"
      : "dark";
  applyTheme(next);
}

function loadTranscript() {
  try {
    const saved = JSON.parse(localStorage.getItem(TRANSCRIPT_KEY) || "[]");
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

function persistTranscript() {
  localStorage.setItem(TRANSCRIPT_KEY, JSON.stringify(conversation));
}

function updateClearVisibility() {
  clearBtn.hidden = conversation.length === 0;
  transcript.hidden = conversation.length === 0;
}

function scrollTranscript() {
  requestAnimationFrame(() => {
    transcript.scrollTop = transcript.scrollHeight;
  });
}

function appendMessage(role, content, { persist = true, pending = false } = {}) {
  const entry = { role, content, at: new Date().toISOString(), pending: !!pending };

  if (persist && !pending) {
    conversation.push({ role, content, at: entry.at });
    persistTranscript();
  }

  const bubble = document.createElement("div");
  bubble.className =
    "bubble " + role + (pending ? " pending" : "");
  if (pending) bubble.dataset.pending = "true";

  const label = document.createElement("span");
  label.className = "bubble-label";
  label.textContent = role === "user" ? "You" : "Brain Dump";

  const body = document.createElement("div");
  body.className = "bubble-body";

  if (pending) {
    body.innerHTML =
      '<span class="spinner"></span><span>Thinking...</span>';
  } else if (role === "assistant") {
    body.innerHTML = renderMarkdown(content);
  } else {
    body.textContent = content;
  }

  bubble.appendChild(label);
  bubble.appendChild(body);
  messagesEl.appendChild(bubble);

  updateClearVisibility();
  scrollTranscript();
  return bubble;
}

function removePending() {
  messagesEl.querySelectorAll('[data-pending="true"]').forEach((el) => el.remove());
}

function renderTranscript() {
  messagesEl.innerHTML = "";
  conversation.forEach((msg) => {
    appendMessage(msg.role, msg.content, { persist: false });
  });
  updateClearVisibility();
  if (conversation.length) scrollTranscript();
}

function looksLikeQuestion(message) {
  return /\?/.test(message || "");
}

function startNewConversation() {
  conversation = [];
  persistTranscript();
  messagesEl.innerHTML = "";
  rotateSession();
  clearError();
  removeAudio();
  text.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateClearVisibility();
  updateSend();
  text.placeholder = "What's on your mind?";
  text.focus();
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
  sending = true;
  updateSend();
  send.innerHTML = '<span class="spinner"></span><span>Thinking...</span>';

  const dumpText = text.value.trim();
  const hadAudio = Boolean(audioFile);
  const meta = metaPayload();
  const userDisplay = dumpText || (hadAudio ? "Voice message" : "");

  appendMessage("user", userDisplay);
  appendMessage("assistant", "", { persist: false, pending: true });

  text.value = "";
  localStorage.removeItem(DRAFT_KEY);
  const audioToSend = audioFile;
  removeAudio();

  try {
    let res;

    if (audioToSend) {
      const form = new FormData();
      form.append("audio", audioToSend);
      if (dumpText) form.append("text", dumpText);
      form.append("sessionId", meta.sessionId);
      form.append("timezone", meta.timezone);
      form.append("timestamp", meta.timestamp);
      form.append("clientId", meta.clientId);
      res = await fetch(WEBHOOK, { method: "POST", body: form });
    } else {
      res = await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: dumpText,
          ...meta,
        }),
      });
    }

    const data = await readResponse(res);
    removePending();

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

    if (message === null) {
      throw new Error("Invalid response from workflow");
    }

    appendMessage("assistant", message);

    if (looksLikeQuestion(message)) {
      text.placeholder = "Reply here…";
    } else {
      text.placeholder = "What's on your mind?";
    }
  } catch (e) {
    removePending();
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
    text.focus();
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
clearBtn.addEventListener("click", startNewConversation);
themeBtn.addEventListener("click", toggleTheme);

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

applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
loadDraft();
renderTranscript();
text.focus();
