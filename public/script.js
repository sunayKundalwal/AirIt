
import { dirAckStatus } from "./dataChannel.js";
import { socket, userName } from "./socket.js";
import { roomCode }          from "./socketEvents.js";
import { call, dataChannel }       from "./webRTCConnection.js";

//App State ->
const appState = {
  role:         null,  //sender or Receiver
  roomId:       null,
  SenderRoomId: null,
  files:        [],
  peerName:     null,
  connected:    false,
  transferring: false,
};

//Folder picker (Reciever Side)
const folderGate = {
  directoryHandle: null,
  ready:           false,
  pendingMeta:     [],
  unsupported:     false,
};

function showFolderPickerModal() {
  const modal       = document.getElementById('folder-picker-modal');
  const errorEl     = document.getElementById('folder-picker-error');
  const fallbackNote = document.getElementById('folder-picker-fallback-note');
  const selectedEl  = document.getElementById('folder-picker-selected');

  errorEl.classList.add('hidden');
  errorEl.textContent = '';
  selectedEl.classList.add('hidden');

  if (typeof window.showDirectoryPicker !== 'function') {
    folderGate.unsupported = true;
    fallbackNote.textContent =
      'Your browser doesn\u2019t support folder selection — files will be saved individually via your browser\u2019s normal download prompt instead.';
     showToast('error',"'Your browser doesn\u2019t support folder selection — files will be saved individually via your browser\u2019s normal download prompt instead.'")
     setNavStatus('error',"Your Browser Does not Support folder selection")
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

async function pickFolder() {
  const errorEl = document.getElementById('folder-picker-error');
  errorEl.classList.add('hidden');

  if (typeof window.showDirectoryPicker !== 'function') {
    folderGate.unsupported     = true;
    folderGate.directoryHandle = null;
    confirmFolderSelected(null);
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
    folderGate.directoryHandle = handle;

    const selectedEl = document.getElementById('folder-picker-selected');
    const nameEl     = document.getElementById('folder-picker-name');
    nameEl.textContent = handle.name || 'Selected folder';
    selectedEl.classList.remove('hidden');

    confirmFolderSelected(handle);
  } catch (err) {
    if (err && err.name === 'AbortError') {
      errorEl.textContent = 'No folder selected. Choose a folder to continue receiving files.';
    } else {
      errorEl.textContent = 'Could not access that folder. Please try again.';
    }
    errorEl.classList.remove('hidden');
  }
}

function confirmFolderSelected(handle) {
  folderGate.ready = true;
  hideFolderPickerModal();

  showToast(
    handle ? `Saving files to "${handle.name}"` : 'Folder selection unavailable — using browser downloads',
    'success',
  );

  dataChannel.send(JSON.stringify({type: "DirAck" ,status : "success"}))

  if (folderGate.pendingMeta.length > 0) {
    const metas = [...folderGate.pendingMeta];   // snapshot before clearing
    console.log(metas)
    folderGate.pendingMeta = [];

    metas.forEach(meta => revealReceiverTransferUI(meta));   // render a row for EVERY queued file
  }
}

//Page router
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const target = document.getElementById('page-' + pageId);
  if (target) target.classList.add('active');
}

//Role Selection
function selectRole(role) {
  appState.role   = role;
  appState.peerName = document.getElementById('peer-name').textContent;

  if (role === 'sender') {
 socket.emit("createRoom");
    
    if(!roomCode){
       
      appState.roomId = '------';
      initSenderPage(appState.roomId);
      showPage('sender');
    }

  

    socket.once("generatedRoomCode", async ({ roomCode }) => {

         if(roomCode){
        console.log("reached call")
      await call()
          console.log("after call")
    }
      showPage('sender');
      appState.roomId = roomCode;
      initSenderPage(roomCode);

    });
    // const roomId = roomCode;

    // appState.roomId = roomId;
    // initSenderPage(roomId.toUpperCase());
    // showPage('sender');

    


    //socket.emit('createRoom', { roomCode: roomId });
  } else {
    initReceiverPage();
    showPage('receiver');
    resetFolderGate();
  }

  showNavChrome(role);
}

function resetFolderGate() {
  folderGate.directoryHandle = null;
  folderGate.ready           = false;
  folderGate.pendingMeta     = [];
  folderGate.unsupported     = false;
  hideFolderPickerModal();
}

//Sender page init
function initSenderPage(roomId) {
  document.getElementById('sender-room-id').textContent   = roomId.toUpperCase();
  
  appState.files = [];
  renderSenderFiles();
  //setSendButtonState();

  // on peer Joined adding ,users username
  socket.once('peerJoined', ({ userName: peerUserName }) => {
    onPeerJoined(peerUserName);
  });
}

//Receiver page init
function initReceiverPage() {
  const input = document.getElementById('room-code-input');
  if (input) input.value = '';
  document.getElementById('btn-join-room').disabled = true;
  document.getElementById('join-error').classList.add('hidden');
  document.getElementById('receiver-status-card').classList.add('hidden');
  document.getElementById('receiver-files-section').classList.add('hidden');
  document.getElementById('receiver-done-card').classList.add('hidden');
  document.getElementById('receiver-overall-block').classList.add('hidden');
  document.getElementById('sender-info-card').classList.add('hidden');

  const tipsCard = document.getElementById('receiver-tips');
  if (tipsCard) tipsCard.classList.remove('hidden');

  const container = document.getElementById('receiver-files-container');
  if (container) container.innerHTML = '';
}

//Nav chrome
function showNavChrome(role) {
  document.getElementById('nav-status').classList.remove('hidden');
  document.getElementById('nav-status').classList.add('flex');
 
  document.getElementById('btn-disconnect').classList.remove('hidden');
  setNavStatus('waiting', 'Waiting for peer…');
}

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
    error :       'bg-red-400'
  };
  dot.className = `w-2 h-2 rounded-full flex-shrink-0 ${colors[state] || 'bg-slate-400'} ${state !== 'done' ? 'dot-pulse' : ''}`;
}

