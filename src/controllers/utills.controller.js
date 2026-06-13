import crypto from 'node:crypto';
import { room } from '../models/room.model.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';


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

    const newRoomCode = await crypto.randomBytes(3).toString('hex');
    console.log("new room code utils :",newRoomCode)

        const r = await room.create({
        roomId : newRoomCode
    })

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


async function  joinRoom(roomCode,socketDetails) {


}

export {generateRoomCode,joinRoom}
