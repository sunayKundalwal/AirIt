
import { socket } from "./socket.js"
import { onPeerJoined, onReceiverConnected, onRoomNotFound } from "./sri.js";

import { addNewIceCandidate,addAnswer,answerOffer, call, } from "./webRTCConnection.js"

// -------------------- SOCKET EVENTS --------------------
let roomCode;
socket.io.engine.on("upgrade",async (transport)=>{

       await socket.emit("isConnected","it is now connected")

       console.log(socket.io.engine.transport.name);
       console.log("Using", transport.name); // websocket

// const socket = io()
//on connection get all available offers and call createOfferEls
socket.on('availableOffers', offers => {
    console.log(offers)
    createOfferEls(offers)
})

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

//someone just made a new offer and we're already here - call createOfferEls
socket.on('newOfferAwaiting', offers => {
     //console.log("new offer awaiting")
    console.log(offer)
    
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

socket.on("generatedRoomCode", async (code) => {
    console.log(`generated room code :-${code}`)
    roomCode = code
    document.getElementById("sender-room-id").textContent = code
    document.getElementById("nav-room-id-label").textContent = code
    //document.getElementById("connCodeDisplay").textContent=code

    if(code){
        console.log("reached call")
       await call()
          console.log("after call")
    }
})

function createOfferEls(offers) {
    //make green answer button for this new offer
    const answerEl = document.querySelector('#answer');
    offers.forEach(o => {
        console.log(o);
        const newOfferEl = document.createElement('div');
        newOfferEl.innerHTML = `<button class="btn btn-success col-1">Answer ${o.offererUserName}</button>`
        newOfferEl.addEventListener('click', () => {
            console.log("reached here ")
            answerOffer(o)
        })
        // answerEl.appendChild(newOfferEl);
    })
}
})



export {roomCode}