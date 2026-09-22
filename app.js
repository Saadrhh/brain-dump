const WEBHOOK = "https://jepol27887findizecom.app.n8n.cloud/webhook/brain-dump";
const DRAFT_KEY = "brain-dump-draft";
const SESSION_KEY = "brain-dump-session-id";
const TRANSCRIPT_KEY = "brain-dump-transcript";
const CLIENT_ID_KEY = "brain-dump-client-id";
const THEME_KEY = "brain-dump-theme";

const SUN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"/></svg>';

const text = document.getElementById("text");
const send = document.getElementById("send");
const record = document.getElementById("record");
const recordText = document.getElementById("recordText");
const attach = document.getElementById("attach");
const fileInput = document.getElementById("file");
const attachment = document.getElementById("attachment");
const audioMeta = document.getElementById("audioMeta");
const audioTitle = document.getElementById("audioTitle");
const remove = document.getElementById("remove");
const error = document.getElementById("error");
const transcript = document.getElementById("transcript");
const messagesEl = document.getElementById("messages");
const clearBtn = document.getElementById("clear");
const themeBtn = document.getElementById("theme");
const themeIcon = document.getElementById("themeIcon");
const themeColorMeta = document.getElementById("themeColor");
const shell = document.querySelector(".shell");
const app = document.querySelector(".app");
const emptyState = document.getElementById("emptyState");
const composerCard = document.getElementById("composerCard");
const recordingPanel = document.getElementById("recordingPanel");
const recordingTime = document.getElementById("recordingTime");
const stopRec = document.getElementById("stopRec");
const wave = document.getElementById("wave");

let audioFile = null;
let audioDurationLabel = "";
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
let audioCtx = null;
let analyser = null;
let waveFrame = null;

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

function showAudio(file, durationSec) {
  audioFile = file;
  attachment.hidden = false;
  audioTitle.textContent = "Audio attached";
  const name = file.name || "voice note";
  if (typeof durationSec === "number" && durationSec > 0) {
    audioDurationLabel = fmt(Math.round(durationSec));
    audioMeta.textContent = audioDurationLabel + " · " + name;
  } else {
    audioDurationLabel = "";
    audioMeta.textContent = name;
  }
  updateSend();
}

function removeAudio() {
  audioFile = null;
  audioDurationLabel = "";
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
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "";
  }
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
  themeIcon.innerHTML = dark ? SUN_ICON : MOON_ICON;
  themeBtn.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode");
  themeBtn.title = dark ? "Light mode" : "Dark mode";
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
  const hasChat = conversation.length > 0;
  clearBtn.hidden = !hasChat;
  transcript.hidden = !hasChat;
  emptyState.hidden = hasChat;
  shell.classList.toggle("has-chat", hasChat);
}

function scrollTranscript() {
  requestAnimationFrame(() => {
    transcript.scrollTop = transcript.scrollHeight;
  });
}

function pulseComposer() {
  composerCard.classList.remove("settling");
  void composerCard.offsetWidth;
  composerCard.classList.add("settling");
}

async function copyText(value, btn) {
  try {
    await navigator.clipboard.writeText(value);
    const prev = btn.textContent;
    btn.textContent = "Copied";
    setTimeout(() => {
      btn.textContent = prev;
    }, 1200);
  } catch {
    btn.textContent = "Failed";
    setTimeout(() => {
      btn.textContent = "Copy";
    }, 1200);
  }
}

function bindTimeToggle(bubble) {
  let pressTimer = null;

  bubble.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") return;
    pressTimer = setTimeout(() => {
      bubble.classList.add("show-time");
    }, 420);
  });

  const clearPress = () => {
    clearTimeout(pressTimer);
  };

  bubble.addEventListener("pointerup", clearPress);
  bubble.addEventListener("pointerleave", clearPress);
  bubble.addEventListener("pointercancel", clearPress);

  bubble.addEventListener("click", () => {
    if (window.matchMedia("(pointer: coarse)").matches) {
      bubble.classList.toggle("show-time");
    }
  });
}

function appendMessage(role, content, { persist = true, pending = false, at } = {}) {
  const stamped = at || new Date().toISOString();

  if (persist && !pending) {
    conversation.push({ role, content, at: stamped });
    persistTranscript();
  }

  const bubble = document.createElement("div");
  bubble.className = "bubble " + role + (pending ? " pending" : "");
  if (pending) bubble.dataset.pending = "true";

  const top = document.createElement("div");
  top.className = "bubble-top";

  const label = document.createElement("span");
  label.className = "bubble-label";
  label.textContent = role === "user" ? "You" : "Brain Dump";

  const time = document.createElement("span");
  time.className = "bubble-time";
  time.textContent = formatWhen(stamped);

  top.appendChild(label);
  top.appendChild(time);

  const body = document.createElement("div");
  body.className = "bubble-body";

  if (pending) {
    body.innerHTML = '<span class="thinking" aria-label="Thinking"><i></i><i></i><i></i></span>';
  } else if (role === "assistant") {
    body.innerHTML = renderMarkdown(content);
  } else {
    body.textContent = content;
  }

  bubble.appendChild(top);
  bubble.appendChild(body);

  if (!pending && role === "assistant" && content) {
    const actions = document.createElement("div");
    actions.className = "bubble-actions";
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "copy-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyText(content, copyBtn);
    });
    actions.appendChild(copyBtn);
    bubble.appendChild(actions);
  }

  if (!pending) bindTimeToggle(bubble);

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
    appendMessage(msg.role, msg.content, { persist: false, at: msg.at });
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
  stopWaveform();
  text.value = "";
  localStorage.removeItem(DRAFT_KEY);
  updateClearVisibility();
  updateSend();
  text.placeholder = "What's on your mind?";
  text.focus();
}

