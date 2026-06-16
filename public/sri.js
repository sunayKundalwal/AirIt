//   ═══════════════════════════════════════════════════════════════════════
//        JAVASCRIPT — WebRTC P2P Transfer Platform  (script.js)
//        ───────────────────────────────────────────────────────────────────
//        Changes from original:
//          1. Receiver file UI is NOT shown on connect — only when the sender
//             actually begins the transfer (onFileMetaReceived is called).
//          2. Toast system rebuilt: mobile-safe, word-wrap, icon doesn't
//             flex-shrink, auto-dismiss with fade.
//          3. Full mobile responsiveness support (CSS handled in index.html).
//          4. NEW: Folder-picker gate. The instant the receiver gets the
//             FIRST 'file-meta' message of a batch, a modal appears asking
//             the user to choose a destination folder on disk
//             (window.showDirectoryPicker()). NOTHING related to the
//             transfer — not the file-list UI, not chunk buffering, not
//             progress updates — proceeds until a folder has been chosen.
//             See the "FOLDER PICKER GATE" section below for the full
//             design and the synchronous-user-gesture constraint that
//             shapes how it's wired up.
//        ═══════════════════════════════════════════════════════════════════
//
//   ───────────────────────────────────────────────────────────────────────
//   BACKEND INTEGRATION CONTRACT — read this before wiring up real data
//   ───────────────────────────────────────────────────────────────────────
//   This app talks to TWO different "backends". Every demo/simulation
//   function in this file maps to exactly one of them:
//
//   (1) SIGNALING SERVER (Socket.IO / Node.js) — `socket` from socket.js
//       Short-lived, server-mediated. Used ONLY to find the other peer and
//       to relay the WebRTC handshake (SDP offer/answer + ICE candidates).
//       Every message is JSON, sent/received through Socket.IO events.
//
//       CLIENT -> SERVER
//         'createRoom'   { roomCode }
//           Sent once by the SENDER, right after generating roomCode.
//           Server stores { roomCode -> this socket.id }.
//
//         'joinRoom'     { roomCode, userName }
//           Sent by the RECEIVER after entering the 6-char code.
//
//         'webrtc-offer'  { roomCode, sdp }       sender   -> server -> receiver
//         'webrtc-answer' { roomCode, sdp }       receiver -> server -> sender
//         'ice-candidate' { roomCode, candidate } both directions, many times
//
//       SERVER -> CLIENT
//         'peerJoined'   { userName }
//           -> sent to the SENDER when a receiver joins this room.
//           -> call onPeerJoined(payload.userName)
//
//         'roomJoined'   { senderName }
//           -> sent to the RECEIVER when the room code was valid.
//           -> call onReceiverConnected(payload.senderName)
//           NOTE: this only confirms the SIGNALING handshake succeeded.
//           It does NOT mean the RTCDataChannel is open yet — that comes a
//           moment later via the WebRTC offer/answer/ICE relay above, and
//           finishes with dataChannel.onopen (see onDataChannelOpen).
//
//         'roomNotFound' (no payload)
//           -> sent to the RECEIVER when the 6-char code matches no room.
//           -> call onRoomNotFound()
//
//         'webrtc-offer' / 'webrtc-answer' / 'ice-candidate'
//           -> relayed verbatim to the other peer. Used to build the
//              RTCPeerConnection on both sides (lives in a separate
//              webrtc.js / peerConnection.js module, not in this file).
//
//         'peer-disconnected' (no payload)
//           -> other side left/closed tab. Call handleDisconnect() or a
//              dedicated "peer left" reset.
//
//   (2) P2P DATA CHANNEL (RTCDataChannel, browser-to-browser, NO server)
//       Opens AFTER the signaling handshake above succeeds. From this
//       point on, the "backend" is literally the other browser tab.
//       Everything below travels over ONE ordered, reliable channel
//       (default RTCDataChannel config — do NOT set maxRetransmits or
//       set ordered:false, or the assumptions below break).
//
//       CONTROL MESSAGES — sent as JSON.stringify(...) STRINGS:
//
//         { type: 'file-meta', name, size, mime, index, total }
//           -> receiver checks typeof event.data === 'string', then
//              JSON.parse(event.data)
//           -> call onFileMetaReceived(meta)
//           This is the FIRST message for each file — sent before any
//           binary chunks for that file.
//
//         { type: 'file-end', index }
//           -> every byte of file `index` has now arrived.
//           -> assemble buffered chunks into a Blob (or finalize an
//              OPFS / File System Access write stream) and
//           -> call onFileComplete(index, fileName, blob)
//
//         { type: 'transfer-complete' }
//           -> sent once, after the LAST file's 'file-end'.
//           -> call onTransferComplete()
//
//       BINARY MESSAGES — raw ArrayBuffer chunks:
//
//         dataChannel.send(arrayBufferChunk)
//           -> receiver checks event.data instanceof ArrayBuffer
//           -> append to the buffer for the CURRENT file (the file whose
//              'file-meta' most recently arrived — ordering guarantees
//              every chunk between file i's 'file-meta' and 'file-end'
//              belongs to file i; no per-chunk index needed)
//           -> call onChunkReceived(fileIndex, receivedBytes, totalBytes,
//                                    overallPct, speedBps)
//
//       FLOW CONTROL (sender side — not implemented in the demo loop below):
//         Before each dataChannel.send(chunk), check
//         dataChannel.bufferedAmount. If it's above a high-water mark
//         (e.g. 1MB / 16 * CHUNK_SIZE), await the channel's
//         'bufferedamountlow' event before sending more. This is the
//         "four-layer buffer model" flow-control step from the PRD — it
//         keeps the channel's internal send queue from growing unbounded
//         on slow connections.
//   ───────────────────────────────────────────────────────────────────────

import { sendMeta } from "./script.js";
import { socket, userName } from "./socket.js";
import { roomCode } from "./socketEvents.js";

// EXPECTED FROM ./socket.js:
//   socket   - a connected Socket.IO client instance (io(SERVER_URL)).
//              All 'createRoom' / 'joinRoom' / signaling-relay listeners
//              described in the contract above attach to this object.
//   userName - the display name THIS user registered with (string). This
//              is what should be sent in 'joinRoom' / 'createRoom' so the
//              OTHER peer's onPeerJoined / onReceiverConnected shows the
//              right name. (joinRoom() below currently hardcodes "Meow"
//              instead of using this — flagged at that call site.)
//
// EXPECTED FROM ./socketEvents.js:
//   roomCode - a freshly generated 6-char room code for the SENDER,
//              created client-side BEFORE 'createRoom' is emitted (see
//              selectRole -> sender branch below).

/* ─────────────────────────────────────────────────────────────────────────
   APP STATE
   ───────────────────────────────────────────────────────────────────────── */
const appState = {
  role:         null,   // 'sender' | 'receiver'
  roomId:       null,   // 6-char string
  SenderRoomId: null,   // 6-char string
  files:        [],     // Array<File>  — sender only
  peerName:     null,   // Display name of the remote peer
  connected:    false,  // Whether the WebRTC data channel is open
  transferring: false,  // Transfer in progress
};

// NOTE on `connected`: in the real implementation this flag should track
// the RTCDataChannel's open state specifically (set true inside
// onDataChannelOpen / its receiver-side equivalent), NOT just "the
// signaling handshake succeeded" (i.e. NOT just 'peerJoined'/'roomJoined').
// setSendButtonState() below gates the Send button on appState.connected,
// so if it's set too early the user could try to send before the channel
// is actually writable.

/* ─────────────────────────────────────────────────────────────────────────
   FOLDER PICKER GATE  (RECEIVER SIDE — NEW)
   ───────────────────────────────────────────────────────────────────────
   Purpose: block ALL receiver-side transfer handling (file-list UI reveal,
   chunk buffering, progress updates, file assembly) until the user has
   chosen a destination folder via window.showDirectoryPicker().

   Why a separate state object instead of just adding fields to appState:
   it keeps every folder-related flag in one place and makes the gating
   condition in onFileMetaReceived() read clearly (`if (!folderGate.ready)`)
   without scattering folder concerns through the general app state.

   Fields:
     directoryHandle  - FileSystemDirectoryHandle returned by the native
                         picker once the user selects a folder. null until
                         then. Used later (when wiring real chunk writes)
                         to call directoryHandle.getFileHandle(name,
                         { create: true }) -> getWritableStream() for each
                         incoming file, so bytes are streamed straight to
                         disk instead of buffered in memory as a Blob.
     ready            - true only after a folder has been successfully
                         chosen. This is the actual gate flag checked in
                         onFileMetaReceived().
     pendingMeta      - if 'file-meta' arrives before the user finishes
                         picking a folder (e.g. the modal is open and the
                         user is still deciding), the meta object is
                         stashed here so it can be replayed into
                         onFileMetaReceived()'s real logic the instant
                         the folder is confirmed, instead of being lost.
     unsupported      - true if window.showDirectoryPicker is not a
                         function in this browser (Firefox / Safari as of
                         this writing). In that case we still gate the
                         transfer on the user dismissing the modal, but we
                         fall back to the browser's normal per-file
                         download prompt later in onFileComplete() (the
                         existing <a download> object-URL approach already
                         in this file) rather than directory-handle writes.
   ───────────────────────────────────────────────────────────────────────── */
