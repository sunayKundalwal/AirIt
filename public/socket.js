

const userName = "DropIt" + Math.floor(Math.random() * 100000);
const password = "x";

const socketURL =  "https://cozy-tightrope-protegee.ngrok-free.dev"
//const socketURL =  "http://localhost:8080"
//const socketURL = "https://airit-production.up.railway.app/" 

const socket = io(socketURL, {
    auth: {
        userName,
        password
    },
   // transports: ["websocket"]
});

// socket.on("connect",async ()=> {
//     console.log("websocket is connecte (message from frontenfd)")
//     await socket.emit("isConnected","it is now connected")
// })


export {userName,socket}

