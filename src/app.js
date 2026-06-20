import path from "path"
import http from "http"
import express from "express"
import { Server } from "socket.io"
import { setupRTC } from "./webRTC.js"
import utilsRouter from "./routes/utils.router.js"
import dotenv from "dotenv"
import connectDb from "./DB/index.js"
import cors from "cors";

dotenv.config({
    path: "./src/.env"

})

////////////// setting up websocket connection
const app = express()
const server = http.createServer(app)
const io = new Server(server,{
    cors : {
    origin: [
   //   "https://airit.site",
    // "https://www.airit.site",
    //   "https://air-fv1gf9bkw-todos-projects-0a36388c.vercel.app",
    //   "https://air-it-todos-projects-0a36388c.vercel.app",
      "https://air-it.vercel.app",
      "https://www.airit.site/",
      "https://airit.site/"
    //"*"
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
})




app.use(express.static("public"))
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Parse application/json



app.use("/api/v1/utils",utilsRouter)

connectDb().then(() =>{
server.listen(8080, "0.0.0.0", () => {
    console.log("Listening on the port 8080!!!")
    setupRTC()
})
}).catch(err=>{
    console.log(`MONGODB connection failed  `, err)
})



export {io}