function drawWaveframe() {
  if (!analyser || !wave) return;

  const ctx = wave.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = wave.clientWidth || 320;
  const cssHeight = 36;
  wave.width = Math.floor(cssWidth * dpr);
  wave.height = Math.floor(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const bufferLength = analyser.frequencyBinCount;
  const data = new Uint8Array(bufferLength);

  function frame() {
    waveFrame = requestAnimationFrame(frame);
    analyser.getByteTimeDomainData(data);

    ctx.clearRect(0, 0, cssWidth, cssHeight);
    const style = getComputedStyle(document.documentElement);
    ctx.strokeStyle = style.getPropertyValue("--wave").trim() || "#5a5a52";
    ctx.lineWidth = 2;
    ctx.beginPath();

    const slice = cssWidth / bufferLength;
    let x = 0;
    for (let i = 0; i < bufferLength; i++) {
      const v = data[i] / 128;
      const y = (v * cssHeight) / 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      x += slice;
    }
    ctx.stroke();
  }

  frame();
}

function startWaveform(mediaStream) {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    recordingPanel.hidden = false;
    drawWaveframe();
  } catch {
    recordingPanel.hidden = false;
  }
}

function stopWaveform() {
  if (waveFrame) cancelAnimationFrame(waveFrame);
  waveFrame = null;
  analyser = null;
  if (audioCtx) {
    audioCtx.close().catch(() => {});
    audioCtx = null;
  }
  recordingPanel.hidden = true;
  if (wave) {
    const ctx = wave.getContext("2d");
    ctx && ctx.clearRect(0, 0, wave.width, wave.height);
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
  sending = true;
  updateSend();
  send.innerHTML = '<span class="spinner"></span><span>Sending...</span>';
  pulseComposer();

  const dumpText = text.value.trim();
  const hadAudio = Boolean(audioFile);
  const meta = metaPayload();
  const userDisplay =
    dumpText ||
    (hadAudio
      ? "Voice message" + (audioDurationLabel ? " · " + audioDurationLabel : "")
      : "");

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
  if (e.key !== "Enter") return;

  const isMod = e.metaKey || e.ctrlKey;
  const isMobile = window.matchMedia("(max-width: 700px), (pointer: coarse)").matches;

  if (isMod || (isMobile && !e.shiftKey)) {
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

  const url = URL.createObjectURL(f);
  const audio = new Audio();
  audio.preload = "metadata";
  audio.src = url;
  audio.onloadedmetadata = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    URL.revokeObjectURL(url);
    showAudio(f, duration);
  };
  audio.onerror = () => {
    URL.revokeObjectURL(url);
    showAudio(f);
  };
});

remove.addEventListener("click", removeAudio);
clearBtn.addEventListener("click", startNewConversation);
themeBtn.addEventListener("click", toggleTheme);
stopRec.addEventListener("click", () => {
  if (recording) stopRecording();
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
      const durationSec = seconds;

      showAudio(
        new File([blob], "brain-dump-" + Date.now() + "." + ext, {
          type: mime,
        }),
        durationSec
      );

      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
      recording = false;
      record.classList.remove("recording");
      recordText.textContent = "Record";
      clearInterval(timer);
      stopWaveform();
      updateSend();
    };

    recorder.start();
    recording = true;
    seconds = 0;
    record.classList.add("recording");
    recordText.textContent = "Recording";
    recordingTime.textContent = "00:00";
    startWaveform(stream);

    timer = setInterval(() => {
      seconds++;
      recordingTime.textContent = fmt(seconds);
      recordText.textContent = "Recording";
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
    stopWaveform();
    updateSend();
  }
}

send.addEventListener("click", sendDump);

function syncViewportHeight() {
  if (!window.visualViewport || !app) return;
  const height = Math.round(window.visualViewport.height);
  app.style.height = height + "px";
  app.style.maxHeight = height + "px";
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", syncViewportHeight);
  window.visualViewport.addEventListener("scroll", syncViewportHeight);
  syncViewportHeight();
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
loadDraft();
renderTranscript();
text.focus();
