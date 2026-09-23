const API_AUTH = "/api/auth";
const API_BRAIN = "/api/brain-dump";
const API_DIGEST = "/api/weekly-digest";
const REQUEST_TIMEOUT_MS = 90000;

const DRAFT_KEY = "brain-dump-draft";
const SESSION_KEY = "brain-dump-session-id";
const TRANSCRIPT_KEY = "brain-dump-transcript";
const THEME_KEY = "brain-dump-theme";
const AUTH_CODE_KEY = "brain-dump-access-code";
const INSTALL_HINT_KEY = "brain-dump-install-hint";

const SUN_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const MOON_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z"/></svg>';

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const lock = document.getElementById("lock");
const lockForm = document.getElementById("lockForm");
const lockInput = document.getElementById("lockInput");
const lockError = document.getElementById("lockError");
const lockSubmit = document.getElementById("lockSubmit");
const lockOut = document.getElementById("lockOut");
const appRoot = document.getElementById("appRoot");
const text = document.getElementById("text");
const send = document.getElementById("send");
const record = document.getElementById("record");
const recordText = document.getElementById("recordText");
const error = document.getElementById("error");
const transcript = document.getElementById("transcript");
const messagesEl = document.getElementById("messages");
const clearBtn = document.getElementById("clear");
const digestBtn = document.getElementById("digest");
const themeBtn = document.getElementById("theme");
const themeIcon = document.getElementById("themeIcon");
const themeColorMeta = document.getElementById("themeColor");
const shell = document.querySelector(".shell");
const app = document.getElementById("appRoot");
const emptyState = document.getElementById("emptyState");
const composerCard = document.getElementById("composerCard");
const recordingPanel = document.getElementById("recordingPanel");
const recordingTime = document.getElementById("recordingTime");
const recordingHint = document.getElementById("recordingHint");
const stopRec = document.getElementById("stopRec");
const installHint = document.getElementById("installHint");
const installText = document.getElementById("installText");
const installDismiss = document.getElementById("installDismiss");

let recognition = null;
let listening = false;
let timer = null;
let seconds = 0;
let draftTimer = null;
let sending = false;
let digesting = false;
let unlocking = false;
let sessionId = getOrCreateSessionId();
let conversation = loadTranscript();
let speechBase = "";
let finalSpeech = "";
let accessCode = sessionStorage.getItem(AUTH_CODE_KEY) || "";

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

function apiHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Access-Code": accessCode,
  };
}

function isUnlocked() {
  return Boolean(accessCode);
}

function showApp() {
  lock.hidden = true;
  appRoot.hidden = false;
  maybeShowInstallHint();
  text.focus();
}

function showLock() {
  if (typeof stopListening === "function") {
    try {
      stopListening({ keepText: true });
    } catch (_) {}
  }
  appRoot.hidden = true;
  lock.hidden = false;
  lockError.hidden = true;
  lockInput.value = "";
  lockInput.focus();
}

function lockApp() {
  accessCode = "";
  sessionStorage.removeItem(AUTH_CODE_KEY);
  showLock();
}

function updateSend() {
  send.disabled = sending || listening || digesting || !text.value.trim();
  if (digestBtn) digestBtn.disabled = sending || listening || digesting;
}

function showError(msg) {
  error.textContent = msg;
  error.hidden = false;
}

function clearError() {
  error.textContent = "";
  error.hidden = true;
}

function friendlyError(status, fallback, data) {
  const fromServer =
    data && (data.message || data.error || data.errorMessage);
  if (typeof fromServer === "string" && fromServer.trim()) return fromServer;

  if (status === 401) return "Unauthorized. Lock and unlock with your access code.";
  if (status === 429) return "Slow down — rate limit hit. Wait a bit and try again.";
  if (status === 504) return "That took too long. Try again in a moment.";
  if (status === 502 || status >= 500) {
    return "Couldn't reach n8n. Check the workflow is Active and Vercel env URLs.";
  }
  if (status === 400) return "That request wasn't valid. Check your message and try again.";
  return fallback || "Something went wrong.";
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
  if (value.trim()) localStorage.setItem(DRAFT_KEY, value);
  else localStorage.removeItem(DRAFT_KEY);
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
  themeBtn.setAttribute(
    "aria-label",
    dark ? "Switch to light mode" : "Switch to dark mode"
  );
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

  const clearPress = () => clearTimeout(pressTimer);
  bubble.addEventListener("pointerup", clearPress);
  bubble.addEventListener("pointerleave", clearPress);
  bubble.addEventListener("pointercancel", clearPress);

  bubble.addEventListener("click", () => {
    if (window.matchMedia("(pointer: coarse)").matches) {
      bubble.classList.toggle("show-time");
    }
  });
}

function needsConfirmation(data, message) {
  if (data && (data.needs_confirmation === true || data.needsConfirmation === true)) {
    return true;
  }
  if (data && (data.confirmation || data.confirm)) return true;
  const m = message || "";
  return /\b(confirm|are you sure|shall i|should i|okay to|ok to)\b/i.test(m) && /\?/.test(m);
}