const folderGate = {
  directoryHandle: null,
  ready:           false,
  pendingMeta:     null,
  unsupported:     false,
};

/**
 * Show the folder-picker modal. Called from onFileMetaReceived() the
 * moment the FIRST 'file-meta' of a batch arrives and folderGate.ready
 * is still false.
 *
 * NOTE: this function only toggles the modal's visibility — it does NOT
 * itself call showDirectoryPicker(). That call has to happen inside the
 * #btn-pick-folder click handler (see pickFolder() below) so it stays
 * inside a genuine, synchronous user-gesture context. See the long
 * comment above pickFolder() for why.
 */
function showFolderPickerModal() {
  const modal = document.getElementById('folder-picker-modal');
  const errorEl = document.getElementById('folder-picker-error');
  const fallbackNote = document.getElementById('folder-picker-fallback-note');
  const selectedEl = document.getElementById('folder-picker-selected');

  // Reset any leftover state from a previous batch/session.
  errorEl.classList.add('hidden');
  errorEl.textContent = '';
  selectedEl.classList.add('hidden');

  // Detect File System Access API support up front so the modal's copy
  // is accurate immediately, rather than only after the user clicks.
  if (typeof window.showDirectoryPicker !== 'function') {
    folderGate.unsupported = true;
    fallbackNote.textContent =
      'Your browser doesn\u2019t support folder selection — files will be saved individually via your browser\u2019s normal download prompt instead.';
    document.getElementById('btn-pick-folder').textContent = 'Continue';
  } else {
    folderGate.unsupported = false;
    fallbackNote.textContent = '';
  }

  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function hideFolderPickerModal() {
  const modal = document.getElementById('folder-picker-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

/**
 * Click handler for #btn-pick-folder.
 *
 * ── WHY THIS MUST STAY A DIRECT, SYNCHRONOUS CLICK HANDLER ──────────────
 * window.showDirectoryPicker() is part of the File System Access API and
 * is spec'd to require "transient user activation" — meaning the call
 * must happen synchronously within the call stack of a trusted user
 * gesture event (a real click, keypress, etc.), with no `await`, no
 * setTimeout, and no Promise .then() in between the click and the call.
 *
 * Concretely:
 *   GOOD:  button.addEventListener('click', () => window.showDirectoryPicker())
 *   GOOD:  button.addEventListener('click', async () => {
 *            const handle = await window.showDirectoryPicker(); // OK: the
 *            // call itself happens synchronously as the first statement;
 *            // only the awaiting of its result is async.
 *          })
 *   BAD:   button.addEventListener('click', () => {
 *            setTimeout(() => window.showDirectoryPicker(), 0); // loses
 *            // the activation flag — browser throws SecurityError.
 *          })
 *   BAD:   socket.on('someEvent', () => window.showDirectoryPicker());
 *          // not a user gesture at all — always rejected.
 *
 * This is exactly why the modal in index.html does NOT auto-invoke the
 * picker when it appears — it waits for the user to physically click
 * #btn-pick-folder, and THIS function is wired directly to that click
 * with the picker call as its first synchronous action.
 */
async function pickFolder() {
  const errorEl = document.getElementById('folder-picker-error');
  errorEl.classList.add('hidden');

  // Fallback path: browser has no File System Access API support at all.
  // We can't ask for a directory handle, so we simply accept the user's
  // click as their confirmation to proceed, and rely on the existing
  // per-file <a download> flow already implemented in onFileComplete().
  if (typeof window.showDirectoryPicker !== 'function') {
    folderGate.unsupported     = true;
    folderGate.directoryHandle = null;
    confirmFolderSelected(null);
    return;
  }

  try {
    // ── THE ACTUAL NATIVE FOLDER PICKER ──────────────────────────────
    // Must be the first await in this handler (it is) so the gesture
    // is still considered "active" when the browser evaluates it.
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite', // we need write access to save incoming files
    });

    folderGate.directoryHandle = handle;

    // Reflect the chosen folder's name back to the user before closing
    // the modal, so they get visual confirmation of what they picked.
    const selectedEl = document.getElementById('folder-picker-selected');
    const nameEl     = document.getElementById('folder-picker-name');
    nameEl.textContent = handle.name || 'Selected folder';
    selectedEl.classList.remove('hidden');

    confirmFolderSelected(handle);

  } catch (err) {
    // User dismissed the native picker (clicked Cancel / pressed Esc),
    // or some other failure occurred. Either way: do NOT proceed — keep
    // the modal open and let them try again. The transfer stays blocked.
    if (err && err.name === 'AbortError') {
      errorEl.textContent = 'No folder selected. Choose a folder to continue receiving files.';
    } else {
      errorEl.textContent = 'Could not access that folder. Please try again.';
    }
    errorEl.classList.remove('hidden');
  }
}

/**
 * Called once a folder has been successfully chosen (or, in the
 * unsupported-browser fallback case, once the user has acknowledged the
 * fallback message). This is the single point where the gate actually
 * opens: folderGate.ready flips to true, the modal closes, and — if a
 * 'file-meta' message arrived earlier while the modal was still open —
 * that stashed meta is replayed into the real onFileMetaReceived logic
 * so no data is silently dropped.
 *
 * @param {FileSystemDirectoryHandle|null} handle - null in the
 *   unsupported-browser fallback path.
 */
function confirmFolderSelected(handle) {
  folderGate.ready = true;
  hideFolderPickerModal();

  showToast(
    handle ? `Saving files to "${handle.name}"` : 'Folder selection unavailable — using browser downloads',
    'success'
  );

  // Replay any 'file-meta' that arrived while the user was still
  // choosing a folder, so the receiver UI / progress tracking picks up
  // exactly where it would have if the gate hadn't been in the way.
  if (folderGate.pendingMeta) {
    const meta = folderGate.pendingMeta;
    folderGate.pendingMeta = null;
    revealReceiverTransferUI(meta);
  }
}

/* ─────────────────────────────────────────────────────────────────────────
   PAGE ROUTER
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Show a single page by its ID and hide all others.
 * @param {string} pageId - The suffix after "page-" e.g. "sender"
 */
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
}

/* ─────────────────────────────────────────────────────────────────────────
   ROLE SELECTION
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Select sender or receiver role, update state, and navigate to the
 * appropriate setup page.
 * @param {'sender'|'receiver'} role
 */
function selectRole(role) {
  appState.role = role;
  appState.peerName = document.getElementById("peer-name").textContent;

  if (role === 'sender') {
    const roomId = roomCode;
    appState.roomId = roomId;
    initSenderPage(roomId);
    showPage('sender');

    // BACKEND: Create a room on your signaling server here.
    //   e.g. signalingSocket.emit('create-room', { roomId });
    //   Then listen for 'peer-joined' events.

    // ── BACKEND CONTRACT (see header) ───────────────────────────────────
    // Emit 'createRoom' with { roomCode: roomId } here:
    //
    //   socket.emit('createRoom', { roomCode: roomId });
    //
    // This is fire-and-forget — no response is expected from this emit
    // itself. The server just records { roomCode: roomId -> socket.id }
    // so it knows where to relay things later. The actual "someone
    // joined" signal arrives asynchronously as the 'peerJoined' event,
    // which is registered inside initSenderPage() (see below, where
    // simulatePeerJoin() currently stands in for it).

  } else {
    initReceiverPage();
    showPage('receiver');

    // NEW: reset the folder gate every time the receiver page is
    // (re-)entered, so a folder chosen in a previous session/room
    // doesn't silently carry over into a new one. The user should be
    // asked again for each new transfer batch.
    resetFolderGate();
  }

  showNavChrome(role);
}

