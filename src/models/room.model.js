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
        required: true,
        uppercase: true
    },
    connectedSockets: [{

        userName: {
            type: String
        },
        socketId: {
            type: String
        }
    }],

    offer: {

        offererUserName: String,
        offer: Schema.Types.Mixed,
        offerIceCandidates: [Schema.Types.Mixed],
        answererUserName: String,
        answer: Schema.Types.Mixed,
        answererIceCandidates: [Schema.Types.Mixed]

    }

}, { timestamps: true })

export const room = mongoose.model("room", roomSchema)