function appendMessage(role, content, { persist = true, pending = false, at, data } = {}) {
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
    body.innerHTML =
      '<span class="thinking" aria-label="Thinking"><i></i><i></i><i></i></span>';
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

    if (needsConfirmation(data, content)) {
      const yes = document.createElement("button");
      yes.type = "button";
      yes.className = "confirm-btn confirm-yes";
      yes.textContent = (data && (data.confirm_label || data.confirmLabel)) || "Confirm";
      yes.addEventListener("click", (e) => {
        e.stopPropagation();
        text.value = (data && (data.confirm_text || data.confirmText)) || "Yes, confirm";
        updateSend();
        sendDump();
      });

      const no = document.createElement("button");
      no.type = "button";
      no.className = "confirm-btn confirm-no";
      no.textContent = (data && (data.cancel_label || data.cancelLabel)) || "Cancel";
      no.addEventListener("click", (e) => {
        e.stopPropagation();
        text.value = (data && (data.cancel_text || data.cancelText)) || "No, cancel";
        updateSend();
        sendDump();
      });

      actions.appendChild(yes);
      actions.appendChild(no);
    }

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
  messagesEl
    .querySelectorAll('[data-pending="true"]')
    .forEach((el) => el.remove());
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

function joinSpeech(base, spoken) {
  const b = (base || "").trimEnd();
  const s = (spoken || "").trim();
  if (!s) return b;
  if (!b) return s;
  return /[\s\n]$/.test(base) ? b + " " + s : b + " " + s;
}

function applyLiveTranscript(interim) {
  text.value = joinSpeech(speechBase, finalSpeech + (interim ? " " + interim : ""));
  text.scrollTop = text.scrollHeight;
  updateSend();
}

function stopListening({ keepText = true } = {}) {
  if (!listening && !recognition) {
    recordingPanel.hidden = true;
    return;
  }

  listening = false;
  record.classList.remove("recording");
  recordText.textContent = "Speak";
  clearInterval(timer);
  recordingPanel.hidden = true;

  if (recognition) {
    try {
      recognition.onend = null;
      recognition.stop();
    } catch (_) {}
    recognition = null;
  }

  if (keepText) {
    text.value = joinSpeech(speechBase, finalSpeech);
    saveDraft();
  }

  updateSend();
  text.focus();
}

function startListening() {
  if (!SpeechRecognition) {
    showError(
      "Live transcription isn’t supported in this browser. Try Chrome or Safari, or just type."
    );
    return;
  }

  clearError();
  speechBase = text.value;
  finalSpeech = "";
  seconds = 0;
  listening = true;

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = navigator.language || "en-US";
  recognition.maxAlternatives = 1;

  recognition.onresult = (event) => {
    let interim = "";
    let finals = "";

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const piece = event.results[i][0].transcript;
      if (event.results[i].isFinal) finals += piece;
      else interim += piece;
    }

    if (finals) {
      finalSpeech = (finalSpeech + " " + finals).replace(/\s+/g, " ").trim();
    }

    applyLiveTranscript(interim);
    recordingHint.textContent = interim || finals ? "Transcribing…" : "Listening…";
  };

  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    if (event.error === "not-allowed") {
      showError("Microphone access was denied. You can still type your dump.");
      stopListening();
      return;
    }
    showError("Couldn’t keep listening (" + event.error + "). Try again or type.");
    stopListening();
  };

  recognition.onend = () => {
    if (!listening) return;
    try {
      recognition.start();
    } catch (_) {
      stopListening();
    }
  };

  try {
    recognition.start();
  } catch (_) {
    showError("Couldn’t start the microphone. Try again or type.");
    stopListening();
    return;
  }

  record.classList.add("recording");
  recordText.textContent = "Listening";
  recordingHint.textContent = "Listening…";
  recordingTime.textContent = "00:00";
  recordingPanel.hidden = false;

  timer = setInterval(() => {
    seconds++;
    recordingTime.textContent = fmt(seconds);
  }, 1000);

  updateSend();
}

function startNewConversation() {
  stopListening({ keepText: false });
  conversation = [];
  persistTranscript();
  messagesEl.innerHTML = "";
  rotateSession();
  clearError();
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

async function apiFetch(url, payload) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: apiHeaders(),
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const data = await readResponse(res);
    return { res, data };
  } finally {
    clearTimeout(timerId);
  }
}

async function unlock(code) {
  if (unlocking) return false;
  unlocking = true;
  lockError.hidden = true;
  lockSubmit.disabled = true;
  lockSubmit.textContent = "Checking…";

  try {
    const res = await fetch(API_AUTH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Access-Code": code,
      },
      body: JSON.stringify({ access_code: code }),
    });
    const data = await readResponse(res);

    if (!res.ok) {
      lockError.textContent = friendlyError(res.status, "Wrong code. Try again.", data);
      lockError.hidden = false;
      lockInput.select();
      return false;
    }

    accessCode = code;
    sessionStorage.setItem(AUTH_CODE_KEY, code);
    showApp();
    return true;
  } catch (e) {
    lockError.textContent =
      e && e.name === "AbortError"
        ? "Timed out. Try again."
        : "Couldn't reach the server. Open the Vercel site URL (not a local file).";
    lockError.hidden = false;
    return false;
  } finally {
    unlocking = false;
    lockSubmit.disabled = false;
    lockSubmit.textContent = "Unlock";
  }
}