//Copy room id
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

//File input Sender
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

function onDrop(event) {
  event.preventDefault();
  event.stopPropagation();
  document.getElementById('sender-drop-zone').classList.remove('dragging');
  addFilesToQueue(Array.from(event.dataTransfer.files));
}

function onFileInputChange(event) {
  addFilesToQueue(Array.from(event.target.files));
  event.target.value = '';
}

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
           style="background:rgba(124,92,255,0.12)">
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

function setSendButtonState() {
  const ready = appState.files.length > 0 && appState.connected ;
  
  if(appState.connected == false){
    showToast("You are not connected to the receiver","warn")
  }
  else if(!dirAckStatus){
    showToast("Waiting for the receiver to select download location!","warn")
    setNavStatus('waiting', 'Waiting for the receiver to select folder');
  }else if(appState.files.length == 0){
    showToast("Select Files to Send First","warn")
    setNavStatus('waiting', 'Select Files to Send First');
  }

  if(appState.files.length > 0 && appState.connected && dirAckStatus){
       document.getElementById('btn-send-files').disabled = false;
       setNavStatus('connected', 'Ready to transfer');
  }
  
}

/* ─────────────────────────────────────────────────────────────────────────
   RECEIVER — JOIN ROOM
   ───────────────────────────────────────────────────────────────────────── */
function onRoomCodeInput(input) {
  input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  document.getElementById('btn-join-room').disabled = input.value.length < 6;
  document.getElementById('join-error').classList.add('hidden');
}

function joinRoom() {
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length !== 6) return;

  appState.roomId    = code;
  appState.SenderRoomId = code;
 

  document.getElementById('room-code-input').disabled = true;
  document.getElementById('btn-join-room').disabled   = true;

  document.getElementById('receiver-status-card').classList.remove('hidden');
  setNavStatus('connecting', 'Connecting…');

  socket.emit('joinRoom', { roomCode: code, userName });

  socket.once('roomJoined', ({ senderName }) => {
    onReceiverConnected(senderName);
  });

  socket.once('roomNotFound', () => {
    onRoomNotFound();
  });
}

