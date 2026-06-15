//import { uploadProgress, uploadText } from "./script.js";
import { userName,socket } from "./socket.js";
import { answerDataChannel, callDataChannel } from "./dataChannel.js";
import { roomCode } from "./socketEvents.js";
import { appState } from "./sri.js";

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
    await createPeerConnection(null,roomCode)

    dataChannel = peerConnection.createDataChannel("file-transfer", {
        ordered: true,      // preserve order

    });

   
    

    const offer = await peerConnection.createOffer();
    console.log(offer)
    await peerConnection.setLocalDescription(offer);



    didIOffer = true
    // console.log("sent offer to server")
    socket.emit("newOffer", offer);
    console.log("sent offer to server")

    callDataChannel(dataChannel)

}


// -------------------- ANSWER OFFER --------------------
const answerOffer = async (offerObj) => {
    didIOffer=false

    await createPeerConnection(offerObj,appState.SenderRoomId);

    peerConnection.ondatachannel = (event) => {
        dataChannel = event.channel;
        answerDataChannel(dataChannel)
    }

    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);



    offerObj.answer = answer;
    offerObj.answererUserName = userName
    offerObj.roomCode = appState.SenderRoomId

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
const createPeerConnection = async (offerObj,roomId) => {

    peerConnection = new RTCPeerConnection(peerConfiguration);

    // ICE candidates
    peerConnection.addEventListener("icecandidate", (e) => {
        if (e.candidate) {
            socket.emit("sendIceCandidateToSignalingServer", {
                iceCandidate: e.candidate,
                iceUserName: userName,
                roomCode : roomId,
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
//document.querySelector('#call').addEventListener('click', call);

export {call,answerOffer,addAnswer,createPeerConnection,addNewIceCandidate,didIOffer,dataChannel}





