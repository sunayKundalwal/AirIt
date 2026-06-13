import mongoose from "mongoose";

const connectDb = async () => {
   try{
        console.log(process.env.MONGODB_URI)
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/airit`)
        console.log(`\n MongoDB connected DB host :- ${connectionInstance.connection.host}`)
    }catch(error){
        console.log("error connecting to DB ERROR:-",error)
        process.exit(1)
    }
} 

export default connectDb