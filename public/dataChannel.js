import { userName } from "./socket.js";
import {
    onDataChannelOpen,
    onFileMetaReceived,
    onChunkReceived,
    onFileComplete,
    onTransferComplete,
    folderGate,
    showFolderPickerModal,
    appState,
    setSendButtonState,
    showToast,
} from "./script.js";

// ─── Shared receiver-side state ───────────────────────────────────────────────
// Both answerDataChannel and callDataChannel use the same receiver logic,
// so it lives here as a factory function to avoid duplication.

function attachReceiverHandlers(dataChannel) {
    // Per-file tracking
    let currentFile = null; // { name, size, mime, index, total, receivedBytes, startTime }
    let allFilesMeta = [];   // accumulates every 'file-meta' seen so far
    let grandTotalSize = 0;    // sum of .size across allFilesMeta (for overall %)
    let grandReceived = 0;    // bytes received across ALL files so far

    // For the File System Access (folder-gate) path we write straight to disk.
    // For the fallback (unsupported browser) path we accumulate chunks in RAM.
    let writable = null;  // FileSystemWritableFileStream | null
    let chunks = [];    // ArrayBuffer[]  — used only in fallback path

    dataChannel.addEventListener('message', async (event) => {
        const data = event.data;
        console.log(`data ${data}`)


        // ── Binary chunk ──────────────────────────────────────────────────────────
        if (data instanceof ArrayBuffer) {
            if (!currentFile) return; // shouldn't happen; guard anyway

            grandReceived += data.byteLength;
            currentFile.receivedBytes += data.byteLength;
            console.log(writable)
            // Write to disk (folder-gate path) or buffer in RAM (fallback path)
            if (writable) {
                await writable.write(data);
            } else {
                chunks.push(data);
                console.log("pushing data to chunks")
            }
            // if(writable == null){
            //     chunks.push(data)
            // }else{
            //     chunks.forEach(d=> {
            //                     onChunkReceived(
            //     currentFile.index,
            //     currentFile.receivedBytes,
            //     currentFile.size,
            //     overallPct,
            //     speedBps,
            // );
            //     } )
            //     chunk =
            // }

            // Progress update
            const overallPct = Math.round((grandReceived / grandTotalSize) * 100);
            const speedBps = currentFile.receivedBytes /
                ((Date.now() - currentFile.startTime) / 1000);

            onChunkReceived(
                currentFile.index,
                currentFile.receivedBytes,
                currentFile.size,
                overallPct,
                speedBps,
            );
            return;
        }

        // ── Control message (JSON string) ─────────────────────────────────────────
        let msg;
        try {
            msg = JSON.parse(data);
        } catch (_) {
            console.warn('[dataChannelHandler] non-JSON string message ignored:', data);
            return;
        }

        switch (msg.type) {

            // ── file-meta: new file is about to arrive ──────────────────────────────
            case 'file-meta': {
                currentFile = {
                    name: msg.name,
                    size: msg.size,
                    mime: msg.mime || 'application/octet-stream',
                    index: msg.index,
                    total: msg.total,
                    receivedBytes: 0,
                    startTime: Date.now(),
                };
                console.log(currentFile)

                allFilesMeta.push(msg);
                grandTotalSize += msg.size;

                chunks = [];     // reset chunk buffer for this file
                // will be set below if folder-gate path is active

                // Open a write stream straight to the user's chosen folder (if available)
                console.log(`folderGate.ready :${folderGate.ready}`)
                console.log(`folderGate.directoryHandle :- ${folderGate.directoryHandle}`)
                if (folderGate.ready && folderGate.directoryHandle) {
                    try {
                        console.log("reached herewwwwwwwwwwwww")
                        const fileHandle = await folderGate.directoryHandle.getFileHandle(
                            msg.name,
                            { create: true },
                        );
                        writable = await fileHandle.createWritable();

                        
                  dataChannel.send(JSON.stringify({
                            type: "receiver-ready",
                            index: msg.index,
                            w:writable
                        }));

                        console.log(`writable : - ${writable}`)

                      
                    } catch (err) {
                        console.error('[dataChannelHandler] getFileHandle failed:', err);
                        writable = null; // fall back to in-RAM chunking
                    }

                }else{
                    writable = null;

                       dataChannel.send(JSON.stringify({
                            type: "receiver-ready",
                            index: msg.index,
                            w:writable
                        }));
                }



                // Notify sri.js so it can show / gate the receiver UI
                onFileMetaReceived(msg);
                break;
            }

            // ── file-end: all chunks for the current file have arrived ──────────────
            case 'file-end': {
                if (!currentFile) break;

                if (writable) {
                    // Folder-gate path: close the write stream; no Blob needed
                    await writable.close();
                    writable = null;
                    onFileComplete(msg.index, currentFile.name, null);
                } else {
                    // Fallback path: assemble a Blob and let sri.js trigger a download

                    const blob = new Blob(chunks, { type: currentFile.mime });
                    console.log(`blob :- ${blob}`)
                    chunks = [];
                    onFileComplete(msg.index, currentFile.name, blob);
                }

                // Send acknowledgement back to the sender so it can advance to the next file
                dataChannel.send(JSON.stringify({
                    type: 'ack',
                    status: 'success',
                    fileNumber: msg.index,
                }));

                currentFile = null;
                break;
            }

            // ── transfer-complete: all files done ────────────────────────────────────
            case 'transfer-complete': {
                onTransferComplete();
                break;
            }
            case 'DirAck' :{
                // if(msg.status == "success"){
                //     console.log(`DirAck log: ${msg}`)
                //     const ready = appState.files.length > 0 && appState.connected;
                //   document.getElementById('btn-send-files').disabled = !ready;
                // }
            }
            case 'disconnect' : {
                
                showToast('warn',"Sender left the room")
               document.location.reload()
            }

            // ── Legacy / unknown ─────────────────────────────────────────────────────
            default:
                console.warn('[dataChannelHandler] unhandled message type:', msg.type);
        }
    });
}

