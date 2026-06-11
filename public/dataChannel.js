import { renderFileList, sendFile } from "./script.js";
import { userName } from "./socket.js";
import { dataChannel } from "./webRTCConnection.js";


const answerDataChannel = async (dataChannel) => {
 

let chunks = [];
let metaData;
let percent


         dataChannel.onopen = () => {
            console.log("Data channel open");
            //  dataChannel.send(JSON.stringify("{type:,dataChannelStatus : Open}"))
        };

        //   dataChannel.onmessage = (event) => {
        //     console.log("Received:", event.data);
        //   };


        let handle;
        let writable;
        let bytesReceived = 0;
        dataChannel.onmessage = async (event) => {
            console.log("meowwwwwwwwwwww")
            const data = (event.data)

            if (data instanceof ArrayBuffer) {
                 console.log("Got ArrayBuffer");
                console.log(event)
                console.log(`byte length:${data.byteLength}`)
                // chunks.push(event.data);

                await writable.write(data);
                
                bytesReceived += data.byteLength
           
                let percent = Math.min((bytesReceived / metaData.size) * 100, 100);
                console.log(`percent : ${percent}`)
                document.getElementById("downloadProgress").value = percent
                document.getElementById("downloadText").textContent = `${percent}%`
                console.log(`byte length = ${bytesReceived}`)

                if(bytesReceived == metaData.size){
                    console.log("Complete file received!!!!!")
                }



            } else {
                let d = JSON.parse(data)
                console.log(`on message Data  : ${d.type}` )
                if (d.type == 'metaData') {
                    console.log("meta dataaaaaaaaaaaaa")
                    metaData = d
                    console.log(metaData)
                    console.log(userName)

                  renderFileList(metaData.fileArray)
                    document.getElementById("btn-file").addEventListener("click", async () => {
                        handle = await window.showSaveFilePicker({ suggestedName: `${userName}-${metaData.fileName}` })
                        console.log(`handleee ${handle.name}`)
                        writable = await handle.createWritable()

                        if(handle.name){
                            dataChannel.send(JSON.stringify({
                                type:"info",
                                downloadLocation : "true" 
                            }))
                            console.log("lkjhgfd")
                        }
                    })





                } else if (d.type == "end") {
                    await writable.close();
                    console.log("Transfer complete");
                }
            }





            // STREAMING TO DISK using File System Access API:
            // const fileHandle = await window.showSaveFilePicker({ suggestedName: "filename" });
            // const writable = await fileHandle.createWritable();

            // dc.onmessage = async (e) => {
            //   await writable.write(e.data); // goes straight to disk
            //   // e.data is freed from RAM immediately after this line
            //   // Peak RAM: only ONE chunk at a time, no matter how big the file
            // };

            // dc.onclose = async () => {
            //   await writable.close(); // finalize the file
            // };
            // //    const writable = await fileHandle.createWritable();

            // await writable.write(chunk);
        };


    };




    const callDataChannel = async (dataChannel) => {


         dataChannel.onopen = () => {
                console.log("Data channel opennnnnnnnnnnnnnn");
                //   dataChannel.send("Hello from Peer A");
            };
        
            dataChannel.onmessage = async (event) => {
                 console.log("Received:", event.data);
                const parsedData = JSON.parse(event.data)

            if(parsedData.type == "info"){
                await sendFile()
                
            }

               
            };
        
   
    }




export {answerDataChannel,callDataChannel}