function onReceiverConnected(senderName) {
  appState.connected = false;
  setNavStatus('connecting', 'Waiting for DataChannel to establish');

  document.getElementById('receiver-status-icon').innerHTML = `
    <svg width="16" height="16" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
  document.getElementById('receiver-status-label').textContent = 'Connected to sender';
  document.getElementById('receiver-status-sub').textContent   = 'Waiting for sender to start the transfer…';
  document.getElementById('receiver-status-badge').textContent = 'Ready';
  document.getElementById('receiver-status-badge').className   = 'badge ml-auto flex-shrink-0 text-xs badge-green';

  if (senderName) {
    appState.peerName = senderName;
    document.getElementById('sender-avatar').textContent = senderName.charAt(0).toUpperCase();
    document.getElementById('sender-name').textContent   = senderName;
    document.getElementById('sender-meta').textContent   = 'Sender';
    document.getElementById('sender-info-card').classList.remove('hidden');
  }

  showToast('Connected to sender — waiting for transfer to begin.', 'success');
}

function onRoomNotFound() {
  document.getElementById('room-code-input').disabled = false;
  document.getElementById('btn-join-room').disabled   = false;
  document.getElementById('join-error').classList.remove('hidden');
  document.getElementById('receiver-status-card').classList.add('hidden');
  showToast('Room not found', 'error');
}

//Sender joined handler
function onPeerJoined(peerName) {
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

  if (peerName) {
    appState.peerName = peerName;
    document.getElementById('peer-avatar').textContent = peerName.charAt(0).toUpperCase();
    document.getElementById('peer-name').textContent   = peerName;
    document.getElementById('peer-meta').textContent   = 'Receiver · Ready';
    document.getElementById('peer-info-card').classList.remove('hidden');
  }

  setNavStatus('connected', 'Peer connected');
  showToast('Receiver joined the room!', 'success');

  // WebRTC handshake is initiated from webRTCConnection.js when peerJoined fires.
  // onDataChannelOpen() will be called by dataChannelHandler.js once the
  // RTCDataChannel is actually open — that's what enables the Send button.
}

function onDataChannelOpen() {
  appState.connected = true;
  setNavStatus("connected","Connected")

  const dot   = document.getElementById('step-dc-dot');
  const sub   = document.getElementById('step-dc-sub');
  const badge = document.getElementById('badge-dc');

  dot.className = 'w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-green-500/15';
  dot.innerHTML = `<svg width="13" height="13" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;
  sub.textContent   = 'Open and ready';
  badge.textContent = 'Open';
  badge.className   = 'badge badge-green ml-auto text-xs flex-shrink-0';

  //setSendButtonState();
 
  //setSendButtonState()
  showToast('Data channel open — you can now send files!', 'success');
}

//Transfer -Sender Side

function waitReceiverReady(index) {    //Waiting for Writable
     console.log("reached receiver ready", index);
    return new Promise(resolve => {
        console.log("waiting receiver-ready", index);
        const handler = event => {
            try {
                const msg = JSON.parse(event.data);

                if (
                    msg.type === "receiver-ready" &&
                    msg.index === index
                ) {
                    dataChannel.removeEventListener(
                        "message",
                        handler
                    );

                    resolve();
                }
            } catch(error) {
                console.log(error)
            }
        };

        dataChannel.addEventListener("message", handler);
    });
}



async function startTransfer() {
  if (appState.files.length === 0 || !appState.connected) return;
  appState.transferring = true;

  document.getElementById('transfer-status-block').classList.remove('hidden');
  document.getElementById('btn-send-files').disabled = true;
  setNavStatus('transferring', 'Sending…');

  const files      = appState.files;
  const totalBytes = files.reduce((s, f) => s + f.size, 0);
  let sentBytes    = 0;
  const startTime  = Date.now();



  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    document.getElementById('transfer-file-progress').textContent =
      `File ${i + 1} of ${files.length}: ${file.name}`;

    // Send file-meta
    dataChannel.send(JSON.stringify({
      type:  'file-meta',
      name:  file.name,
      size:  file.size,
      mime:  file.type || 'application/octet-stream',
      index: i,
      total: files.length,
    }));

    
  const readyPromise = waitReceiverReady(i)
  await readyPromise



    let CHUNK_SIZE = 256 * 1024;
    const reader     = new FileReader();
    let offset       = 0;



    await new Promise((resolve, reject) => {
      function readNextChunk() {
        const slice = file.slice(offset, offset + CHUNK_SIZE);
        reader.readAsArrayBuffer(slice);
      }

      reader.onload = async (e) => {
        console.log(`inside promise : ${e.target.result}`)
        const chunk = e.target.result;

        // Flow control
        if (dataChannel.bufferedAmount > 4 * 1024 * 1024) {
          await new Promise(res => {
            dataChannel.bufferedAmountLowThreshold = 2 * 1024 * 1024;
            dataChannel.onbufferedamountlow = () => {
              dataChannel.onbufferedamountlow = null;
              res();
            };
          });
        }

        dataChannel.send(chunk);

        offset    += chunk.byteLength;
        sentBytes += chunk.byteLength;

        const overallPct = Math.round((sentBytes / totalBytes) * 100);
        document.getElementById('overall-progress-bar').style.width = overallPct + '%';
        document.getElementById('transfer-pct').textContent          = overallPct + '%';

        const speed = sentBytes / ((Date.now() - startTime) / 1000);
        document.getElementById('transfer-speed').textContent = formatBytes(speed) + '/s';

        if (offset < file.size) {
          readNextChunk();
        } else {
          // Send file-end
          dataChannel.send(JSON.stringify({ type: 'file-end', index: i }));

          // Wait for receiver's ack before moving to next file
          const ackHandler = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.type === 'ack' && msg.fileNumber === i) {
                dataChannel.removeEventListener('message', ackHandler);
                console.log("receivers ack ")
                console.log(msg)
                resolve();
              }
            } catch (_) {}
          };
          dataChannel.addEventListener('message', ackHandler);
        }
      };

      reader.onerror = () => {
        showToast(`Error reading ${file.name}`, 'error');
        reject(reader.error);
      };

      readNextChunk();
    }).catch(() => {});
  }

  // All files sent
  dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));
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

