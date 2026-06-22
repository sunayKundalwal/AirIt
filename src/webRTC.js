import { io } from "./app.js"
import { addOfferAndAnswer, generateRoomCode, joinRoom, addIceCandidates, roomCheck } from "./controllers/utills.controller.js";
import { room } from "./models/room.model.js"



///////////////////////////// setting up WEBRTC
const setupRTC = async () => {
    const offers = [
        // offererUserName
        // offer
        // offerIceCandidates
        // answererUserName
        // answer
        // answererIceCandidates
    ];

    const connectedSockets = []

    io.on("connection", async (socket) => {
        const userName = socket.handshake.auth.userName;
        const password = socket.handshake.auth.password;

        console.log(`New user connected! socket id : ${socket.id}`)

        let roomCode 
      

          const socketDetails = {
            socketId: socket.id,
            userName: userName
        }

        socket.on("isConnected", (d) => {
            console.log("websocket is now connected")
            
        })


 socket.on("createRoom",async (d) => {
               roomCode = await generateRoomCode()
                  const joinNewSocket = await joinRoom(roomCode, socketDetails,"offerer")
        console.log(joinNewSocket)
            socket.emit("generatedRoomCode", {roomCode})
         
        })



      
       


        // connectedSockets.push({
        //     socketId: socket.id,
        //     userName: userName
        // })

        socket.on("newOffer", async (newOffer) => {
            console.log("recieved new offer")
            const offerObj = {
                offererUserName: userName,
                offer: newOffer,
                offerIceCandidates: [],
                answererUserName: null,
                answer: null,
                answererIceCandidates: [],
            }

            offers.push(offerObj)
            //roomCode, package, type
            await addOfferAndAnswer(roomCode, newOffer, "offerer")
           
        })


        // -------------------------
        // JOIN ROOM FOR RECEIVER
        // -------------------------

        socket.on("joinRoom", async (d) => {
            console.log("Receiving Joinee data")
            console.log(d)
            const offerData = (await joinRoom(d.roomCode, socketDetails,"answerer"))
            socket.emit("OfferData", JSON.stringify(offerData))

        })

        // -------------------------
        // NEW ANSWER
        // -------------------------

        socket.on("newAnswer", async (offerObj, ackFunction) => {


            const roomDetails = await roomCheck(offerObj.roomCode)
            console.log(" getting newAnswer")
            console.log(offerObj)
            console.log(roomDetails)

            if (roomDetails) {
                const socketToAnswer = roomDetails.connectedSockets.find(s => s.userName == offerObj.offererUserName)

                if (!socketToAnswer) {
                    console.log("No offerer user found in connected sockets array")
                    return
                }
                const offerToUpdate = roomDetails.offer

                if (!offerToUpdate) {
                    console.log("No offer found to be updated!")
                    return
                }
                ackFunction(offerToUpdate.offerIceCandidates)

                offerToUpdate.answer = offerObj.answer
                offerToUpdate.answererUserName = offerObj.answererUserName

                roomDetails.offer = offerToUpdate
               await roomDetails.save()

                //console.log(`new answer containg offer : ${JSON.stringify(offerToUpdate)}`)
                console.log(socketToAnswer.userName)
                socket.to(socketToAnswer.socketId).emit("answerResponse", offerToUpdate)
            }



        })

        socket.on("sendIceCandidateToSignalingServer", async (data) => {

            const { didIOffer, iceUserName, iceCandidate,roomCode} = data;
            //  console.log(offers)
            //  console.log(didIOffer, iceUserName, iceCandidate)

                const offer = await roomCheck(roomCode)
            if (didIOffer) {
                
                // console.log(offer)

                if (!offer) {
                    console.log("No offer found")
                    return;
                }

               // offer.offer.offerIceCandidates.push(iceCandidate)
                //roomCode, package, type
                await addIceCandidates(roomCode, iceCandidate, "offerer")
                console.log("offerer ice candidate added ")




                if (offer.answererUserName) {
                    const answererSocket = offer.connectedSockets.find(s => s.userName == offer.answererUserName)
                    if (answererSocket) {
                        socket.to(answererSocket.socketId).emit("receivedIceCandidateFromServer", iceCandidate)
                    }
                } else {
                    console.log("No Answerer socket found in the connected socket array")
                    return
                }


            } else {
                // const offer = offers.find((o) => o.answererUserName == iceUserName)

                if (!offer) {
                    console.log("No offer found")
                    return;
                }

                //offer.answererIceCandidates.push(iceCandidate)
                await addIceCandidates(roomCode, iceCandidate, "answerer")

                if (offer.offer.offererUserName) {

                    const offererSocket = offer.connectedSockets.find(s => s.userName == offer.offer.offererUserName)
                    console.log(`offerer Socket : ${offererSocket}`)
                    if (offererSocket) {
                        socket.to(offererSocket.socketId).emit("receivedIceCandidateFromServer", iceCandidate)
                    }
                } else {
                    console.log("No offerer socket found in the connected socket array")
                    return
                }



            }
        })
    })

}

export { setupRTC }