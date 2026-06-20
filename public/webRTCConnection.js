//import { uploadProgress, uploadText } from "./script.js";
import { userName, socket } from "./socket.js";
import { answerDataChannel, callDataChannel } from "./dataChannel.js";
import { roomCode } from "./socketEvents.js";
import { appState, setNavStatus, setSendButtonState, showToast } from "./sri.js";

let peerConnection;

let didIOffer = false;
let dataChannel;

const peerConfiguration = {
  iceServers: [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.relay.metered.ca:80"
      ]
    },
    {
      urls: "turn:global.relay.metered.ca:80",
      username: "YOUR_USERNAME",
      credential: "YOUR_CREDENTIAL"
    },
    {
      urls: "turn:global.relay.metered.ca:80?transport=tcp",
      username: "YOUR_USERNAME",
      credential: "YOUR_CREDENTIAL"
    },
    {
      urls: "turn:global.relay.metered.ca:443",
      username: "YOUR_USERNAME",
      credential: "YOUR_CREDENTIAL"
    },
    {
      urls: "turns:global.relay.metered.ca:443?transport=tcp",
      username: "YOUR_USERNAME",
      credential: "YOUR_CREDENTIAL"
    }
  ]
};


// -------------------- CALL --------------------

const call = async () => {
    try {
        console.log("ghfghfghf")
        await createPeerConnection(null, roomCode)

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
         console.log(peerConnection.sctp.maxMessageSize);
        callDataChannel(dataChannel)
    } catch (error) {
        console.log(error)
        showToast("Your network is blocking the Connection request, try Connecting to another Network!", "failed")
         setNavStatus(`error`,"Connect to another Network")
    }


}


// -------------------- ANSWER OFFER --------------------
const answerOffer = async (offerObj) => {
    try {
        didIOffer = false

        await createPeerConnection(offerObj, appState.SenderRoomId);

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

         console.log(peerConnection.sctp.maxMessageSize);
      
         peerConnection.onconnectionstatechange = () => {
            console.log("State:", peerConnection.connectionState);

            switch (peerConnection.connectionState) {
                case "new":
                case "connecting":
                    showToast("DataChannel Connecting…", "success");
                                        setNavStatus('connecting','DataChannel is Connecting')
                    break;
                case "connected":
                    showToast("DataChannel Online", "success");
                    break;
                case "disconnected":
                    showToast("DataChannel Disconnecting…", "warn");
                    break;
                case "closed":
                    showToast("DataChannel is Offline", "failed");
                    break;
                case "failed":
                    showToast("DataChannel failed,try with different internet connection!", "failed");
                    setNavStatus('failed',' your network is blocking your request')
                    break;
                default:
                    showToast("Unknown", "failed");
                    break;
            }
        }

        
    } catch (error) {
        console.log(error)
        showToast("Your network is blocking the Connection request, try Connecting to another Network!", "failed")
         setNavStatus(`error`,"Connect to another Network")
    } 

}

// -------------------- ADD ANSWER --------------------
const addAnswer = async (offerObj) => {
    try {
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

            switch (peerConnection.connectionState) {
                case "new":
                case "connecting":
                    showToast("DataChannel Connecting…", "success");
                                        setNavStatus('connecting','DataChannel is Connecting')
                    break;
                case "connected":
                    showToast("DataChannel Online", "success");
                    break;
                case "disconnected":
                    showToast("DataChannel Disconnecting…", "warn");
                    break;
                case "closed":
                    showToast("DataChannel is Offline", "failed");
                    break;
                case "failed":
                    showToast("DataChannel failed,try with different internet connection!", "failed");
                    setNavStatus('failed',' your network is blocking your request')
                    break;
                default:
                    showToast("Unknown", "failed");
                    break;
            }



        };
    } catch (error) {
        console.log(error)
        showToast("Your network is blocking the Connection request, try Connecting to another Network!", "failed")
         setNavStatus(`error`,"Connect to another Network")
    } 

};


// -------------------- PEER CONNECTION -------------------
const createPeerConnection = async (offerObj, roomId) => {
    try {
        peerConnection = new RTCPeerConnection(peerConfiguration);

        // ICE candidates
        peerConnection.addEventListener("icecandidate", (e) => {
            if (e.candidate) {
                socket.emit("sendIceCandidateToSignalingServer", {
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    roomCode: roomId,
                    didIOffer
                });
            }
        });

        // receive offer
        if (offerObj) {
            await peerConnection.setRemoteDescription(offerObj.offer);
        }
    } catch (error) {
        console.log(error)
        showToast("Your network is blocking the Connection request, try Connecting to another Network!", "failed")
         setNavStatus(`error`,"Connect to another Network")
    } 

}

// -------------------- ICE ADD --------------------
const addNewIceCandidate = async (iceCandidate) => {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(iceCandidate);
        }
    } catch (error) {
        console.log(error)
        showToast("Your network is blocking the Connection request, try Connecting to another Network!", "failed")
         setNavStatus(`error`,"Connect to another Network")

    } 
};

// -------------------- UI --------------------
//document.querySelector('#call').addEventListener('click', call);

export { call, answerOffer, addAnswer, createPeerConnection, addNewIceCandidate, didIOffer, dataChannel }





