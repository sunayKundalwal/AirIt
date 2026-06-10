const userName = "DropIt" + Math.floor(Math.random() * 100000);
const password = "x";


const uploadProgress = document.getElementById("uploadProgress");
const uploadText = document.getElementById("uploadText");

document.querySelector('#user-name').innerHTML = userName;


const socket = io("https://cozy-tightrope-protegee.ngrok-free.dev", {
    auth: {
        userName,
        password
    }
});


let peerConnection;
let didIOffer = false;
 let dataChannel;
 let chunks = [];


const peerConfiguration = {
    iceServers: [
        {
            urls: [
                "stun:stun.l.google.com:19302",
                "stun:stun1.l.google.com:19302"
            ]
        }
    ]
};

// -------------------- CALL --------------------

const call = async () => {

    await createPeerConnection()

         dataChannel = peerConnection.createDataChannel("file-transfer", {
  ordered: true,      // preserve order
  maxRetransmits: 10 // reliable delivery
});

dataChannel.onopen = () => {
  console.log("Data channel open");
//   dataChannel.send("Hello from Peer A");
};

dataChannel.onmessage = (event) => {
  console.log("Received:", event.data);
};

    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);



didIOffer = true 
socket.emit("newOffer", offer);

}


// -------------------- ANSWER OFFER --------------------
const answerOffer = async (offerObj) => {
    
    await createPeerConnection(offerObj);

    peerConnection.ondatachannel = (event) => {
     dataChannel = event.channel;

  dataChannel.onopen = () => {
    console.log("Data channel open");
  };

//   dataChannel.onmessage = (event) => {
//     console.log("Received:", event.data);
//   };



dataChannel.onmessage = async (event) => {
    console.log(event)
    chunks.push(event.data);
    // STREAMING TO DISK using File System Access API:
// const fileHandle = await window.showSaveFilePicker({ suggestedName: "filename" });
// const writable = await fileHandle.createWritable();

// dc.onmessage = async (e) => {
//   await writable.write(e.data); // goes straight to disk
//   // e.data is freed from RAM immediately after this line
//   // Peak RAM: only ONE chunk at a time, no matter how big the file
// };

// dc.onclose = async () => {
//   await writable.close(); // finalize the file
// };
// //    const writable = await fileHandle.createWritable();

// await writable.write(chunk);
};


 };

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);

    

    offerObj.answer = answer;

    socket.emit("newAnswer", offerObj, async (offerIceCandidates) => {
        offerIceCandidates.forEach(async (c) => {
            await peerConnection.addIceCandidate(c);
        });
    });
}

// -------------------- ADD ANSWER --------------------
const addAnswer = async (offerObj) => {
    if (!peerConnection) {
        console.log("PeerConnection not ready");
        return;
    }

    if (peerConnection.signalingState !== "have-local-offer") {
        console.log("Wrong state:", peerConnection.signalingState);
        return;
    }

    await peerConnection.setRemoteDescription(
        new RTCSessionDescription(offerObj.answer)
    );

    peerConnection.onconnectionstatechange = () => {
    console.log("State:", peerConnection.connectionState);
};
};


// -------------------- PEER CONNECTION -------------------
const createPeerConnection = async (offerObj) => {

    peerConnection = new RTCPeerConnection(peerConfiguration);

        // ICE candidates
    peerConnection.addEventListener("icecandidate", (e) => {
        if (e.candidate) {
            socket.emit("sendIceCandidateToSignalingServer", {
                iceCandidate: e.candidate,
                iceUserName: userName,
                didIOffer
            });
        }
    });

        // receive offer
    if (offerObj) {
        await peerConnection.setRemoteDescription(offerObj.offer);
    }
}

// -------------------- ICE ADD --------------------
const addNewIceCandidate = async (iceCandidate) => {
    if (peerConnection) {
        await peerConnection.addIceCandidate(iceCandidate);
    }
};


// -------------------- SOCKET EVENTS --------------------


// const socket = io()
//on connection get all available offers and call createOfferEls
socket.on('availableOffers',offers=>{
    console.log(offers)
    createOfferEls(offers)
})

//someone just made a new offer and we're already here - call createOfferEls
socket.on('newOfferAwaiting',offers=>{
    createOfferEls(offers)
})

socket.on('answerResponse',offerObj=>{
    console.log(offerObj)
    addAnswer(offerObj)
})

socket.on('receivedIceCandidateFromServer',iceCandidate=>{
    addNewIceCandidate(iceCandidate)
    console.log(iceCandidate)
})

function createOfferEls(offers){
    //make green answer button for this new offer
    const answerEl = document.querySelector('#answer');
    offers.forEach(o=>{
        console.log(o);
        const newOfferEl = document.createElement('div');
        newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${o.offererUserName}</button>`
        newOfferEl.addEventListener('click',()=>{
            console.log("reached here ")
            answerOffer(o)})
        answerEl.appendChild(newOfferEl);
    })
}

// -------------------- UI --------------------
document.querySelector('#call').addEventListener('click', call);


/////////////////////////////////////////////////

const f = document.getElementById("fileInput")

document.getElementById("btn").addEventListener("click",async ()=> {
    const file = document.getElementById("fileInput").files[0]
    
    
   const CHUNK_SIZE = 256 * 1024;

function waitForBufferLow(dc) {
    return new Promise(resolve => {
        dc.onbufferedamountlow = () => resolve();
    });
}

const sendFile = async (file) => {

    let offset = 0;

    while (offset < file.size) {
        console.log((offset/file.size)*100)
    // console.log(dataChannel.bufferedAmount);
        // 🔥 BACKPRESSURE CONTROL
        if (dataChannel.bufferedAmount > 4 * 1024 * 1024) {
            await waitForBufferLow(dataChannel);
        }

        const slice = file.slice(offset, offset + CHUNK_SIZE);
        const buffer = await slice.arrayBuffer();

        dataChannel.send(buffer);

        offset += CHUNK_SIZE;

                percent = Math.min((offset / file.size) * 100,100);

        uploadProgress.value = percent;
        uploadText.textContent = percent + "%";
    }
};

sendFile(file)
})

document.getElementById("down").addEventListener("click",async() => {
   chunks.forEach(element => {
    console.log(element)
   });
    
   const blob = new Blob(chunks, {
    type: "application/pdf"
});
console.log(`blob  : ${blob}`)

const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = "ss.pdf";
a.click();
})