/**
 * Reset all folder-gate state. Called when entering the receiver page
 * fresh, and also from goBack()/goHome() so leaving an in-progress
 * receiver session doesn't leak a stale directory handle into the next
 * one.
 */
function resetFolderGate() {
  folderGate.directoryHandle = null;
  folderGate.ready           = false;
  folderGate.pendingMeta     = null;
  folderGate.unsupported     = false;
  hideFolderPickerModal();
}

/* ─────────────────────────────────────────────────────────────────────────
   SENDER PAGE INIT
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Initialize the sender page UI.
 * @param {string} roomId
 */
function initSenderPage(roomId) {
  document.getElementById('sender-room-id').textContent = roomId;
  document.getElementById('nav-room-id-label').textContent = roomId;
  appState.files = [];
  renderSenderFiles();
  setSendButtonState();

  // BACKEND: Remove simulatePeerJoin() and react to real 'peer-joined' WebSocket events.
  //
  // ── BACKEND CONTRACT ─────────────────────────────────────────────────
  // Replace the call below with a real listener registration:
  //
  //   socket.on('peerJoined', ({ userName }) => onPeerJoined(userName));
  //
  // 'peerJoined' payload shape: { userName: string } — the display name
  // the RECEIVER registered with when they called 'joinRoom'. The server
  // emits this to the SENDER's socket only, exactly once per receiver
  // that successfully joins this room.
  //
  // Make sure this listener is registered exactly once per sender
  // session (e.g. guard with a flag, or register it in selectRole right
  // after 'createRoom' instead of here) — otherwise re-rendering this
  // page could attach duplicate listeners.
  //simulatePeerJoin();
}

/* ─────────────────────────────────────────────────────────────────────────
   RECEIVER PAGE INIT
   ───────────────────────────────────────────────────────────────────────── */

function initReceiverPage() {
  const input = document.getElementById('room-code-input');
  if (input) input.value = '';
  document.getElementById('btn-join-room').disabled = true;
  document.getElementById('join-error').classList.add('hidden');
  document.getElementById('receiver-status-card').classList.add('hidden');

  // ── KEY CHANGE: Do NOT show receiver-files-section or receiver-overall-block
  //    here. These are revealed only when the sender actually starts sending
  //    (i.e. when onFileMetaReceived() is called for the first time) AND
  //    only after the folder-picker gate has been satisfied — see
  //    revealReceiverTransferUI() / the folder gate section above.
  document.getElementById('receiver-files-section').classList.add('hidden');
  document.getElementById('receiver-done-card').classList.add('hidden');
  document.getElementById('receiver-overall-block').classList.add('hidden');
  document.getElementById('sender-info-card').classList.add('hidden');

  // Make sure the tips card is visible on reset
  const tipsCard = document.getElementById('receiver-tips');
  if (tipsCard) tipsCard.classList.remove('hidden');

  // Clear any previously received files
  const container = document.getElementById('receiver-files-container');
  if (container) container.innerHTML = '';

  // NOTE: this is also the right place to reset any RECEIVER-side
  // dataChannel state from a previous session — e.g. set
  // `currentFile = null` and clear any accumulated chunk buffers /
  // close any open File System Access write streams — so a stale
  // in-progress file from a previous room doesn't leak into a new one.
}

/* ─────────────────────────────────────────────────────────────────────────
   NAV CHROME
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Show the nav chrome appropriate for the role.
 * @param {'sender'|'receiver'} role
 */
function showNavChrome(role) {
  document.getElementById('nav-status').classList.remove('hidden');
  document.getElementById('nav-status').classList.add('flex');
  document.getElementById('nav-room-chip').classList.remove('hidden');
  document.getElementById('btn-disconnect').classList.remove('hidden');
  setNavStatus('waiting', 'Waiting for peer…');
}

/**
 * Update the nav status dot and label.
 * @param {'waiting'|'connecting'|'connected'|'transferring'|'done'} state
 * @param {string} label
 */
function setNavStatus(state, label) {
  const dot = document.getElementById('status-dot');
  const lbl = document.getElementById('status-label');
  lbl.textContent = label;

  const colors = {
    waiting:      'bg-yellow-400',
    connecting:   'bg-blue-400',
    connected:    'bg-green-400',
    transferring: 'bg-blue-400',
    done:         'bg-green-400',
  };
  dot.className = `w-2 h-2 rounded-full flex-shrink-0 ${colors[state] || 'bg-slate-400'} ${state !== 'done' ? 'dot-pulse' : ''}`;
}

/* ─────────────────────────────────────────────────────────────────────────
   COPY ROOM ID
   ───────────────────────────────────────────────────────────────────────── */

function copyRoomId() {
  navigator.clipboard.writeText(appState.roomId).then(() => {
    console.log(roomCode)
    const btn = document.getElementById('btn-copy-room');
    btn.classList.add('copy-flash');
    btn.innerHTML = `
      <svg width="14" height="14" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
      Copied!`;
    setTimeout(() => {
      btn.classList.remove('copy-flash');
      btn.innerHTML = `
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
        Copy`;
    }, 2000);
    showToast('Room code copied!', 'success');
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   FILE INPUT — SENDER
   ───────────────────────────────────────────────────────────────────────── */

function triggerFileInput() {
  document.getElementById('file-input').click();
}

function onDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('sender-drop-zone').classList.add('dragging');
}

function onDragLeave(event) {
  document.getElementById('sender-drop-zone').classList.remove('dragging');
}

/**
 * Handle files dropped into the drop zone.
 * @param {DragEvent} event
 */
function onDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('sender-drop-zone').classList.remove('dragging');
  const droppedFiles = Array.from(event.dataTransfer.files);
  addFilesToQueue(droppedFiles);
}

/**
 * Handle files selected via the file <input>.
 * @param {Event} event
 */
function onFileInputChange(event) {
  const selectedFiles = Array.from(event.target.files);
  addFilesToQueue(selectedFiles);
  event.target.value = '';
}

/**
 * Merge new files into the queue, skipping exact duplicates.
 * @param {File[]} newFiles
 */
function addFilesToQueue(newFiles) {
  const existingKeys = new Set(appState.files.map(f => f.name + f.size));
  const unique = newFiles.filter(f => !existingKeys.has(f.name + f.size));
  appState.files.push(...unique);

  if (unique.length !== newFiles.length) {
    showToast(`${newFiles.length - unique.length} duplicate(s) skipped`, 'warn');
  }

  renderSenderFiles();
  setSendButtonState();
}

/**
 * Remove a file from the queue by its index.
 * @param {number} index
 */
function removeFile(index) {
  appState.files.splice(index, 1);
  renderSenderFiles();
  setSendButtonState();
}

function clearFiles() {
  appState.files = [];
  renderSenderFiles();
  setSendButtonState();
}

function renderSenderFiles() {
  const container = document.getElementById('sender-files-container');
  const section   = document.getElementById('sender-file-list');

  if (appState.files.length === 0) {
    section.classList.add('hidden');
    return;
  }

  section.classList.remove('hidden');
  container.innerHTML = appState.files.map((file, i) => `
    <div class="file-row flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
           style="background:rgba(76,110,245,0.12)">
        ${fileTypeIcon(file.name)}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate" title="${escHtml(file.name)}">${escHtml(file.name)}</p>
        <p class="text-xs text-slate-500">${formatBytes(file.size)}</p>
      </div>
      <button
        data-remove-index="${i}"
        class="btn btn-ghost p-1.5 text-slate-500 hover:text-red-400 flex-shrink-0"
        title="Remove"
      >
        <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    </div>
  `).join('');

  const totalBytes = appState.files.reduce((s, f) => s + f.size, 0);
  document.getElementById('sender-file-count').textContent = `${appState.files.length} file${appState.files.length !== 1 ? 's' : ''}`;
  document.getElementById('sender-total-size').textContent = formatBytes(totalBytes);
}

/**
 * Enable or disable the Send button based on readiness.
 */
function setSendButtonState() {
  const ready = appState.files.length > 0 && appState.connected;
  document.getElementById('btn-send-files').disabled = !ready;
}

/* ─────────────────────────────────────────────────────────────────────────
   RECEIVER — JOIN ROOM
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Auto-uppercases input, enables Join once 6 chars entered.
 * @param {HTMLInputElement} input
 */
function onRoomCodeInput(input) {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  document.getElementById('btn-join-room').disabled = input.value.length < 6;
  document.getElementById('join-error').classList.add('hidden');
}

function joinRoom() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length !== 6) return;

  appState.roomId = code;
  document.getElementById('nav-room-id-label').textContent = code;
  appState.SenderRoomId = code;

  // Lock form while connecting
  document.getElementById('room-code-input').disabled = true;
  document.getElementById('btn-join-room').disabled   = true;

  // Show connecting state
  document.getElementById('receiver-status-card').classList.remove('hidden');
  setNavStatus('connecting', 'Connecting…');

  // BACKEND: Send a 'join-room' request to your signaling server here.
  //   e.g. signalingSocket.emit('join-room', { roomId: code });
  //   On success: call onReceiverConnected()
  //   On error:   call onRoomNotFound()

  // ── BACKEND CONTRACT (see header) ───────────────────────────────────
  // The emit below is ALREADY close to correct — { roomCode, userName }
  // is the right shape. Two issues to fix when wiring real data:
  //
  //   1. "Meow" is a DEMO placeholder. It should be the imported
  //      `userName` (from ./socket.js) — i.e.
  //        socket.emit("joinRoom", { roomCode: code, userName });
  //      Whatever string is sent here is exactly what the SENDER will
  //      see in their 'peerJoined' event and display via onPeerJoined().
  //
  //   2. Register listeners for BOTH possible server responses BEFORE
  //      (or immediately after) this emit, using .once() so each can
  //      only fire one time per join attempt:
  //
  //        socket.once('roomJoined', ({ senderName }) => {
  //          // senderName: string — the SENDER's display name, taken
  //          // from whatever they passed to 'createRoom'/registration.
  //          onReceiverConnected(senderName);
  //        });
  //
  //        socket.once('roomNotFound', () => {
  //          onRoomNotFound();
  //        });
  //
  //   IMPORTANT: 'roomJoined' confirms the SIGNALING match only. The
  //   WebRTC offer/answer/ICE exchange (relayed through these same
  //   socket events, handled in a separate webrtc.js module) still has
  //   to complete before the RTCDataChannel is actually open. That's
  //   exactly why onReceiverConnected() below sets the status text to
  //   "Waiting for sender to start the transfer…" rather than "Ready to
  //   send" — it's describing the signaling-connected-but-not-yet-
  //   data-channel-open state. Don't set appState.connected = true here;
  //   that should happen only once the receiver's RTCDataChannel itself
  //   fires its 'open' event (the receiver-side equivalent of
  //   onDataChannelOpen, currently not modeled in this demo since the
  //   receiver never sends — but still relevant if/when bidirectional
  //   transfer is added).
  console.log("reached here");
  socket.emit("joinRoom", { roomCode: code, userName: "Meow" });
  
