import { uploadProgress, uploadText } from "./script.js";
import { userName,socket } from "./socket.js";
import { answerDataChannel, callDataChannel } from "./dataChannel.js";

let peerConnection;

let didIOffer = false;
let dataChannel;

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
    console.log("ghfghfghf")
    await createPeerConnection()

    dataChannel = peerConnection.createDataChannel("file-transfer", {
        ordered: true,      // preserve order

    });

   
    callDataChannel(dataChannel)

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
        answerDataChannel(dataChannel)
    }

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

// -------------------- UI --------------------
document.querySelector('#call').addEventListener('click', call);

export {call,answerOffer,addAnswer,createPeerConnection,addNewIceCandidate,didIOffer,dataChannel}





