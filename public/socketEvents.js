
import { socket } from "./socket.js"
import { appState, hideLoadingScreen, initSenderPage, onPeerJoined, onReceiverConnected, onRoomNotFound, showPage } from "./script.js";

import { addNewIceCandidate,addAnswer,answerOffer, call, } from "./webRTCConnection.js"

// -------------------- SOCKET EVENTS --------------------
let roomCode;
socket.io.engine.on("upgrade",async (transport)=>{
hideLoadingScreen()
       await socket.emit("isConnected","it is now connected")

       console.log(socket.io.engine.transport.name);
       console.log("Using", transport.name); // websocket

// const socket = io()
//on connection get all available offers and call createOfferEls
// socket.on('availableOffers', offers => {
//     console.log(offers)
//     createOfferEls(offers)
// })





  let data;
socket.on("OfferData",async (d)=>{
     data = JSON.parse(d)
    console.log("offer data")
    console.log(data)
    console.log(data.status)
    if(data.status == "success"){
        onReceiverConnected(data.offer.offererUserName)
        console.log("calling answer offer")
        answerOffer(data.offer)
    }else if(data.status == "failed"){
        onRoomNotFound()
    }
})



socket.on('answerResponse', offerObj => {
    console.log("answer offer obj")
    console.log(offerObj)
    addAnswer(offerObj)
    onPeerJoined(offerObj.answererUserName)
})

socket.on('receivedIceCandidateFromServer', iceCandidate => {
    addNewIceCandidate(iceCandidate)
    console.log(iceCandidate)
})

// socket.on("generatedRoomCode", async (code) => {
//     console.log(`generated room code :-${code}`)
//     roomCode = code
//     document.getElementById("sender-room-id").textContent = code
//     showPage('sender')
//     appState.roomId = roomCode
//     initSenderPage(roomCode)
  
//     //document.getElementById("connCodeDisplay").textContent=code

//     if(code){
//         console.log("reached call")
//        await call()
//           console.log("after call")
//     }
// })

})



export {roomCode}