//transfer Receiver side
function revealReceiverTransferUI(meta) {
  document.getElementById('receiver-files-section').classList.remove('hidden');
  document.getElementById('receiver-overall-block').classList.remove('hidden');
  document.getElementById('receiver-tips').classList.add('hidden');
  setNavStatus('transferring', 'Receiving…');

  document.getElementById('receiver-status-label').textContent = 'Transfer in progress';
  document.getElementById('receiver-status-sub').textContent   =
    `Receiving file ${meta.index + 1} of ${meta.total}…`;

  const container = document.getElementById('receiver-files-container');
  const rowId     = 'recv-file-' + meta.index;

  // Don't add a duplicate row if meta arrives twice (e.g. after gate replay)
  if (document.getElementById(rowId)) return;

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
    <div class="w-full bg-[#242842] rounded-full h-1.5 overflow-hidden">
      <div id="recv-bar-${meta.index}" class="progress-fill h-1.5 rounded-full" style="width:0%; background:#4ade80;"></div>
    </div>
    <div id="recv-save-${meta.index}" class="hidden"></div>
  `;
  container.appendChild(row);

  document.getElementById('recv-file-label').textContent = `File ${meta.index + 1} of ${meta.total}`;
}

function onFileMetaReceived(meta) {
  if (!folderGate.ready) {
    // folderGate.pendingMeta.push(meta); 
    showFolderPickerModal();
    return;
  }
  revealReceiverTransferUI(meta);
}

function onChunkReceived(fileIndex, receivedBytes, totalBytes, overallPct, speedBps) {
  if (!folderGate.ready) {
   showFolderPickerModal();
   folderGate.pendingMeta.push(meta);
  }

  const pct = Math.round((receivedBytes / totalBytes) * 100);
  const bar = document.getElementById(`recv-bar-${fileIndex}`);
  if (bar) bar.style.width = pct + '%';

  document.getElementById('recv-overall-bar').style.width = overallPct + '%';
  document.getElementById('recv-pct').textContent         = overallPct + '%';
  document.getElementById('recv-speed').textContent       = formatBytes(speedBps) + '/s';
}

function onFileComplete(fileIndex, fileName, blob) {
  const badge = document.getElementById(`recv-badge-${fileIndex}`);

  // Folder-gate path: file was streamed to disk; blob is null
  if (folderGate.directoryHandle && !blob) {
    if (badge) {
      badge.textContent = 'Saved';
      badge.className   = 'badge badge-green text-xs flex-shrink-0';
    }
    showToast(`${fileName} saved to "${folderGate.directoryHandle.name}"`, 'success');
    return;
  }

  // Fallback path: trigger browser download
  if (badge) {
    badge.textContent = 'Done';
    badge.className   = 'badge badge-green text-xs flex-shrink-0';
  }

  if (blob) {
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
  }

  showToast(`${fileName} ready to save!`, 'success');
}

function onTransferComplete() {
  document.getElementById('receiver-done-card').classList.remove('hidden');
  document.getElementById('recv-file-label').textContent  = 'All files received';
  document.getElementById('recv-overall-bar').style.width = '100%';
  document.getElementById('recv-pct').textContent         = '100%';

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
  socket.emit('leaveRoom', { roomCode: appState.roomId });
  resetNavChrome();
  resetFolderGate();
  appState.role      = null;
  appState.roomId    = null;
  appState.connected = false;
  appState.files     = [];
  document.location.reload()
}

function handleDisconnect() {
  showToast('Disconnected from room', 'warn');
  goBack();
}

function resetNavChrome() {
  document.getElementById('nav-status').classList.add('hidden');
  document.getElementById('nav-status').classList.remove('flex');

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
  resetFolderGate();
  appState.role      = null;
  appState.roomId    = null;
  appState.connected = false;
  appState.files     = [];
  //showPage('landing');
  document.location.reload()
}

//Toast Notification
const TOAST_STYLES = {
  success: {
    wrap: 'text-white',
    icon: `<svg width="14" height="14" fill="none" stroke="#4ade80" stroke-width="2.5" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`
  },

  error: {
    wrap: 'text-white',
    icon: `<svg width="14" height="14" fill="none" stroke="#f87171" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg>`
  },

  warn: {
    wrap: 'text-white',
    icon: `<svg width="14" height="14" fill="none" stroke="#facc15" stroke-width="2" viewBox="0 0 24 24"><path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>`
  },

  info: {
    wrap: 'text-white',
    icon: `<svg width="14" height="14" fill="none" stroke="#9b7bff" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4m0-4h.01"/></svg>`
  }
};