//   let data;
// socket.on("OfferData",async (d)=>{
//      data = JSON.parse(d)
//     console.log("offer data")
//     console.log(data)
//     console.log(data.status)
//     if(data.status == "success"){
//         onReceiverConnected(data.offer.offererUserName)
//         console.log("calling answer offer")
//         answerOffer(data.offer)
//     }
// })
  //onReceiverConnected("sdfsdfsdf")
 // simulateReceiverConnect(code);
}

/**
 * Called when the receiver has successfully connected and the data channel is open.
 * ── KEY CHANGE: Does NOT reveal file-transfer UI — that only appears when
 *    the sender actually starts sending (onFileMetaReceived), and even
 *    then only after the folder-picker gate has been satisfied.
 * @param {string} senderName
 */
function onReceiverConnected(senderName) {
  // BACKEND TRIGGER: socket.once('roomJoined', ({ senderName }) =>
  //                    onReceiverConnected(senderName))
  // senderName: string, taken directly from the server's 'roomJoined'
  // payload — it's whatever display name the SENDER registered with.
  // No further parsing/validation needed; pass it straight through.
  appState.connected = true;
  setNavStatus('connected', 'Connected');

  // Update status card
  document.getElementById('receiver-status-icon').innerHTML = `
    <svg width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
  document.getElementById('receiver-status-label').textContent = 'Connected to sender';
  document.getElementById('receiver-status-sub').textContent   = 'Waiting for sender to start the transfer…';
  document.getElementById('receiver-status-badge').textContent = 'Ready';
  document.getElementById('receiver-status-badge').className   = 'badge ml-auto flex-shrink-0 text-xs badge-green';

  // Show sender info card
  if (senderName) {
    appState.peerName = senderName;
    document.getElementById('sender-avatar').textContent = senderName.charAt(0).toUpperCase();
    document.getElementById('sender-name').textContent   = senderName;
    document.getElementById('sender-meta').textContent   = 'Sender';
    document.getElementById('sender-info-card').classList.remove('hidden');
  }

  // ── Do NOT reveal receiver-files-section or receiver-overall-block here.
  //    They will appear only once onFileMetaReceived() is called AND the
  //    folder-picker gate has been satisfied (see revealReceiverTransferUI).

  showToast('Connected to sender — waiting for transfer to begin.', 'success');
}

function onRoomNotFound() {
  // BACKEND TRIGGER: socket.once('roomNotFound', () => onRoomNotFound())
  // No payload — the event itself is the signal that `code` doesn't
  // match any room currently registered on the server.
  document.getElementById('room-code-input').disabled = false;
  document.getElementById('btn-join-room').disabled   = false;
  document.getElementById('join-error').classList.remove('hidden');
  document.getElementById('receiver-status-card').classList.add('hidden');
  showToast('Room not found', 'error');
}

/* ─────────────────────────────────────────────────────────────────────────
   SENDER — PEER JOINED HANDLER
   ───────────────────────────────────────────────────────────────────────── */

/**
 * Update sender UI once a peer has joined the room.
 * @param {string} peerName
 */
function onPeerJoined(peerName) {
  // BACKEND TRIGGER: socket.on('peerJoined', ({ userName }) =>
  //                    onPeerJoined(userName))
  // peerName: string — the RECEIVER's display name, taken directly from
  // the 'userName' field of the 'joinRoom' payload they sent. Pass
  // straight through, same as onReceiverConnected's senderName.
  const dot   = document.getElementById('step-peer-dot');
  const label = document.getElementById('step-peer-label');
  const sub   = document.getElementById('step-peer-sub');
  const badge = document.getElementById('badge-peer');

  dot.className = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500/15';
  dot.innerHTML = `<svg width="13" height="13" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
  label.textContent = peerName || 'Receiver';
  label.className   = 'text-sm text-white truncate';
  sub.textContent   = 'Peer is ready to receive';
  badge.textContent = 'Connected';
  badge.className   = 'badge badge-green ml-auto text-xs flex-shrink-0';

  setTimeout(() => {
    // BACKEND: Replace with real data channel open event

    // ── BACKEND/WEBRTC CONTRACT ─────────────────────────────────────────
    // DELETE this setTimeout entirely. In its place, onPeerJoined() is
    // the right moment for the SENDER to kick off the WebRTC handshake:
    //
    //   1. const pc = new RTCPeerConnection({ iceServers: [...] });
    //      (STUN + your coturn TURN server from the PRD)
    //   2. const dc = pc.createDataChannel('fileTransfer');
    //      dc.onopen  = () => onDataChannelOpen();
    //      dc.onmessage = ... (sender doesn't need this for one-way
    //        transfer, but keep it for future ack/control messages)
    //   3. const offer = await pc.createOffer();
    //      await pc.setLocalDescription(offer);
    //      socket.emit('webrtc-offer', { roomCode: appState.roomId, sdp: offer });
    //   4. socket.on('webrtc-answer', async ({ sdp }) => {
    //        await pc.setRemoteDescription(sdp);
    //      });
    //      socket.on('ice-candidate', ({ candidate }) => {
    //        pc.addIceCandidate(candidate);
    //      });
    //      pc.onicecandidate = (e) => {
    //        if (e.candidate) socket.emit('ice-candidate',
    //          { roomCode: appState.roomId, candidate: e.candidate });
    //      };
    //
    //   onDataChannelOpen() (step 2's dc.onopen) is the REAL trigger that
    //   replaces this timeout — it fires automatically once ICE finishes
    //   connecting and the data channel completes its SCTP handshake.
    //onDataChannelOpen();
  }, 800);

  if (peerName) {
    appState.peerName = peerName;
    document.getElementById('peer-avatar').textContent = peerName.charAt(0).toUpperCase();
    document.getElementById('peer-name').textContent   = peerName;
    document.getElementById('peer-meta').textContent   = 'Receiver · Ready';
    document.getElementById('peer-info-card').classList.remove('hidden');
  }

  setNavStatus('connected', 'Peer connected');
  showToast('Receiver joined the room!', 'success');
}

