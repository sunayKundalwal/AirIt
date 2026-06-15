//   ═══════════════════════════════════════════════════════════════════════
//        JAVASCRIPT — WebRTC P2P Transfer Platform
//        ───────────────────────────────────────────────────────────────────────
//        Architecture overview:
//        ─────────────────────
//        The UI is entirely decoupled from the WebRTC/signaling layer.
//        All WebRTC calls are funnelled through a single `PeerConnection` object
//        defined at the bottom of this script. UI functions call into it, and it
//        fires callbacks that update the UI.

//        Pages / state machine:
//        ──────────────────────
//          landing  →  sender-setup  →  (transfer)  →  complete
//          landing  →  receiver-setup →  (incoming files)

//        The global `appState` object is the single source of truth for:
//          • which role the user has chosen (sender / receiver)
//          • the current room ID
//          • the list of queued files (sender)
//          • transfer progress

//        Event listeners:
//        ─────────────────
//        All event listeners are registered at the bottom of this file in the
//        "EVENT LISTENERS" section. Search for that heading to find them quickly.
//        No onclick/oninput/ondrop attributes are used in the HTML — everything
//        is wired up via addEventListener() for clean separation.

//        Wiring to your real backend:
//        ─────────────────────────────
//        Search for "BACKEND:" comments — those mark every place where you need
//        to plug in your actual WebSocket / signaling calls and WebRTC logic.
//        The rest is purely UI/UX.
//        ═══════════════════════════════════════════════════════════════════════ -->
//   <script>
    /* ─────────────────────────────────────────────────────────────────────────
       APP STATE
       A single plain object that holds everything the UI needs to know.
       Mutate via helper functions, never directly from event handlers.
       ───────────────────────────────────────────────────────────────────────── */

       import { socket, userName } from "./socket.js";
