const userName = "DropIt" + Math.floor(Math.random() * 100000);
const password = "x";



const socket = io("https://cozy-tightrope-protegee.ngrok-free.dev", {
    auth: {
        userName,
        password
    }
});


export {userName,socket}