/**
 * Called when the WebRTC data channel opens.
 */
function onDataChannelOpen() {
  // BACKEND/WEBRTC TRIGGER: dataChannel.onopen = () => onDataChannelOpen()
  // (see the RTCDataChannel setup sketched inside onPeerJoined above).
  // This is the moment it becomes ACTUALLY safe to send files — the
  // RTCPeerConnection's data channel has finished its handshake and is
  // writable. appState.connected is set true here, which is what
  // setSendButtonState() checks before enabling the Send button — so
  // make sure this function is wired to the real dataChannel.onopen
  // event and not left on a timer.
  appState.connected = true;

  const dot   = document.getElementById('step-dc-dot');
  const sub   = document.getElementById('step-dc-sub');
  const badge = document.getElementById('badge-dc');

  dot.className = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500/15';
  dot.innerHTML = `<svg width="13" height="13" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
  sub.textContent   = 'Open and ready';
  badge.textContent = 'Open';
  badge.className   = 'badge badge-green ml-auto text-xs flex-shrink-0';

  setSendButtonState();
  setNavStatus('connected', 'Ready to transfer');
  showToast('Data channel open — you can now send files!', 'success');
}

/* ─────────────────────────────────────────────────────────────────────────
   TRANSFER — SENDER SIDE
   ───────────────────────────────────────────────────────────────────────── */

async function startTransfer() {
  // ── SENDER SIDE REAL IMPLEMENTATION ─────────────────────────────────
  // This function (NOT the demo override near the bottom of the file —
  // see the "DEMO SIMULATIONS" section comment) is the one to flesh out
  // with real dataChannel.send(...) calls. The overall shape — loop over
  // files, loop over chunks, update progress UI as you go — stays the
  // same. Only the three "BACKEND:" comments below need real code, plus
  // the flow-control note on CHUNK_SIZE/chunk sending.
  if (appState.files.length === 0 || !appState.connected) return;
  appState.transferring = true;

  document.getElementById('transfer-status-block').classList.remove('hidden');
  document.getElementById('btn-send-files').disabled = true;
  setNavStatus('transferring', 'Sending…');

  const files      = appState.files;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  let sentBytes    = 0;
  let startTime    = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];

    document.getElementById('transfer-file-progress').textContent = `File ${i + 1} of ${files.length}: ${file.name}`;

    // BACKEND: Send file-meta message:
    //   dataChannel.send(JSON.stringify({
    //     type: 'file-meta',
    //     name: file.name,
    //     size: file.size,
    //     mime: file.type || 'application/octet-stream',
    //     index: i,
    //     total: files.length,
    //   }));

    // ── SEND 'file-meta' (JSON string, ONE message, BEFORE any chunks) ──
    // This is the first thing the receiver sees for this file. It's
    // what triggers onFileMetaReceived() on the other side, which is the
    // function that reveals the receiver's file-list/progress UI (after
    // the folder-picker gate is satisfied). Send it here, before the
    // chunk-reading loop below begins.

    const CHUNK_SIZE = 16 * 1024;
    // CHUNK_SIZE: 16KB is a safe, universally-supported default for
    // RTCDataChannel messages. Per the PRD's "adaptive chunk sizing by
    // device tier", capable devices/connections can use larger chunks
    // (e.g. 64KB-256KB) to cut per-message overhead — just stay at or
    // below 256KB to avoid hitting per-message size limits in some
    // browsers' SCTP implementations.
    const reader     = new FileReader();
    let offset       = 0;

    await new Promise((resolve, reject) => {
      function readNextChunk() {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
      }

      reader.onload = (e) => {
        const chunk = e.target.result;

        // BACKEND: dataChannel.send(chunk);

        // ── SEND BINARY CHUNK (ArrayBuffer) ────────────────────────────
        //   dataChannel.send(chunk);
        //
        // FLOW CONTROL (PRD "four-layer buffer model"): before sending,
        // check dataChannel.bufferedAmount. If it exceeds a high-water
        // mark (e.g. 1MB), await the channel's 'bufferedamountlow' event
        // before calling send() again, e.g.:
        //
        //   const HIGH_WATER = 1 * 1024 * 1024;
        //   if (dataChannel.bufferedAmount > HIGH_WATER) {
        //     await new Promise(res => {
        //       dataChannel.onbufferedamountlow = () => {
        //         dataChannel.onbufferedamountlow = null;
        //         res();
        //       };
        //     });
        //   }
        //   dataChannel.send(chunk);
        //
        // No per-chunk acknowledgement from the receiver is needed — the
        // channel is ordered+reliable, so the receiver can assume every
        // binary message arriving between this file's 'file-meta' and
        // its 'file-end' belongs to this file, in order.

        offset    += chunk.byteLength;
        sentBytes += chunk.byteLength;

        const overallPct = Math.round((sentBytes / totalBytes) * 100);
        document.getElementById('overall-progress-bar').style.width = overallPct + '%';
        document.getElementById('transfer-pct').textContent = overallPct + '%';

        const elapsedSec = (Date.now() - startTime) / 1000;
        const speed      = sentBytes / elapsedSec;
        document.getElementById('transfer-speed').textContent = formatBytes(speed) + '/s';

        if (offset < file.size) {
          readNextChunk();
        } else {
          // BACKEND: dataChannel.send(JSON.stringify({ type: 'file-end', index: i }));

          // ── SEND 'file-end' (JSON string, ONE message, AFTER the last
          //    chunk for this file) ────────────────────────────────────
          //   dataChannel.send(JSON.stringify({ type: 'file-end', index: i }));
          //
          // Tells the receiver "you now have every byte of file i — go
          // ahead and finalize it". The receiver responds by assembling
          // its buffered chunks into a Blob (or finalizing its OPFS /
          // File System Access write stream) and calling
          // onFileComplete(i, file.name, blob).
          resolve();
        }
      };

      reader.onerror = () => {
        showToast(`Error reading ${file.name}`, 'error');
        reject(reader.error);
      };

      readNextChunk();
    }).catch(() => {});
  }

  // BACKEND: dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));

  // ── SEND 'transfer-complete' (JSON string, ONE message, AFTER the
  //    LAST file's 'file-end') ──────────────────────────────────────────
  //   dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));
  //
  // The receiver responds by calling onTransferComplete(), which shows
  // the "all files received" card and sets the overall progress to 100%.

  appState.transferring = false;
  setNavStatus('done', 'Transfer complete');
  showTransferComplete(files, totalBytes);
}

function showTransferComplete(files, totalBytes) {
  const listEl = document.getElementById('complete-file-list');
  listEl.innerHTML = files.map(f => `
    <div class="file-row flex items-center gap-3">
      <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-500/12">
        ${fileTypeIcon(f.name)}
      </div>
      <span class="text-sm text-white flex-1 truncate min-w-0">${escHtml(f.name)}</span>
      <span class="text-xs font-mono text-slate-400 flex-shrink-0">${formatBytes(f.size)}</span>
      <span class="badge badge-green text-xs flex-shrink-0">Sent</span>
    </div>
  `).join('');

  document.getElementById('complete-summary').textContent =
    `${files.length} file${files.length !== 1 ? 's' : ''} · ${formatBytes(totalBytes)} transferred successfully.`;

  showPage('complete');
}

/* ─────────────────────────────────────────────────────────────────────────
   TRANSFER — RECEIVER SIDE
   ───────────────────────────────────────────────────────────────────────── */

// ── RECEIVER SIDE: real dataChannel.onmessage handler (shared context for
//    onFileMetaReceived / onChunkReceived / onFileComplete / onTransferComplete
//    below) ──────────────────────────────────────────────────────────────
//
//   let currentFile = null;  // tracks the file currently being received
//   let allFilesMeta = [];   // every 'file-meta' seen so far, for overall %
//
//   dataChannel.onmessage = (event) => {
//     if (typeof event.data === 'string') {
//       const msg = JSON.parse(event.data);
//       switch (msg.type) {
//
//         case 'file-meta':
//           allFilesMeta.push(msg);
//           currentFile = {
//             ...msg,                 // name, size, mime, index, total
//             receivedBytes: 0,
//             chunks: [],             // see MEMORY NOTE below
//             startTime: Date.now(),
//           };
//           onFileMetaReceived(msg);
//           break;
//
//         case 'file-end': {
//           const blob = new Blob(currentFile.chunks, { type: currentFile.mime });
//           onFileComplete(msg.index, currentFile.name, blob);
//           currentFile = null;
//           break;
//         }
//
//         case 'transfer-complete':
//           onTransferComplete();
//           break;
//       }
//       return;
//     }
//
//     // event.data is an ArrayBuffer (binary chunk) for `currentFile`
//     currentFile.chunks.push(event.data);
//     currentFile.receivedBytes += event.data.byteLength;
//
//     // overallPct: sum of bytes received across ALL files so far,
//     // divided by sum of sizes from every 'file-meta' received so far.
//     // (allFilesMeta[].size gives the denominator; track a running
//     // grandTotalReceived alongside currentFile.receivedBytes for the
//     // numerator.)
//     const overallPct = /* computed as above */;
//     const speedBps = currentFile.receivedBytes /
//       ((Date.now() - currentFile.startTime) / 1000);
//
//     onChunkReceived(currentFile.index, currentFile.receivedBytes,
//                     currentFile.size, overallPct, speedBps);
//   };
//
// MEMORY NOTE: buffering every chunk into `currentFile.chunks` (as above)
// is fine for small/medium files, but holds the whole file in RAM until
// 'file-end'. For large files, per the PRD's OPFS / File System Access
// routing: instead of pushing to `chunks`, write each ArrayBuffer chunk
// directly to a FileSystemWritableFileStream. With the folder gate above,
// that stream is now obtained as:
//
//   const fileHandle = await folderGate.directoryHandle.getFileHandle(
//     currentFile.name, { create: true }
//   );
//   const writable = await fileHandle.createWritable();
//   // ...then on each binary chunk: await writable.write(event.data);
//   // ...and on 'file-end': await writable.close();
//
// This is the key benefit of gating on a folder up front: because the
// user already granted a directory handle BEFORE any chunks arrive, every
// subsequent per-file write can go straight to disk via
// folderGate.directoryHandle, with no further permission prompts and no
// need for the single synchronous-gesture-only showSaveFilePicker() call
// per file. In that case 'file-end' just closes the stream, and
// onFileComplete() can skip the `new Blob(...)` step and the object-URL
// download link entirely — it would just flip the row's badge to "Saved".

/**
 * Reveal the receiver's transfer UI (file-list section, overall progress
 * block) and create the first file row. This is the part of the ORIGINAL
 * onFileMetaReceived() that used to run unconditionally — it's been
 * factored out into its own function so it can be invoked either:
 *   (a) immediately, when the folder gate is already satisfied, or
 *   (b) later, via confirmFolderSelected()'s pendingMeta replay, if the
 *       folder picker was still open when this meta arrived.
 *
 * @param {{ name: string, size: number, mime: string, index: number, total: number }} meta
 */
function revealReceiverTransferUI(meta) {
  // ── Reveal transfer UI now that the sender has actually started AND
  //    the user has confirmed a destination folder ──
  document.getElementById('receiver-files-section').classList.remove('hidden');
  document.getElementById('receiver-overall-block').classList.remove('hidden');
  document.getElementById('receiver-tips').classList.add('hidden');
  setNavStatus('transferring', 'Receiving…');

  // Update connected status card to reflect active transfer
  document.getElementById('receiver-status-label').textContent = 'Transfer in progress';
  document.getElementById('receiver-status-sub').textContent   = `Receiving file ${meta.index + 1} of ${meta.total}…`;

  const container = document.getElementById('receiver-files-container');
  const rowId     = 'recv-file-' + meta.index;

  const row = document.createElement('div');
  row.id        = rowId;
  row.className = 'file-row flex flex-col gap-2';
  row.innerHTML = `
    <div class="flex items-center gap-3">
      <div class="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
           style="background:rgba(74,222,128,0.1)">
        ${fileTypeIcon(meta.name)}
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-sm text-white truncate">${escHtml(meta.name)}</p>
        <p class="text-xs text-slate-500">${formatBytes(meta.size)}</p>
      </div>
      <span class="badge badge-yellow text-xs flex-shrink-0" id="recv-badge-${meta.index}">Queued</span>
    </div>
    <div class="w-full bg-[#2a3045] rounded-full h-1.5 overflow-hidden">
      <div id="recv-bar-${meta.index}" class="progress-fill h-1.5 rounded-full" style="width:0%; background:#4ade80;"></div>
    </div>
    <div id="recv-save-${meta.index}" class="hidden"></div>
  `;
  container.appendChild(row);

  document.getElementById('recv-file-label').textContent = `File ${meta.index + 1} of ${meta.total}`;
}

/**
 * Call this when the receiver gets a 'file-meta' message from the sender.
 *
 * ── KEY CHANGE (folder gate): this is now the trigger point for the
 *    folder-picker modal as well as the file-transfer UI reveal. The
 *    gating rule is:
 *
 *      - If folderGate.ready is FALSE, this is necessarily the FIRST
 *        'file-meta' of the batch (every later meta will only arrive
 *        after this one has been handled, by which point the gate will
 *        already be open) — so show the folder-picker modal and STASH
 *        this meta in folderGate.pendingMeta. Do NOT touch the receiver
 *        UI yet. revealReceiverTransferUI(meta) will be called later,
 *        from confirmFolderSelected(), once the user actually picks a
 *        folder (or acknowledges the unsupported-browser fallback).
 *
 *      - If folderGate.ready is TRUE (every 'file-meta' after the first
 *        one in a batch, or any meta in a later batch within the same
 *        receiver session if the user already picked a folder once),
 *        proceed exactly as before: reveal/extend the UI immediately.
 *
 * @param {{ name: string, size: number, mime: string, index: number, total: number }} meta
 */
function onFileMetaReceived(meta) {
  // BACKEND TRIGGER: dataChannel.onmessage, typeof event.data === 'string',
  // JSON.parse(event.data).type === 'file-meta'. `meta` is that parsed
  // object — pass it straight through, no transformation needed.

  if (!folderGate.ready) {
    // Gate is closed: block everything past this point. Stash the meta
    // so it isn't lost, and surface the folder-picker modal so the user
    // can choose where these files should be saved.
    folderGate.pendingMeta = meta;
    showFolderPickerModal();
    return;
  }

  // Gate already open (either the user picked a folder earlier in this
  // same batch/session) — proceed exactly as the original implementation
  // did.
  revealReceiverTransferUI(meta);
}

/**
 * Call this when a chunk arrives for a file.
 * @param {number} fileIndex
 * @param {number} receivedBytes
 * @param {number} totalBytes
 * @param {number} overallPct    - 0–100
 * @param {number} speedBps
 */
function onChunkReceived(fileIndex, receivedBytes, totalBytes, overallPct, speedBps) {
  // BACKEND TRIGGER: dataChannel.onmessage, event.data instanceof ArrayBuffer.
  // All five params are computed on the RECEIVER side (see the
  // dataChannel.onmessage sketch above the onFileMetaReceived doc comment)
  // — none of this is sent explicitly by the sender. `overallPct` should
  // be computed against the SUM of every file's `size` seen so far across
  // all 'file-meta' messages, not just the current file, so the overall
  // progress bar (recv-overall-bar) advances smoothly across a multi-file
  // batch instead of resetting at each file boundary.
  //
  // NOTE: with the folder gate in place, real binary chunks should never
  // reach this function before folderGate.ready is true — the sender
  // can't get a 'file-meta' acknowledgement-driven UI update until the
  // gate opens, and by protocol the sender only starts sending binary
  // chunks for a file AFTER that file's 'file-meta'. Still, defensively
  // bail out if somehow called while the gate is closed, rather than
  // touching DOM nodes that may not be visible yet.
  if (!folderGate.ready) return;

  const pct = Math.round((receivedBytes / totalBytes) * 100);
  const bar = document.getElementById(`recv-bar-${fileIndex}`);
  if (bar) bar.style.width = pct + '%';

  document.getElementById('recv-overall-bar').style.width = overallPct + '%';
  document.getElementById('recv-pct').textContent         = overallPct + '%';
  document.getElementById('recv-speed').textContent       = formatBytes(speedBps) + '/s';
}

/**
 * Call this when a complete file has been received and assembled.
 * @param {number} fileIndex
 * @param {string} fileName
 * @param {Blob}   blob
 */
function onFileComplete(fileIndex, fileName, blob) {
  // BACKEND TRIGGER: dataChannel.onmessage, JSON.parse(event.data).type
  // === 'file-end'. `fileIndex`/`fileName` come from currentFile (set
  // when 'file-meta' arrived); `blob` is built locally from
  // currentFile.chunks (new Blob(currentFile.chunks, { type: currentFile.mime })).
  // Nothing further is expected from the signaling server here — this is
  // purely local assembly + UI update.
  //
  // FOLDER-GATE INTEGRATION: if folderGate.directoryHandle is set (the
  // user picked a real folder, i.e. the File System Access path), the
  // real implementation should write directly into that folder instead
  // of falling back to the object-URL <a download> link below — see the
  // MEMORY NOTE above onFileMetaReceived's doc comment for the
  // getFileHandle()/createWritable() snippet. In that case `blob` may not
  // exist at all (bytes were streamed straight to disk per-chunk), so
  // skip the createObjectURL block and just mark the row "Saved":
  //
  //   if (folderGate.directoryHandle) {
  //     const badge = document.getElementById(`recv-badge-${fileIndex}`);
  //     if (badge) { badge.textContent = 'Saved'; badge.className = 'badge badge-green text-xs flex-shrink-0'; }
  //     showToast(`${fileName} saved to "${folderGate.directoryHandle.name}"`, 'success');
  //     return;
  //   }
  //
  // The block below remains as the FALLBACK path for browsers where
  // folderGate.unsupported is true (no File System Access API support),
  // where we still must hand the user a normal browser download.
  const badge = document.getElementById(`recv-badge-${fileIndex}`);
  if (badge) { badge.textContent = 'Done'; badge.className = 'badge badge-green text-xs flex-shrink-0'; }

  const saveEl = document.getElementById(`recv-save-${fileIndex}`);
  if (saveEl) {
    const url = URL.createObjectURL(blob);
    saveEl.classList.remove('hidden');
    saveEl.innerHTML = `
      <a href="${url}" download="${escHtml(fileName)}"
         class="btn btn-secondary text-xs py-1.5 px-3 inline-flex">
        <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
          <path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1M8 12l4 4m0 0l4-4m-4 4V3"/>
        </svg>
        Save ${escHtml(fileName)}
      </a>`;
  }

  showToast(`${fileName} ready to save!`, 'success');
}

/**
 * Call this when all files have been received.
 */
function onTransferComplete() {
  // BACKEND TRIGGER: dataChannel.onmessage, JSON.parse(event.data).type
  // === 'transfer-complete'. This is the LAST message the sender sends
  // for a batch — no payload, no further server interaction needed.
  document.getElementById('receiver-done-card').classList.remove('hidden');
  document.getElementById('recv-file-label').textContent    = 'All files received';
  document.getElementById('recv-overall-bar').style.width   = '100%';
  document.getElementById('recv-pct').textContent           = '100%';

  // Update status card
  document.getElementById('receiver-status-label').textContent = 'Transfer complete';
  document.getElementById('receiver-status-sub').textContent   = 'All files received successfully.';
  document.getElementById('receiver-status-badge').textContent = 'Done';
  document.getElementById('receiver-status-badge').className   = 'badge ml-auto flex-shrink-0 text-xs badge-green';
  document.getElementById('receiver-status-icon').innerHTML = `
    <svg width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;

  setNavStatus('done', 'All files received');
}