import { roomCode } from "./socketEvents.js ";
    const appState = {
      role:         null,   // 'sender' | 'receiver'
      roomId:       null,   // 6-char string
      SenderRoomId: null,   // 6-char string
      files:        [],     // Array<File>  — sender only
      peerName:     null,   // Display name of the remote peer
      connected:    false,  // Whether the WebRTC data channel is open
      transferring: false,  // Transfer in progress
    };

    /* ─────────────────────────────────────────────────────────────────────────
       PAGE ROUTER
       Simple show/hide mechanism. Each "page" is a <div id="page-*">.
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
       Called when user clicks a role card on the landing page.
       ───────────────────────────────────────────────────────────────────────── */

    /**
     * Select sender or receiver role, update state, and navigate to the
     * appropriate setup page.
     * @param {'sender'|'receiver'} role
     */
    function selectRole(role) {
      appState.role = role;
      appState.peerName = document.getElementById("peer-name").textContent

      if (role === 'sender') {
        // Generate a room ID and show sender page
        const roomId = roomCode;
        
        appState.roomId = roomId;
        initSenderPage(roomId);
        showPage('sender');

        // BACKEND: Create a room on your signaling server here.
        //   e.g. signalingSocket.emit('create-room', { roomId });
        //   Then listen for 'peer-joined' events.

      } else {
        // Navigate to receiver page (user will type room code there)
        initReceiverPage();
        showPage('receiver');
      }

      // Show nav chrome
      showNavChrome(role);
    }

    /* ─────────────────────────────────────────────────────────────────────────
       ROOM ID GENERATION
       Generates a random 6-character alphanumeric room code.
       In production, your server should assign room IDs to prevent collisions.
       ───────────────────────────────────────────────────────────────────────── */

    /**
     * Generate a random 6-character uppercase alphanumeric room ID.
     * Omits visually ambiguous characters: 0/O and 1/I.
     * @returns {string}
     */
    // function generateRoomId() {
    //   // BACKEND: Replace this with a server-assigned room ID if needed.
    //   const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    //   return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
    // }

    /* ─────────────────────────────────────────────────────────────────────────
       SENDER PAGE INIT
       Populates the room ID, resets file state.
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

      // Simulate peer joining after a delay for demonstration
      // BACKEND: Remove this and instead react to real 'peer-joined' WebSocket events.
      simulatePeerJoin();
    }

    /* ─────────────────────────────────────────────────────────────────────────
       RECEIVER PAGE INIT
       Resets the receiver page to the "enter code" state.
       ───────────────────────────────────────────────────────────────────────── */

    function initReceiverPage() {
      // Reset join form
      const input = document.getElementById('room-code-input');
      if (input) input.value = '';
      document.getElementById('btn-join-room').disabled = true;
      document.getElementById('join-error').classList.add('hidden');
      document.getElementById('receiver-status-card').classList.add('hidden');
      document.getElementById('receiver-files-section').classList.add('hidden');
      document.getElementById('receiver-done-card').classList.add('hidden');
      document.getElementById('receiver-overall-block').classList.add('hidden');
      document.getElementById('sender-info-card').classList.add('hidden');
    }

    /* ─────────────────────────────────────────────────────────────────────────
       NAV CHROME
       Shows/hides the navbar status indicator, room chip, disconnect button.
       ───────────────────────────────────────────────────────────────────────── */

    /**
     * Show the nav chrome (status, room chip, disconnect) appropriate for the role.
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

      // Dot color map
      const colors = {
        waiting:      'bg-yellow-400',
        connecting:   'bg-blue-400',
        connected:    'bg-green-400',
        transferring: 'bg-blue-400',
        done:         'bg-green-400',
      };
      dot.className = `w-2 h-2 rounded-full ${colors[state] || 'bg-slate-400'} ${state !== 'done' ? 'dot-pulse' : ''}`;
    }

    /* ─────────────────────────────────────────────────────────────────────────
       COPY ROOM ID
       Copies the room ID to clipboard and flashes the button green.
       ───────────────────────────────────────────────────────────────────────── */

    function copyRoomId() {
      navigator.clipboard.writeText(appState.roomId).then(() => {
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
       Handles both click-to-browse and drag-and-drop.
       ───────────────────────────────────────────────────────────────────────── */

    /** Open the hidden file <input> */
    function triggerFileInput() {
      document.getElementById('file-input').click();
    }

    /** Prevent default so drag-enter events work correctly */
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
      event.target.value = ''; // reset so the same file can be re-added
    }

    /**
     * Merge new files into the queue, skipping exact duplicates (same name + size).
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
     * Called from dynamically rendered "remove" buttons inside renderSenderFiles().
     * @param {number} index
     */
    function removeFile(index) {
      appState.files.splice(index, 1);
      renderSenderFiles();
      setSendButtonState();
    }

    /** Clear all queued files */
    function clearFiles() {
      appState.files = [];
      renderSenderFiles();
      setSendButtonState();
    }

    /** Render the file list rows in the sender panel */
    function renderSenderFiles() {
      const container = document.getElementById('sender-files-container');
      const section   = document.getElementById('sender-file-list');

      if (appState.files.length === 0) {
        section.classList.add('hidden');
        return;
      }

      section.classList.remove('hidden');
      // Note: each "remove" button uses a data attribute instead of an inline
      // onclick. The delegated listener is set up in the EVENT LISTENERS section.
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
          <!--
            data-remove-index is read by the delegated click listener on
            #sender-files-container (see EVENT LISTENERS section).
          -->
          <button
            data-remove-index="${i}"
            class="btn btn-ghost p-1.5 text-slate-500 hover:text-red-400"
            title="Remove"
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      `).join('');

      // Totals
      const totalBytes = appState.files.reduce((s, f) => s + f.size, 0);
      document.getElementById('sender-file-count').textContent = `${appState.files.length} file${appState.files.length !== 1 ? 's' : ''}`;
      document.getElementById('sender-total-size').textContent = formatBytes(totalBytes);
    }

    /**
     * Enable or disable the Send button based on readiness:
     * user must have files queued AND be connected to a peer.
     */
    function setSendButtonState() {
      const ready = appState.files.length > 0 && appState.connected;
      document.getElementById('btn-send-files').disabled = !ready;
    }

    /* ─────────────────────────────────────────────────────────────────────────
       RECEIVER — JOIN ROOM
       ───────────────────────────────────────────────────────────────────────── */

    /**
     * Called on every keystroke in the room code input.
     * Auto-uppercases, strips non-alphanumeric chars, enables Join once 6 chars.
     * @param {HTMLInputElement} input
     */
    function onRoomCodeInput(input) {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      document.getElementById('btn-join-room').disabled = input.value.length < 6;
      document.getElementById('join-error').classList.add('hidden');
    }

    /** Attempt to join a room as receiver */
    function joinRoom() {
      const code = document.getElementById('room-code-input').value.trim().toUpperCase();
      if (code.length !== 6) return;

      appState.roomId = code;
      document.getElementById('nav-room-id-label').textContent = code;
      appState.SenderRoomId = code

      // Lock the form while connecting
      document.getElementById('room-code-input').disabled = true;
      document.getElementById('btn-join-room').disabled   = true;

      // Show connecting state
      document.getElementById('receiver-status-card').classList.remove('hidden');
      setNavStatus('connecting', 'Connecting…');

      // BACKEND: Send a 'join-room' request to your signaling server here.
      //   e.g. signalingSocket.emit('join-room', { roomId: code });
      //   Then listen for 'room-joined' (success) or 'room-not-found' (error).
      //   On success: call onReceiverConnected()
      //   On error:   call onRoomNotFound()
      //
      // For now, we simulate with a timeout:
      console.log("reached here")
    
      socket.emit("joinRoom",{roomCode:code , userName : "Meow"})
      //simulateReceiverConnect(code);
    }

    /**
     * Called when the receiver has successfully connected and the data channel is open.
     * @param {string} senderName - Display name of the sender (from signaling server)
     */
    function onReceiverConnected(senderName) {
      appState.connected = true;
      setNavStatus('connected', 'Connected');

      // Update status card
      document.getElementById('receiver-status-icon').innerHTML = `
        <svg width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
      document.getElementById('receiver-status-label').textContent = 'Peer connected';
      document.getElementById('receiver-status-sub').textContent   = 'Waiting for sender to start transfer…';
      document.getElementById('receiver-status-badge').textContent = 'Ready';
      document.getElementById('receiver-status-badge').className   = 'badge ml-auto badge-green';

      // Show sender info
      if (senderName) {
        appState.peerName = senderName;
        document.getElementById('sender-avatar').textContent = senderName.charAt(0).toUpperCase();
        document.getElementById('sender-name').textContent   = senderName;
        document.getElementById('sender-meta').textContent   = 'Sender';
        document.getElementById('sender-info-card').classList.remove('hidden');
      }

      showToast('Connected to sender!', 'success');
    }

    /** Called when the room code doesn't match any active room */
    function onRoomNotFound() {
      document.getElementById('room-code-input').disabled = false;
      document.getElementById('btn-join-room').disabled   = false;
      document.getElementById('join-error').classList.remove('hidden');
      document.getElementById('receiver-status-card').classList.add('hidden');
      showToast('Room not found', 'error');
    }

    /* ─────────────────────────────────────────────────────────────────────────
       SENDER — PEER JOINED HANDLER
       Called by your signaling server when a receiver enters the room.
       ───────────────────────────────────────────────────────────────────────── */

    /**
     * Update sender UI once a peer has joined the room.
     * @param {string} peerName - Display name of the receiver
     */
    function onPeerJoined(peerName) {
      // Update connection steps
      const dot   = document.getElementById('step-peer-dot');
      const label = document.getElementById('step-peer-label');
      const sub   = document.getElementById('step-peer-sub');
      const badge = document.getElementById('badge-peer');

      dot.className = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500/15';
      dot.innerHTML = `<svg width="13" height="13" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
      label.textContent = peerName || 'Receiver';
      label.className   = 'text-sm text-white';
      sub.textContent   = 'Peer is ready to receive';
      badge.textContent = 'Connected';
      badge.className   = 'badge badge-green ml-auto text-xs';

      // Data channel step
      setTimeout(() => {
        // Simulate data channel opening shortly after peer connects
        // BACKEND: Replace with real data channel open event
        onDataChannelOpen();
      }, 800);

      // Show peer info card
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
     * Called when the WebRTC data channel opens (both sides ready to transfer).
     */
    function onDataChannelOpen() {
      appState.connected = true;

      // Update data channel step
      const dot   = document.getElementById('step-dc-dot');
      const sub   = document.getElementById('step-dc-sub');
      const badge = document.getElementById('badge-dc');

      dot.className = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500/15';
      dot.innerHTML = `<svg width="13" height="13" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
      sub.textContent   = 'Open and ready';
      badge.textContent = 'Open';
      badge.className   = 'badge badge-green ml-auto text-xs';

      setSendButtonState(); // Now enabled if files are queued
      setNavStatus('connected', 'Ready to transfer');
      showToast('Data channel open — you can now send files!', 'success');
    }

    /* ─────────────────────────────────────────────────────────────────────────
       TRANSFER — SENDER SIDE
       Reads files in chunks and sends them over the WebRTC data channel.
       ───────────────────────────────────────────────────────────────────────── */

    /** Start sending the queued files */
    async function startTransfer() {
      if (appState.files.length === 0 || !appState.connected) return;
      appState.transferring = true;

      // Show transfer status block
      document.getElementById('transfer-status-block').classList.remove('hidden');
      document.getElementById('btn-send-files').disabled = true;
      setNavStatus('transferring', 'Sending…');

      const files      = appState.files;
      const totalBytes = files.reduce((s, f) => s + f.size, 0);
      let sentBytes    = 0;
      let startTime    = Date.now();

      for (let i = 0; i < files.length; i++) {
        const file = files[i];

        // Update progress UI for current file
        document.getElementById('transfer-file-progress').textContent = `File ${i + 1} of ${files.length}: ${file.name}`;

        // BACKEND: Before reading file chunks, send a metadata message so the
        // receiver knows the file name, size, and MIME type:
        //   dataChannel.send(JSON.stringify({
        //     type: 'file-meta',
        //     name: file.name,
        //     size: file.size,
        //     mime: file.type || 'application/octet-stream',
        //     index: i,
        //     total: files.length,
        //   }));

        // Read and send the file in chunks (16 KB default for WebRTC data channels)
        const CHUNK_SIZE = 16 * 1024; // 16 KB
        const reader     = new FileReader();
        let offset       = 0;

        await new Promise((resolve, reject) => {
          function readNextChunk() {
            const slice = file.slice(offset, offset + CHUNK_SIZE);
            reader.readAsArrayBuffer(slice);
          }

          reader.onload = (e) => {
            const chunk = e.target.result;

            // BACKEND: Send the chunk over the data channel:
            //   dataChannel.send(chunk);

            offset    += chunk.byteLength;
            sentBytes += chunk.byteLength;

            // ── Update progress ──────────────────────────────────────────
            const overallPct = Math.round((sentBytes / totalBytes) * 100);
            document.getElementById('overall-progress-bar').style.width = overallPct + '%';
            document.getElementById('transfer-pct').textContent = overallPct + '%';

            // Speed calculation
            const elapsedSec = (Date.now() - startTime) / 1000;
            const speed      = sentBytes / elapsedSec;
            document.getElementById('transfer-speed').textContent = formatBytes(speed) + '/s';

            if (offset < file.size) {
              // More chunks remain for this file
              // BACKEND: Check dataChannel.bufferedAmount before sending next chunk
              // to avoid flooding the buffer. A typical threshold is 16 MB.
              readNextChunk();
            } else {
              // File finished
              // BACKEND: Send an 'end-of-file' signal:
              //   dataChannel.send(JSON.stringify({ type: 'file-end', index: i }));
              resolve();
            }
          };

          reader.onerror = () => {
            showToast(`Error reading ${file.name}`, 'error');
            reject(reader.error);
          };

          readNextChunk();
        }).catch(() => {}); // Continue with remaining files even if one fails
      }

      // All files sent
      // BACKEND: Send a 'transfer-complete' signal:
      //   dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));

      appState.transferring = false;
      setNavStatus('done', 'Transfer complete');
      showTransferComplete(files, totalBytes);
    }

    /** Navigate to the "Transfer complete" page with a summary */
    function showTransferComplete(files, totalBytes) {
      // Build summary list
      const listEl = document.getElementById('complete-file-list');
      listEl.innerHTML = files.map(f => `
        <div class="file-row flex items-center gap-3">
          <div class="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-green-500/12">
            ${fileTypeIcon(f.name)}
          </div>
          <span class="text-sm text-white flex-1 truncate">${escHtml(f.name)}</span>
          <span class="text-xs font-mono text-slate-400">${formatBytes(f.size)}</span>
          <span class="badge badge-green text-xs">Sent</span>
        </div>
      `).join('');

      document.getElementById('complete-summary').textContent =
        `${files.length} file${files.length !== 1 ? 's' : ''} · ${formatBytes(totalBytes)} transferred successfully.`;

      showPage('complete');
    }

    /* ─────────────────────────────────────────────────────────────────────────
       TRANSFER — RECEIVER SIDE
       Your backend will call these functions when events arrive over the
       WebRTC data channel.
       ───────────────────────────────────────────────────────────────────────── */

    /**
     * Call this when the receiver gets a 'file-meta' message from the sender.
     * Adds a new incoming file row with a progress bar.
     *
     * @param {{ name: string, size: number, mime: string, index: number, total: number }} meta
     */
    function onFileMetaReceived(meta) {
      // Show the incoming files section
      document.getElementById('receiver-files-section').classList.remove('hidden');
      document.getElementById('receiver-overall-block').classList.remove('hidden');
      document.getElementById('receiver-tips').classList.add('hidden');
      setNavStatus('transferring', 'Receiving…');

      // Create a row for this file
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
          <span class="badge badge-yellow text-xs" id="recv-badge-${meta.index}">Receiving</span>
        </div>
        <!-- Per-file progress bar -->
        <div class="w-full bg-[#2a3045] rounded-full h-1.5 overflow-hidden">
          <div id="recv-bar-${meta.index}" class="progress-fill h-1.5 rounded-full" style="width:0%; background:#4ade80;"></div>
        </div>
        <div id="recv-save-${meta.index}" class="hidden">
          <!-- Save button injected by onFileComplete() after file is fully received -->
        </div>
      `;
      container.appendChild(row);

      document.getElementById('recv-file-label').textContent = `File ${meta.index + 1} of ${meta.total}`;
    }

    /**
     * Call this when a chunk arrives for a file.
     * Updates that file's progress bar.
     *
     * @param {number} fileIndex    - Which file this chunk belongs to
     * @param {number} receivedBytes - Total bytes received so far for this file
     * @param {number} totalBytes   - Total size of this file
     * @param {number} overallPct   - 0–100 overall progress across all files
     * @param {number} speedBps     - Current speed in bytes/sec
     */
    function onChunkReceived(fileIndex, receivedBytes, totalBytes, overallPct, speedBps) {
      const pct = Math.round((receivedBytes / totalBytes) * 100);
      const bar = document.getElementById(`recv-bar-${fileIndex}`);
      if (bar) bar.style.width = pct + '%';

      // Overall bar
      document.getElementById('recv-overall-bar').style.width = overallPct + '%';
      document.getElementById('recv-pct').textContent         = overallPct + '%';
      document.getElementById('recv-speed').textContent       = formatBytes(speedBps) + '/s';
    }

    /**
     * Call this when a complete file has been received and assembled.
     * Shows a save/download button for that file.
     *
     * BACKEND: You'll accumulate ArrayBuffer chunks, combine them into a Blob,
     * then call this function with the resulting Blob.
     *
     * @param {number} fileIndex
     * @param {string} fileName
     * @param {Blob}   blob
     */
    function onFileComplete(fileIndex, fileName, blob) {
      const badge = document.getElementById(`recv-badge-${fileIndex}`);
      if (badge) { badge.textContent = 'Done'; badge.className = 'badge badge-green text-xs'; }

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
     * Call this when all files have been received (sender signals 'transfer-complete').
     */
    function onTransferComplete() {
      document.getElementById('receiver-done-card').classList.remove('hidden');
      document.getElementById('recv-file-label').textContent    = 'All files received';
      document.getElementById('recv-overall-bar').style.width   = '100%';
      document.getElementById('recv-pct').textContent           = '100%';
      setNavStatus('done', 'All files received');
    }

    /* ─────────────────────────────────────────────────────────────────────────
       NAVIGATION HELPERS
       ───────────────────────────────────────────────────────────────────────── */

    /** Go back to the landing page (role select) */
    function goBack() {
      // BACKEND: Close any open data channels or signaling connections here.
      resetNavChrome();
      appState.role      = null;
      appState.roomId    = null;
      appState.connected = false;
      appState.files     = [];
      showPage('landing');
    }

    /** Disconnect and go back to landing */
    function handleDisconnect() {
      // BACKEND: Close the peer connection and leave the room.
      //   peerConnection.close();
      //   signalingSocket.emit('leave-room', { roomId: appState.roomId });
      showToast('Disconnected from room', 'warn');
      goBack();
    }

    /** Reset nav to minimal state */
    function resetNavChrome() {
      document.getElementById('nav-status').classList.add('hidden');
      document.getElementById('nav-room-chip').classList.add('hidden');
      document.getElementById('btn-disconnect').classList.add('hidden');
    }

    /** Return to the sender page to queue more files (same room, same connection) */
    function sendMoreFiles() {
      appState.files        = [];
      appState.transferring = false;
      renderSenderFiles();
      setSendButtonState();
      document.getElementById('transfer-status-block').classList.add('hidden');
      showPage('sender');
    }

    /** Reset all state and return to the landing page */
    function goHome() {
      resetNavChrome();
      appState.role      = null;
      appState.roomId    = null;
      appState.connected = false;
      appState.files     = [];
      showPage('landing');
    }

    /* ─────────────────────────────────────────────────────────────────────────
       TOAST NOTIFICATION SYSTEM
       Lightweight, auto-dismissing notifications with 4 severity levels.
       ───────────────────────────────────────────────────────────────────────── */

    /**
     * Show a toast notification.
     * @param {string} message
     * @param {'success'|'error'|'warn'|'info'} type
     * @param {number} duration - ms before auto-dismiss (default 3500)
     */
    function showToast(message, type = 'info', duration = 3500) {
      const styles = {
        success: 'bg-green-500/10 border-green-500/25 text-green-300',
        error:   'bg-red-500/10   border-red-500/25   text-red-300',
        warn:    'bg-yellow-500/10 border-yellow-500/25 text-yellow-300',
        info:    'bg-brand-500/10  border-brand-500/25  text-brand-300',
      };
      const icons = {
        success: `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`,
        error:   `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
        warn:    `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>`,
        info:    `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>`,
      };

      const toast = document.createElement('div');
      toast.className = `pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-xl border text-sm font-medium shadow-lg animate-fade-in ${styles[type] || styles.info}`;
      toast.innerHTML = `${icons[type] || icons.info}<span>${escHtml(message)}</span>`;

      const container = document.getElementById('toast-container');
      container.appendChild(toast);

      // Auto-dismiss
      setTimeout(() => {
        toast.style.opacity    = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
      }, duration);
    }

    /* ─────────────────────────────────────────────────────────────────────────
       UTILITY FUNCTIONS
       ───────────────────────────────────────────────────────────────────────── */

    /**
     * Human-readable byte sizes.
     * @param {number} bytes
     * @returns {string}
     */
    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const units = ['B', 'KB', 'MB', 'GB', 'TB'];
      const i = Math.floor(Math.log(bytes) / Math.log(1024));
      return (bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1) + ' ' + units[i];
    }

    /**
     * Escape HTML special characters to prevent XSS from file names.
     * @param {string} str
     * @returns {string}
     */
    function escHtml(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    /**
     * Return an inline SVG icon appropriate for a file extension.
     * Falls back to a generic document icon.
     * @param {string} fileName
     * @returns {string} - SVG markup string
     */
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
       These replace real signaling/WebRTC events for UI demonstration.
       BACKEND: Delete everything in this section and wire up real events.
       ───────────────────────────────────────────────────────────────────────── */

    /** Demo: simulate a peer joining ~3 seconds after sender creates the room */
    function simulatePeerJoin() {
      setTimeout(() => {
        if (appState.role === 'sender' && !appState.connected) {
          onPeerJoined('Alice (demo)');
        }
      }, 3000);
    }

    /**
     * Demo: simulate the receiver connecting to a room.
     * For a valid-looking code (non-empty), always "succeeds".
     * @param {string} code
     */
    function simulateReceiverConnect(code) {
      // Simulate network latency
      setTimeout(() => {
        if (code.length === 6) {
          onReceiverConnected('Bob (demo sender)');
          // Simulate incoming files after another delay
          setTimeout(() => simulateIncomingFiles(), 2000);
        } else {
          onRoomNotFound();
        }
      }, 1500);
    }

    /**
     * Demo: simulate the receiver getting 2 files.
     * BACKEND: Remove this; your WebRTC message handler drives these calls.
     */
    function simulateIncomingFiles() {
      if (appState.role !== 'receiver') return;

      const fakeFiles = [
        { name: 'project-brief.pdf', size: 2.4  * 1024 * 1024, mime: 'application/pdf' },
        { name: 'design-mockup.png', size: 0.85 * 1024 * 1024, mime: 'image/png'       },
      ];

      fakeFiles.forEach((f, i) => {
        setTimeout(() => {
          onFileMetaReceived({ ...f, index: i, total: fakeFiles.length });

          // Simulate chunk progress over 3 seconds
          const steps     = 20;
          const stepBytes = f.size / steps;
          let received    = 0;
          const interval  = setInterval(() => {
            received += stepBytes;
            if (received > f.size) received = f.size;

            const overallPct = Math.round(
              ((i * f.size + received) / fakeFiles.reduce((s, x) => s + x.size, 0)) * 100
            );
            onChunkReceived(i, received, f.size, overallPct, 250 * 1024);

            if (received >= f.size) {
              clearInterval(interval);
              // Build a tiny blob just for the download demo
              const blob = new Blob(['[demo file content]'], { type: f.mime });
              onFileComplete(i, f.name, blob);

              // If last file, signal transfer complete
              if (i === fakeFiles.length - 1) {
                setTimeout(onTransferComplete, 500);
              }
            }
          }, 150);
        }, i * 4000); // stagger each file
      });
    }

    /* ─────────────────────────────────────────────────────────────────────────
       SENDER: DEMO TRANSFER SIMULATION
       When "Send files" is pressed in demo mode (no real data channel),
       we run a fake chunk loop so the progress bars animate.
       BACKEND: This entire block is replaced by your real startTransfer() once
       a real data channel exists — the existing startTransfer() function above
       already reads real File objects and sends real chunks.
       ───────────────────────────────────────────────────────────────────────── */

    // Override startTransfer for demo mode (remove when wiring real WebRTC)
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

      // Fake a chunk loop at ~500 KB/s
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
       ─────────────────────────────────────────────────────────────────────────
       All DOM event bindings are here. When you move this script to an
       external file, keep this section at the bottom and wrap it in a
       DOMContentLoaded listener (or place your <script> tag before </body>
       so the DOM is already available).

       Quick reference — button IDs and their handlers:
       ──────────────────────────────────────────────────
         btn-role-sender      → selectRole('sender')
         btn-role-receiver    → selectRole('receiver')
         btn-disconnect       → handleDisconnect()
         btn-sender-back      → goBack()
         btn-copy-room        → copyRoomId()
         sender-drop-zone     → triggerFileInput() / drag events
         file-input           → onFileInputChange(event)
         btn-clear-files      → clearFiles()
         sender-files-container (delegated) → removeFile(index)
         btn-send-files       → startTransfer()
         btn-receiver-back    → goBack()
         room-code-input      → onRoomCodeInput(this)
         btn-join-room        → joinRoom()
         btn-send-more        → sendMoreFiles()
         btn-go-home          → goHome()
       ═════════════════════════════════════════════════════════════════════════ */

    document.addEventListener('DOMContentLoaded', () => {

      // ── Landing page ─────────────────────────────────────────────────────

      document.getElementById('btn-role-sender')
        .addEventListener('click', () => selectRole('sender'));

      document.getElementById('btn-role-receiver')
        .addEventListener('click', () => selectRole('receiver'));

      // ── Navbar ───────────────────────────────────────────────────────────

      document.getElementById('btn-disconnect')
        .addEventListener('click', handleDisconnect);

      // ── Sender page ──────────────────────────────────────────────────────

      document.getElementById('btn-sender-back')
        .addEventListener('click', goBack);

      document.getElementById('btn-copy-room')
        .addEventListener('click', copyRoomId);

      // Drop zone: click opens file picker; drag events handle drag-and-drop
      const dropZone = document.getElementById('sender-drop-zone');
      dropZone.addEventListener('click',     triggerFileInput);
      dropZone.addEventListener('dragover',  onDragOver);
      dropZone.addEventListener('dragleave', onDragLeave);
      dropZone.addEventListener('drop',      onDrop);

      // Hidden file input
      document.getElementById('file-input')
        .addEventListener('change', onFileInputChange);

      // "Clear all" button
      document.getElementById('btn-clear-files')
        .addEventListener('click', clearFiles);

      // Delegated listener for per-file "remove" buttons.
      // Buttons are created dynamically inside renderSenderFiles(), so we
      // listen on the stable parent container and check data-remove-index.
      document.getElementById('sender-files-container')
        .addEventListener('click', (event) => {
          const btn = event.target.closest('[data-remove-index]');
          if (btn) removeFile(Number(btn.dataset.removeIndex));
        });

      // Send files button
      document.getElementById('btn-send-files')
        .addEventListener('click', startTransfer);

      // ── Receiver page ────────────────────────────────────────────────────

      document.getElementById('btn-receiver-back')
        .addEventListener('click', goBack);

      // Room code input: sanitise and gate the Join button
      document.getElementById('room-code-input')
        .addEventListener('input', function () { onRoomCodeInput(this); });

      document.getElementById('btn-join-room')
        .addEventListener('click', joinRoom);

      // ── Transfer complete page ───────────────────────────────────────────

      document.getElementById('btn-send-more')
        .addEventListener('click', sendMoreFiles);

      document.getElementById('btn-go-home')
        .addEventListener('click', goHome);

    }); // end DOMContentLoaded

export {appState}