import path from "path"
import http from "http"
import express from "express"
import {Server} from "socket.io"

////////////// setting up websocket connection
const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static(path.resolve(".")))

server.listen(8080,"0.0.0.0",() => {
    console.log("Listening on the port 8080!!!")
})

///////////////////////////// setting up WEBRTC

const offers = []
const connectedSockets =[]

io.on("connection", (socket) => {
    console.log(`New user connected! socket id : ${socket.id}`)

  const userName = socket.handshake.auth.userName;
  const password = socket.handshake.auth.password;

    connectedSockets.push({
        socketId : socket.id,
        userName : userName 
    })

    socket.on("newOffer",(newOffer) => {
           const offerObj = {
                    offererUserName: userName,
                    offer: newOffer,
                    offerIceCandidates: [],
                    answererUserName: null,
                    answer: null,
                    answererIceCandidates: [],
           }

           offers.push(offerObj)
           socket.broadcast.emit("newOfferAwaiting",[offerObj])
    })


   // -------------------------
  // NEW ANSWER
  // -------------------------

  socket.on("newAnswer",(offerObj,ackFunction) => {

    const socketToAnswer = connectedSockets.find(s => s.userName == offerObj.offererUserName)

    if(!socketToAnswer){
        console.log("No offerer user found in connected sockets array")
        return
    }

    const offerToUpdate = offers.find((o) => o.offererUserName == offerObj.offererUserName)

    if(!offerToUpdate){
        console.log("No offer found to be updated!")
        return
    }
    ackFunction(offerToUpdate.offerIceCandidates)

    offerToUpdate.answer = offerObj.answer
    offerToUpdate.answererUserName = userName

    //console.log(`new answer containg offer : ${JSON.stringify(offerToUpdate)}`)
    console.log(socketToAnswer.userName)
    socket.to(socketToAnswer.socketId).emit("answerResponse",offerToUpdate)
  })

  socket.on("sendIceCandidateToSignalingServer" , (data) => {
       
     const { didIOffer, iceUserName, iceCandidate } = data;
    //  console.log(offers)
    //  console.log(didIOffer, iceUserName, iceCandidate)


     if(didIOffer){
        const offer = offers.find((o) =>o.offererUserName == iceUserName)
        // console.log(offer)
    
        if(!offer){
         console.log("No offer found")
            return;
        }

        offer.offerIceCandidates.push(iceCandidate)
        console.log("offerer ice candidate added ")

        if(offer.answererUserName){
            const answererSocket = connectedSockets.find(s => s.userName == offer.answererUserName)
                    if(answererSocket){
            socket.to(answererSocket.socketId).emit("receivedIceCandidateFromServer",iceCandidate)
        }
        }else{
            console.log("No Answerer socket found in the connected socket array")
            return
        }


    }else{
        const offer = offers.find((o) =>  o.answererUserName == iceUserName)

        if(!offer){
         console.log("No offer found")
            return;
        }

        offer.answererIceCandidates.push(iceCandidate)
        
         if(offer.offererUserName){

            const offererSocket = connectedSockets.find(s => s.userName == offer.offererUserName)
        
            if(offererSocket){
            socket.to(offererSocket.socketId).emit("receivedIceCandidateFromServer",iceCandidate)
        }
        }else{
            console.log("No offerer socket found in the connected socket array")
            return
        }

           

    }
})
     })