const TOAST_BORDER_COLOR = {
  success: '#4ade80',
  error:   '#f87171',
  warn:    '#facc15',
  info:    '#9b7bff',
};

function showToast(message, type = 'info', duration = 3500) {
  const style = TOAST_STYLES[type] || TOAST_STYLES.info;
  const toast = document.createElement('div');
  toast.className = `toast-item ${style.wrap}`;
  toast.style.borderLeftColor = TOAST_BORDER_COLOR[type] || TOAST_BORDER_COLOR.info;
  toast.innerHTML = `<span class="toast-icon">${style.icon}</span><span>${escHtml(message)}</span>`;

  const container = document.getElementById('toast-container');
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(-4px)';
    toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    setTimeout(() => toast.remove(), 320);
  }, duration);
}

//utility functions
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
  }[ext] || '#9b7bff';

  return `<svg width="16" height="16" fill="none" stroke="${color}" stroke-width="1.8" viewBox="0 0 24 24">
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
  </svg>`;
}

//Loading screen (shown until WebSocket connects)
function setLoadingStatus(text, isError = false) {
  const el = document.getElementById('loading-status-text');
  if (!el) return;
  el.classList.toggle('text-red-400', isError);
  el.innerHTML = isError
    ? text
    : `${text}<span class="loading-dots"><span></span><span></span><span></span></span>`;
}

function hideLoadingScreen() {
  document.getElementById('loading-screen')?.classList.add('opacity-0', 'pointer-events-none');
}

function showLoadingScreen(text) {
  document.getElementById('loading-screen')?.classList.remove('opacity-0', 'pointer-events-none');
  setLoadingStatus(text);
}

//Event listeners
document.addEventListener('DOMContentLoaded', () => {

  // Landing page
  document.getElementById('btn-role-sender')
    .addEventListener('click', () => selectRole('sender'));
  document.getElementById('btn-role-receiver')
    .addEventListener('click', () => selectRole('receiver'));

  // Navbar
  document.getElementById('btn-disconnect')
    .addEventListener('click', handleDisconnect);

  // Sender page
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

  // Send button — single listener, calls startTransfer() which uses

  document.getElementById('btn-send-files')
    .addEventListener('click', async() => {
      startTransfer()
    });

  // Receiver page
  document.getElementById('btn-receiver-back')
    .addEventListener('click', goBack);
  document.getElementById('room-code-input')
    .addEventListener('input', function () { onRoomCodeInput(this); });
  document.getElementById('btn-join-room')
    .addEventListener('click', joinRoom);

  // Folder picker modal
  document.getElementById('btn-pick-folder')
    .addEventListener('click', pickFolder);

  // Transfer complete page
  document.getElementById('btn-send-more')
    .addEventListener('click', sendMoreFiles);
  document.getElementById('btn-go-home')
    .addEventListener('click', goHome);

  // Handle peer disconnection
  socket.on('peer-disconnected', () => {
    showToast('Peer disconnected', 'warn');
    goBack();
  });

}); 

//exports
export {
  appState,
  folderGate,
  onReceiverConnected,
  onRoomNotFound,
  onPeerJoined,
  onDataChannelOpen,
  onFileMetaReceived,
  onChunkReceived,
  onFileComplete,
  onTransferComplete,
  showFolderPickerModal,
  setSendButtonState,
  showToast,
  setNavStatus,
  showPage,
  initSenderPage,
  showLoadingScreen,
  hideLoadingScreen
};