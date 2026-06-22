import crypto from 'node:crypto';
import { room } from '../models/room.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';









async function roomCheck(roomCode) {
    return await room.findOne({ roomId: roomCode })
}


// const generateRoomCode =asyncHandler(async(req,res) =>  {
//      console.log(req.body)
//     const generate8DigitHexNode = () =>{ return crypto.randomBytes(3).toString('hex')};
//     console.log(generate8DigitHexNode())

// const r = await room.create({
//     roomId : generate8DigitHexNode()
// })

//     console.log(r)

//     console.log(process.env.fff)
//     //res.status(200).json(new ApiResponse(200,generate8DigitHexNode()))
//     return generate8DigitHexNode()

// })
async function generateRoomCode() {

   let newRoomCode
   let roomStat
    console.log("new room code utils :", newRoomCode)
    do {
          newRoomCode = (await crypto.randomBytes(3).toString('hex').toUpperCase());
        roomStat = await room.findOne({roomId : newRoomCode})
        console.log(`room stat : ${roomStat}`)
    } while (roomStat);
    let  r
    try {
         r = await room.create({
        roomId: newRoomCode
    })
    } catch (error) {
        newRoomCode
         r = await room.create({
        roomId: newRoomCode
    })
    }
    

    console.log(r)

    return newRoomCode
}


//    const joinRoom = asyncHandler(async (req,res) =>{
//     console.log(req.body)
//        const {roomId,userName} = req.body || null
//        if (roomId == null) return res.status(400).json(new ApiResponse(400,"Enter Valid RoomId!"))

//        const roomCheck = await room.findOne({roomId : roomId})

//        if(roomId){
//         // console.log("found room")
//         const user ="s"
//        }else{
//         console.log("no such room Found")
//        }
//    })


async function joinRoom(roomCode, socketDetails,type) {

    console.log(roomCode, socketDetails)

    const roomStatus = await roomCheck(roomCode)

    if(type == "offerer"){
         if (roomStatus) {
        await roomStatus.updateOne({
            "offer.offererUserName": socketDetails.userName
        })
        if(roomStatus.connectedSockets.length > 2){
            return {type : "info",status: "failed", message: "Room is already full!"}
        }
        await roomStatus.connectedSockets.push(socketDetails)

        await roomStatus.save()
        console.log(roomStatus)
       return {type : "info" , status : "success" , message : "Successfully Joined the Room!" ,offer : (roomStatus.offer)}
       // return roomStatus
    } else {
        console.log("room does nto exist!!!")
    }
    }else if(type == "answerer"){
        console.log("adding answere join room sokcet")
        console.log(socketDetails)
         if (roomStatus) {
        await roomStatus.updateOne({
            "offer.answererUserName": socketDetails.userName
        })
        if(roomStatus.connectedSockets.length > 2){
            return {type : "info",status : "failed", message: "Room is already full!"}
        }
        await roomStatus.connectedSockets.push(socketDetails)

        await roomStatus.save()
        console.log(roomStatus)

        return {type : "info" , status : "success" , message : "Successfully Joined the Room!" ,offer : roomStatus.offer}
    } else {
      console.log("room does noo exist!!!")
       return {type : "info",status : "failed", message: "Room Does not Exist"}
    }
    }



}


async function addIceCandidates(roomCode, iceCandidates, type) {
    const roomStatus =await roomCheck(roomCode)
 
    if (type == "offerer") {
          console.log("getting into offerer")
        // await roomStatus.offer.offerIceCandidates.push(iceCandidates)
        await room.findOneAndUpdate({roomId:roomCode},{ $push : {
            "offer.offerIceCandidates" : (iceCandidates)
        }})
    //   await  roomStatus.save()
        console.log(roomStatus)

    } else if (type == "answerer") {
           console.log("getting into answerer")
       // await roomStatus.offer.answererIceCandidates.push(iceCandidates)
      await room.findOneAndUpdate({roomId:roomCode},{ $push : {
            "offer.answererIceCandidates" : (iceCandidates)
        }})
    //   await  roomStatus.save()
        console.log(roomStatus)

    }
}

async function addOfferAndAnswer(roomCode, pack, type) { 
    console.log("reached add offer and answer")
    console.log(`pack : ${pack}`)
    const roomStatus = await roomCheck(roomCode)

    if (type == "offerer") {
         console.log("inside if")
       await room.findOneAndUpdate({roomId:roomCode},{
        "offer.offer" : pack
       })
        console.log(roomStatus)

    } else if (type == "answerer") {

       await room.findOneAndUpdate({roomId:roomCode},{
        "offer.answer" : pack
       })
        console.log(roomStatus)
    }
}

export { generateRoomCode, joinRoom ,addIceCandidates,addOfferAndAnswer,roomCheck}
