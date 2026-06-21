import { userName } from "./socket.js";
import { appState } from "./script.js";
import { dataChannel } from "./webRTCConnection.js";

const CHUNK_SIZE = 256 * 1024;

// ─── Flow control: wait for the send buffer to drain before continuing ───────
function waitForBufferLow(dc) {
  return new Promise(resolve => {
    dc.bufferedAmountLowThreshold = 1 * 1024 * 1024; // 1 MB low-water mark
    dc.onbufferedamountlow = () => {
      dc.onbufferedamountlow = null;
      resolve();
    };
  });
}

function waitReceiverReady(index) {
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
// ─── Send a single File over the data channel ─────────────────────────────────
// Uses the NEW protocol expected by sri.js:
//   1. JSON  { type:'file-meta', name, size, mime, index, total }
//   2. binary ArrayBuffer chunks
//   3. JSON  { type:'file-end', index }
//
// Waits for an { type:'ack', fileNumber } from the receiver before resolving,
// so the caller can sequence files reliably.
const sendFile = async (file, index, total) => {
  // 1. Send metadata for this file

  const readyPromise = waitReceiverReady(index)
  await readyPromise


//     await new Promise(resolve => {
//     const handler = (event) => {
//       try {
//         const msg = JSON.parse(event.data);
//         if (msg.type === 'receiver-ready' && msg.index === index) {
//             console.log("receiver readyyyyy!!!!!!!!!!!!!")
//             console.log(JSON.parse(msg))
//           dataChannel.removeEventListener('message', handler);

//            let offset = 0;

//   while (offset < file.size) {
//     // Flow-control: pause if the channel's send buffer is too full
//     if (dataChannel.bufferedAmount > 4 * 1024 * 1024) {
//       await waitForBufferLow(dataChannel);
//     }

//     const slice  = file.slice(offset, offset + CHUNK_SIZE);
//     const buffer = await slice.arrayBuffer();
//     dataChannel.send(buffer);
//     offset += buffer.byteLength;
//   }
//           resolve();
//         }
//       } catch (_) { /* ignore binary messages */ }
//     };
//     dataChannel.addEventListener('message', handler);
//   });

  let offset = 0;

  while (offset < file.size) {
    // Flow-control: pause if the channel's send buffer is too full
    if (dataChannel.bufferedAmount > 4 * 1024 * 1024) {
      await waitForBufferLow(dataChannel);
    }

    const slice  = file.slice(offset, offset + CHUNK_SIZE);
    const buffer = await slice.arrayBuffer();
    console.log("sending chunk")
    console.log("chunk")
    dataChannel.send(buffer);
    offset += buffer.byteLength;
  }

  // 2. Signal end of this file
  dataChannel.send(JSON.stringify({ type: 'file-end', index: index }));

  // 3. Wait for receiver's acknowledgement before moving on to the next file
  await new Promise(resolve => {
    const handler = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'ack' && msg.fileNumber === index) {
          dataChannel.removeEventListener('message', handler);
          resolve();
        }
      } catch (_) { /* ignore binary messages */ }
    };
    dataChannel.addEventListener('message', handler);
  });
};

// ─── Send metadata for all queued files, then send the files one by one ──────
// Called from sri.js's btn-send-files click handler.
//
// Protocol sequence:
//   For each file i:
//     → file-meta  (JSON)
//     → chunk …   (binary)
//     → file-end   (JSON)
//     ← ack        (JSON, from receiver)
//   → transfer-complete (JSON)
const sendMeta = async () => {
  const files = appState.files;
  if (!files || files.length === 0) return;

  console.log('[sendMeta] starting transfer of', files.length, 'file(s)');

  for (let i = 0; i < files.length; i++) {
    console.log(`[sendMeta] sending file ${i + 1}/${files.length}: ${files[i].name}`);
    await sendFile(files[i], i, files.length);
    console.log(`[sendMeta] file ${i + 1} acknowledged`);
  }

  // All files sent — notify receiver the batch is complete
  dataChannel.send(JSON.stringify({ type: 'transfer-complete' }));
  console.log('[sendMeta] transfer-complete sent');
};

// Export for use in sri.js and dataChannelHandler.js
export { sendFile, sendMeta };