async function sendDump() {
  if (send.disabled || sending || listening || digesting || !isUnlocked()) return;

  clearError();
  sending = true;
  updateSend();
  send.innerHTML = '<span class="spinner"></span><span>Sending...</span>';
  pulseComposer();

  const dumpText = text.value.trim();

  appendMessage("user", dumpText);
  appendMessage("assistant", "", { persist: false, pending: true });

  text.value = "";
  localStorage.removeItem(DRAFT_KEY);

  try {
    const { res, data } = await apiFetch(API_BRAIN, {
      text: dumpText,
      session_id: sessionId,
    });
    removePending();

    if (!res.ok) {
      throw new Error(friendlyError(res.status, "Request failed.", data));
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

    appendMessage("assistant", message, { data });

    text.placeholder = looksLikeQuestion(message)
      ? "Reply here…"
      : "What's on your mind?";
  } catch (e) {
    removePending();
    const msg = e && e.message ? e.message : "Something went wrong.";
    showError(
      e && e.name === "AbortError"
        ? "That took too long. Try again in a moment."
        : msg.includes("Failed to fetch")
          ? "Couldn't reach the server. Check your connection and Vercel deploy."
          : msg
    );
  } finally {
    sending = false;
    send.innerHTML = "Send <span>→</span>";
    updateSend();
    text.focus();
  }
}

async function fetchDigest() {
  if (digesting || sending || listening || !isUnlocked()) return;

  clearError();
  digesting = true;
  updateSend();
  const prevLabel = digestBtn.textContent;
  digestBtn.textContent = "…";

  appendMessage("user", "Weekly digest");
  appendMessage("assistant", "", { persist: false, pending: true });

  try {
    const { res, data } = await apiFetch(API_DIGEST, {
      session_id: sessionId,
    });
    removePending();

    if (!res.ok) {
      throw new Error(friendlyError(res.status, "Digest failed.", data));
    }

    const digest =
      typeof data?.digest === "string"
        ? data.digest
        : typeof data?.message === "string"
          ? data.message
          : null;

    if (!digest || !String(digest).trim()) {
      appendMessage(
        "assistant",
        "No digest content this time — calendar and inbox look quiet, or the workflow returned empty."
      );
      return;
    }

    let body = digest;
    if (data.generated_at) {
      try {
        const when = new Intl.DateTimeFormat(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(data.generated_at));
        body = "_Generated " + when + "_\n\n" + digest;
      } catch (_) {}
    }

    appendMessage("assistant", body, { data });
  } catch (e) {
    removePending();
    const raw = e && e.message ? e.message : "";
    showError(
      e && e.name === "AbortError"
        ? "Digest timed out. Try again in a moment."
        : raw.includes("Failed to fetch")
          ? "Couldn't reach the digest API. Check Vercel env + n8n Active."
          : raw || "Couldn't load the weekly digest."
    );
  } finally {
    digesting = false;
    digestBtn.textContent = prevLabel;
    updateSend();
  }
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

function maybeShowInstallHint() {
  if (!installHint || isStandalone()) return;
  if (localStorage.getItem(INSTALL_HINT_KEY) === "1") return;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  installText.textContent = isIOS
    ? "On iPhone: Share → Add to Home Screen for the app-like version."
    : "Install this site to your home screen for the app-like version.";
  installHint.hidden = false;
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
  const isMobile = window.matchMedia(
    "(max-width: 700px), (pointer: coarse)"
  ).matches;

  if (isMod || (isMobile && !e.shiftKey)) {
    e.preventDefault();
    sendDump();
  }
});

clearBtn.addEventListener("click", startNewConversation);
digestBtn.addEventListener("click", fetchDigest);
themeBtn.addEventListener("click", toggleTheme);
stopRec.addEventListener("click", () => stopListening());

record.addEventListener("click", () => {
  if (listening) {
    stopListening();
    return;
  }
  startListening();
});

send.addEventListener("click", sendDump);

lockForm.addEventListener("submit", (e) => {
  e.preventDefault();
  unlock(lockInput.value);
});

lockOut.addEventListener("click", lockApp);

installDismiss.addEventListener("click", () => {
  installHint.hidden = true;
  localStorage.setItem(INSTALL_HINT_KEY, "1");
});

function syncViewportHeight() {
  if (!window.visualViewport || !app || app.hidden) return;
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

if (!SpeechRecognition) {
  record.disabled = true;
  record.title = "Live transcription isn’t supported here";
}

applyTheme(localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light");
loadDraft();
renderTranscript();

if (isUnlocked()) {
  showApp();
} else {
  showLock();
}
