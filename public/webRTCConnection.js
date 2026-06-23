//import { uploadProgress, uploadText } from "./script.js";
import { userName, socket } from "./socket.js";
import { answerDataChannel, callDataChannel } from "./dataChannel.js";
import { roomCode } from "./socketEvents.js";
import { appState, setNavStatus, setSendButtonState, showToast } from "./script.js";

let peerConnection;
let peerConfiguration
let didIOffer = false;
let dataChannel;

// const peerConfiguration = {
//   iceServers: [
//     {
//       urls: [
//         "stun:stun.l.google.com:19302",
//         "stun:stun1.l.google.com:19302",
       
        
//       ]
//     },
//     //     {
//     //     urls: "turn:global.relay.metered.ca:80",
//     //     username: "96740a752ec80c594b77a996",
//     //     credential: "nYjSqUTw4aOr/VzH",
//     //   },
//     //   {
//     //     urls: "turn:global.relay.metered.ca:80?transport=tcp",
//     //     username: "96740a752ec80c594b77a996",
//     //     credential: "nYjSqUTw4aOr/VzH",
//     //   },
//     //   {
//     //     urls: "turn:global.relay.metered.ca:443",
//     //     username: "96740a752ec80c594b77a996",
//     //     credential: "nYjSqUTw4aOr/VzH",
//     //   },
//     //   {
//     //     urls: "turns:global.relay.metered.ca:443?transport=tcp",
//     //     username: "96740a752ec80c594b77a996",
//     //     credential: "nYjSqUTw4aOr/VzH",
//     //   },
   
//   ]
// };

// -------------------- CALL --------------------





const call = async () => {
    await socket.emit("getTURNCreds")

    socket.once("TURNCreds",async (creds)=> {
        console.log(JSON.parse(creds))
        peerConfiguration = (JSON.parse(creds))
        console.log(peerConfiguration)

         try {
        console.log("ghfghfghf")
        didIOffer = true
        await createPeerConnection(null, appState.roomId)

        dataChannel = peerConnection.createDataChannel("file-transfer", {
            ordered: true,      // preserve order

        });




        const offer = await peerConnection.createOffer();
        console.log(offer)
        await peerConnection.setLocalDescription(offer);



        
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
    })
   


}


// -------------------- ANSWER OFFER --------------------
const answerOffer = async (offerObj) => {

    await socket.emit("getTURNCreds")

    socket.once("TURNCreds",async (creds)=> {
        console.log(JSON.parse(creds))
        peerConfiguration = (JSON.parse(creds))
        console.log(peerConfiguration)
    try {
        didIOffer = false

        await createPeerConnection(offerObj, appState.roomId);

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
      
         peerConnection.onconnectionstatechange =async () => {
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
                      showToast("Connection failed, retrying with TCP...", "warn");
    setNavStatus('failed', 'Retrying over TCP...');
    await retryWithTCP(offerObj); // see below
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
})

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

        peerConnection.onconnectionstatechange = async() => {
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
                      showToast("Connection failed, retrying with TCP...", "warn");
    setNavStatus('failed', 'Retrying over TCP...');
    await retryWithTCP(offerObj); // see below
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


// Add this function
const retryWithTCP = async (offerObj) => {
    // Force TCP-only TURN candidates
    if (peerConnection) peerConnection.close();

    peerConfiguration.iceServers = peerConfiguration.iceServers.map(server => {
        if (server.urls && typeof server.urls === 'string' && server.urls.startsWith('turn:')) {
            return [
                server,
                { ...server, urls: server.urls.replace('turn:', 'turn:').replace('?transport=udp', '') + '?transport=tcp' },
                { ...server, urls: server.urls.replace('turn:', 'turns:').replace(':3478', ':443') + '?transport=tcp' }
            ];
        }
        return server;
    }).flat();

    didIOffer ? await call() : await answerOffer(offerObj);
};


// -------------------- PEER CONNECTION -------------------
const createPeerConnection = async (offerObj, roomId) => {
    try {
        peerConnection = new RTCPeerConnection(peerConfiguration);

        peerConnection.onicecandidateerror = (event) => {
    console.log("ICE Error");
    console.log("URL:", event.url);
    console.log("Error Code:", event.errorCode);
    console.log("Error Text:", event.errorText);
};

        // ICE candidates
        peerConnection.addEventListener("icecandidate", (e) => {
            if (e.candidate) {
                console.log(e.candidate.candidate)
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





