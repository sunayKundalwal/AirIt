import mongoose, { Schema } from "mongoose";


// offererUserName
// offer
// offerIceCandidates
// answererUserName
// answer
// answererIceCandidates

const roomSchema = new Schema({
    roomId: {
        type: String,
        unique: true,
        index: true,
        required: true
    },
    connectedSockets: [{

        userName: {
            type: "String"
        },
        socketId: {
            type: String
        }
    }],

    offer: {

        offererUserName: String,
        offer: String,
        offerIceCandidates: [{ type : String}],
        answererUserName: String,
        answer: String,
        answererIceCandidates: []

    }

}, { timestamps: true })

export const room = mongoose.model("room", roomSchema)