/* ─────────────────────────────────────────────────────────────────────────
   NAVIGATION HELPERS
   ───────────────────────────────────────────────────────────────────────── */

function goBack() {
  // BACKEND: Close any open data channels or signaling connections here.

  // ── BACKEND CONTRACT ─────────────────────────────────────────────────
  // Concretely:
  //   - dataChannel?.close();
  //   - peerConnection?.close();
  //   - socket.emit('leaveRoom', { roomCode: appState.roomId });
  //     (lets the server clear { roomCode -> socket.id } and notify the
  //     other peer via 'peer-disconnected', so THEIR UI can reset too)
  //   - clear any local receiver-side buffers/streams (currentFile = null,
  //     close any open FileSystemWritableFileStream).
  resetNavChrome();
  resetFolderGate(); // NEW: don't let a chosen folder leak into the next session
  appState.role      = null;
  appState.roomId    = null;
  appState.connected = false;
  appState.files     = [];
  showPage('landing');
}

function handleDisconnect() {
  // BACKEND: peerConnection.close(); signalingSocket.emit('leave-room', ...);

  // ── BACKEND CONTRACT ─────────────────────────────────────────────────
  // Same cleanup as goBack() above:
  //   peerConnection?.close();
  //   socket.emit('leaveRoom', { roomCode: appState.roomId });
  //
  // Also, register a listener (once, near app init, not here) for the
  // OTHER side disconnecting first:
  //   socket.on('peer-disconnected', () => {
  //     showToast('Peer disconnected', 'warn');
  //     goBack();
  //   });
  showToast('Disconnected from room', 'warn');
  goBack();
}

