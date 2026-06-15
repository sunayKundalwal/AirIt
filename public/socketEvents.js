
import { socket } from "./socket.js"

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

socket.on("OfferData",(data)=>{
    console.log("offer data")
    console.log(data)
    if(data){
        console.log("calling answer offer")
        answerOffer(data)
    }
})

//someone just made a new offer and we're already here - call createOfferEls
socket.on('newOfferAwaiting', offers => {
    createOfferEls(offers)
})

socket.on('answerResponse', offerObj => {
    console.log(offerObj)
    addAnswer(offerObj)
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