// ─── ANSWERER side (receiver who did NOT create the offer) ────────────────────
const answerDataChannel = async (dataChannel) => {
    dataChannel.onopen = async () => {
        console.log('[answerDataChannel] data channel open');
        onDataChannelOpen();
        if (!folderGate.ready) {
            await showFolderPickerModal()
        }
    };

    attachReceiverHandlers(dataChannel);
};

// ─── CALLER side (the sender — also needs to handle incoming acks) ─────────────
// NOTE: The sender mostly SENDS, but it does receive ack / control messages
// from the receiver. Those are handled inside sendFile()'s inline listener
// in script.js. This handler therefore only needs to fire onDataChannelOpen.
let dirAckStatus = false;
const callDataChannel = async (dataChannel) => {
    dataChannel.onopen = async () => {
        console.log('[callDataChannel] data channel open');
        onDataChannelOpen();
        setSendButtonState()
    };

    // The caller (sender) doesn't need the full receiver handler, but we attach
    // a minimal onmessage so unexpected messages are logged rather than silently
    // dropped.
    dataChannel.onmessage = (event) => {
        if (typeof event.data !== 'string') return;
        try {
            const msg = JSON.parse(event.data);
            // ack messages are consumed by the per-file listener in script.js;
            // they may arrive here first if the listener hasn't been registered yet.
            if (msg.type == 'ack') {
                console.log('[callDataChannel] received:', msg);
            } else if (msg.type == "DirAck") {
                // console.log(msg)
                //   if(msg.status == "success"){
                //     console.log(`DirAck log: ${msg}`)
                //     const ready = appState.files.length > 0 && appState.connected;
                //   document.getElementById('btn-send-files').disabled = !ready;
                // }
                dirAckStatus =true;
                setSendButtonState()
            }
        } catch (_) { }
    };


};

export { answerDataChannel, callDataChannel ,dirAckStatus};