function resetNavChrome() {
  document.getElementById('nav-status').classList.add('hidden');
  document.getElementById('nav-status').classList.remove('flex');
  document.getElementById('nav-room-chip').classList.add('hidden');
  document.getElementById('btn-disconnect').classList.add('hidden');
}

function sendMoreFiles() {
  appState.files        = [];
  appState.transferring = false;
  renderSenderFiles();
  setSendButtonState();
  document.getElementById('transfer-status-block').classList.add('hidden');
  showPage('sender');
}

function goHome() {
  resetNavChrome();
  resetFolderGate(); // NEW: same reasoning as goBack() above
  appState.role      = null;
  appState.roomId    = null;
  appState.connected = false;
  appState.files     = [];
  showPage('landing');
}

/* ─────────────────────────────────────────────────────────────────────────
   TOAST NOTIFICATION SYSTEM
   ── Rebuilt for mobile: full-width on small screens, word-wraps correctly,
      icon never shrinks, dismisses cleanly.
   ───────────────────────────────────────────────────────────────────────── */

const TOAST_STYLES = {
  success: { wrap: 'bg-green-500 border-green-500/25 text-white',    icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>` },
  error:   { wrap: 'bg-red-50 border-red-500/25 text-white',          icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>` },
  warn:    { wrap: 'bg-yellow-50 border-yellow-500/25 text-white', icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>` },
  info:    { wrap: 'bg-blue-50 border-blue-500/25 text-white',       icon: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>` },
};

/**
 * Show a toast notification.
 * @param {string} message
 * @param {'success'|'error'|'warn'|'info'} type
 * @param {number} duration - ms before auto-dismiss (default 3500)
 */
