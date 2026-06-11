import path from "path"
import http from "http"
import express from "express"
import { Server } from "socket.io"
import { setupRTC } from "./webRTC.js"

////////////// setting up websocket connection
const app = express()
const server = http.createServer(app)
const io = new Server(server)

app.use(express.static("public"))

server.listen(8080, "0.0.0.0", () => {
    console.log("Listening on the port 8080!!!")
    setupRTC()
})

export {io}