function showToast(message, type = 'info', duration = 3500) {
  const style = TOAST_STYLES[type] || TOAST_STYLES.info;

  const toast = document.createElement('div');
  toast.className = `toast-item ${style.wrap}`;
  toast.innerHTML = `
    <span class="toast-icon">${style.icon}</span>
    <span>${escHtml(message)}</span>`;

  const container = document.getElementById('toast-container');
  container.appendChild(toast);

  // Auto-dismiss with fade
  setTimeout(() => {
    toast.style.opacity    = '0';
    toast.style.transform  = 'translateY(-4px)';
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

/* ─────────────────────────────────────────────────────────────────────────
   UTILITY FUNCTIONS
   ───────────────────────────────────────────────────────────────────────── */

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fileTypeIcon(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const color = {
    pdf:  '#f87171', doc: '#60a5fa', docx: '#60a5fa',
    xls:  '#4ade80', xlsx: '#4ade80',
    jpg:  '#fb923c', jpeg: '#fb923c', png: '#fb923c', gif: '#fb923c', webp: '#fb923c',
    mp4:  '#a78bfa', mov: '#a78bfa', avi: '#a78bfa',
    mp3:  '#f472b6', wav: '#f472b6', flac: '#f472b6',
    zip:  '#facc15', rar: '#facc15', tar: '#facc15', gz: '#facc15',
    txt:  '#94a3b8', md: '#94a3b8',
    js:   '#facc15', ts: '#60a5fa', py: '#4ade80', html: '#fb923c',
  }[ext] || '#6b8eff';

  return `<svg width="16" height="16" fill="none" stroke="${color}" stroke-width="1.8" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>`;
}

/* ─────────────────────────────────────────────────────────────────────────
   DEMO SIMULATIONS
   BACKEND: Delete this entire section and wire up real events.
   ───────────────────────────────────────────────────────────────────────── */

// ════════════════════════════════════════════════════════════════════════
// REPLACEMENT MAP — what each demo function below stands in for, and what
// the real implementation actually wires it to:
//
//   simulatePeerJoin()
//     -> socket.on('peerJoined', ({ userName }) => onPeerJoined(userName))
//        (registered in initSenderPage, see comment there)
//
//   simulateReceiverConnect(code)
//     -> socket.once('roomJoined', ({ senderName }) => onReceiverConnected(senderName))
//        socket.once('roomNotFound', () => onRoomNotFound())
//        (registered in joinRoom, see comment there)
//
//   simulateIncomingFiles()
//     -> the full dataChannel.onmessage handler sketched above
//        onFileMetaReceived's doc comment (covers file-meta, binary
//        chunks, file-end, transfer-complete). NOTE: with the folder gate
//        added, the FIRST call to onFileMetaReceived() in this demo will
//        now pop the folder-picker modal and PAUSE the simulated transfer
//        until #btn-pick-folder is clicked — this is intentional and
//        mirrors exactly how the real transfer will behave.
//
//   The startTransfer() override further below (`startTransfer = function...`)
//     -> DELETE entirely. The REAL implementation lives in the
//        startTransfer() function defined earlier in this file (the one
//        with the file-meta / chunk / file-end / transfer-complete
//        BACKEND comments) — that's the one to flesh out, not this one.
// ════════════════════════════════════════════════════════════════════════

function simulatePeerJoin() {
  setTimeout(() => {
    if (appState.role === 'sender' && !appState.connected) {
      onPeerJoined('Alice (demo)');
    }
  }, 3000);
}

function simulateReceiverConnect(code) {
  setTimeout(() => {
    if (code.length === 6) {
      // In the real flow, 'Bob (demo sender)' below is replaced by
      // whatever `senderName` string arrives in the server's
      // 'roomJoined' payload (see joinRoom's BACKEND CONTRACT comment).
      onReceiverConnected('Bob (demo sender)');
      // ── KEY CHANGE: Incoming files only simulated when sender explicitly
      //    sends them. In demo, we add a 4-second delay to illustrate the
      //    "connected but waiting" state before transfer begins.
      setTimeout(() => simulateIncomingFiles(), 4000);
    } else {
      onRoomNotFound();
    }
  }, 1500);
}

function simulateIncomingFiles() {
  if (appState.role !== 'receiver') return;

  const fakeFiles = [
    { name: 'project-brief.pdf', size: 2.4  * 1024 * 1024, mime: 'application/pdf' },
    { name: 'design-mockup.png', size: 0.85 * 1024 * 1024, mime: 'image/png'       },
  ];

  fakeFiles.forEach((f, i) => {
    setTimeout(() => {
      onFileMetaReceived({ ...f, index: i, total: fakeFiles.length });

      const steps     = 20;
      const stepBytes = f.size / steps;
      let received    = 0;

      const interval = setInterval(() => {
        received += stepBytes;
        if (received > f.size) received = f.size;

        const overallPct = Math.round(
          ((i * f.size + received) / fakeFiles.reduce((s, x) => s + x.size, 0)) * 100
        );
        onChunkReceived(i, received, f.size, overallPct, 250 * 1024);

        if (received >= f.size) {
          clearInterval(interval);
          const blob = new Blob(['[demo file content]'], { type: f.mime });
          onFileComplete(i, f.name, blob);

          if (i === fakeFiles.length - 1) {
            setTimeout(onTransferComplete, 500);
          }
        }
      }, 150);
    }, i * 4000);
  });
}

/* ─────────────────────────────────────────────────────────────────────────
   SENDER: DEMO TRANSFER SIMULATION
   BACKEND: Remove this block once a real data channel exists.
   ───────────────────────────────────────────────────────────────────────── */

// This override exists ONLY so the demo has a visually smooth fake
// progress bar without real WebRTC plumbing. DELETE this whole block
// (the `_realStartTransfer` capture and the reassignment below it) once
// real dataChannel.send(...) calls are added to the startTransfer()
// function defined earlier in this file — that earlier definition is the
// real one, this is a throwaway shadow of it.
const _realStartTransfer = startTransfer;
startTransfer = function () {
  if (!appState.connected || appState.files.length === 0) return;

  appState.transferring = true;
  document.getElementById('transfer-status-block').classList.remove('hidden');
  document.getElementById('btn-send-files').disabled = true;
  setNavStatus('transferring', 'Sending…');

  const files      = appState.files;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  let sentBytes    = 0;
  let fileIdx      = 0;
  const startTime  = Date.now();

  const FAKE_CHUNK = 64 * 1024;
  let fileSent     = 0;

  const interval = setInterval(() => {
    const file = files[fileIdx];
    fileSent  += FAKE_CHUNK;
    sentBytes += FAKE_CHUNK;
    if (fileSent > file.size) { sentBytes -= (fileSent - file.size); fileSent = file.size; }

    const overallPct = Math.min(100, Math.round((sentBytes / totalBytes) * 100));
    document.getElementById('overall-progress-bar').style.width = overallPct + '%';
    document.getElementById('transfer-pct').textContent = overallPct + '%';
    document.getElementById('transfer-file-progress').textContent =
      `File ${fileIdx + 1} of ${files.length}: ${file.name}`;

    const speed = sentBytes / ((Date.now() - startTime) / 1000);
    document.getElementById('transfer-speed').textContent = formatBytes(speed) + '/s';

    if (fileSent >= file.size) {
      fileIdx++;
      fileSent = 0;
      if (fileIdx >= files.length) {
        clearInterval(interval);
        appState.transferring = false;
        setNavStatus('done', 'Transfer complete');
        showTransferComplete(files, totalBytes);
      }
    }
  }, 100);
};

/* ═════════════════════════════════════════════════════════════════════════
   EVENT LISTENERS
   ═════════════════════════════════════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {

  // ── Landing page ───────────────────────────────────────────────────────
  document.getElementById('btn-role-sender')
    .addEventListener('click', () => selectRole('sender'));

  document.getElementById('btn-role-receiver')
    .addEventListener('click', () => selectRole('receiver'));

  // ── Navbar ─────────────────────────────────────────────────────────────
  document.getElementById('btn-disconnect')
    .addEventListener('click', handleDisconnect);

  // ── Sender page ────────────────────────────────────────────────────────
  document.getElementById('btn-sender-back')
    .addEventListener('click', goBack);

  document.getElementById('btn-copy-room')
    .addEventListener('click', copyRoomId);

  const dropZone = document.getElementById('sender-drop-zone');
  dropZone.addEventListener('click',     triggerFileInput);
  dropZone.addEventListener('dragover',  onDragOver);
  dropZone.addEventListener('dragleave', onDragLeave);
  dropZone.addEventListener('drop',      onDrop);

  document.getElementById('file-input')
    .addEventListener('change', onFileInputChange);

  document.getElementById('btn-clear-files')
    .addEventListener('click', clearFiles);

  document.getElementById('sender-files-container')
    .addEventListener('click', (event) => {
      const btn = event.target.closest('[data-remove-index]');
      if (btn) removeFile(Number(btn.dataset.removeIndex));
    });

  document.getElementById('btn-send-files')
    .addEventListener('click', async()=> {
      const Files = appState.files
            console.log(Files)
           await sendMeta()


    });

  // ── Receiver page ──────────────────────────────────────────────────────
  document.getElementById('btn-receiver-back')
    .addEventListener('click', goBack);

  document.getElementById('room-code-input')
    .addEventListener('input', function () { onRoomCodeInput(this); });

  document.getElementById('btn-join-room')
    .addEventListener('click', joinRoom);

  // ── Folder picker modal (NEW) ────────────────────────────────────────
  // Direct, synchronous click listener — required so
  // window.showDirectoryPicker() inside pickFolder() still counts as a
  // user-gesture-triggered call. See the long comment above pickFolder()
  // for the full explanation of this constraint.
  document.getElementById('btn-pick-folder')
    .addEventListener('click', pickFolder);

  // ── Transfer complete page ─────────────────────────────────────────────
  document.getElementById('btn-send-more')
    .addEventListener('click', sendMoreFiles);

  document.getElementById('btn-go-home')
    .addEventListener('click', goHome);

}); // end DOMContentLoaded

export { appState ,onReceiverConnected,onRoomNotFound,onPeerJoined,onDataChannelOpen,onFileMetaReceived};