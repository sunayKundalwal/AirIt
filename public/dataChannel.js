import { renderFileList, sendFile, dirHandler } from "./script.js";
import { userName } from "./socket.js";
import { dataChannel } from "./webRTCConnection.js";


const answerDataChannel = async (dataChannel) => {



    let chunks = [];
    let metaData;
    let percent


    dataChannel.onopen = () => {
        console.log("Data channel open");
        // dataChannel.label = "answerer"
        //  dataChannel.send(JSON.stringify("{type:,dataChannelStatus : Open}"))
    };

    //   dataChannel.onmessage = (event) => {
    //     console.log("Received:", event.data);
    //   };


    let handle;
    let writable;
    let bytesReceived = 0;
    let currentFile;
    dataChannel.onmessage = async (event) => {
        //console.log("meowwwwwwwwwwww")
        const data = (event.data)

        if (data instanceof ArrayBuffer) {
            console.log("Got ArrayBuffer");
            console.log(event)
            console.log(`byte length:${data.byteLength}`)
            // chunks.push(event.data);
            console.log(writable)
            await writable.write(data);

            bytesReceived += data.byteLength

            let percent = Math.min((bytesReceived / currentFile.size) * 100, 100);
            console.log(`percent : ${percent}`)
            document.getElementById("downloadProgress").value = percent
            document.getElementById("downloadText").textContent = `${percent}%`
            console.log(`byte length = ${bytesReceived}`)

            if (bytesReceived == currentFile.size) {
                console.log("Complete file received!!!!!")
                bytesReceived = 0;
                percent = 0;

                dataChannel.send(JSON.stringify({
                    type: "ack",
                    status: "success",
                    fileNumber: currentFile.fileNumber
                }))

            }



        } else {
            let d = JSON.parse(data)
            console.log(`on message Data  : ${d.type}`)
            if (d.type == 'metaData') {
                console.log("meta dataaaaaaaaaaaaa")
                metaData = d
                console.log(metaData)
                console.log(userName)

                renderFileList(metaData.fileArray)


            } else if (d.type == "currentFileMetaData") {
                bytesReceived = 0;
                percent = 0;
                currentFile = d;
                handle = await dirHandler.getFileHandle(`${userName}-${currentFile.fileName}`, {
                    create: true
                });
                console.log("handle is setiped")

                console.log(`handle data :${handle}`)

                //handle = await window.showSaveFilePicker({ suggestedName: `${userName}-${metaData.fileName}` })
                // console.log(`handleee ${handle.name}`)
                writable = await handle.createWritable()
                console.log("writeable initiated")







                console.log(d)


            } else if (d.type == "end") {
                //if(metaData.fileArray.length == currentFile.fileNumber){

                await writable.close();
                console.log("writable closed")
                // // }

                // console.log("Transfer complete");
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
        //dataChannel.label = "caller"

        //   dataChannel.send("Hello from Peer A");
    };
    let handle;
    let writable;
    let bytesReceived = 0;
    let currentFile;
    let chunks = [];
    let metaData;
    let percent

    dataChannel.onmessage = async (event) => {
        //console.log("meowwwwwwwwwwww")
        const data = (event.data)

        if (data instanceof ArrayBuffer) {
            console.log("Got ArrayBuffer");
            console.log(event)
            console.log(`byte length:${data.byteLength}`)
            // chunks.push(event.data);
            console.log(writable)
            await writable.write(data);

            bytesReceived += data.byteLength

            let percent = Math.min((bytesReceived / currentFile.size) * 100, 100);
            console.log(`percent : ${percent}`)
            document.getElementById("downloadProgress").value = percent
            document.getElementById("downloadText").textContent = `${percent}%`
            console.log(`byte length = ${bytesReceived}`)

            if (bytesReceived == currentFile.size) {
                console.log("Complete file received!!!!!")
                bytesReceived = 0;
                percent = 0;

                dataChannel.send(JSON.stringify({
                    type: "ack",
                    status: "success",
                    fileNumber: currentFile.fileNumber
                }))

            }



        } else {
            let d = JSON.parse(data)
            console.log(`on message Data  : ${d.type}`)
            if (d.type == 'metaData') {
                console.log("meta dataaaaaaaaaaaaa")
                metaData = d
                console.log(metaData)
                console.log(userName)

                renderFileList(metaData.fileArray)


            } else if (d.type == "currentFileMetaData") {
                bytesReceived = 0;
                percent = 0;
                currentFile = d;
                handle = await dirHandler.getFileHandle(`${userName}-${currentFile.fileName}`, {
                    create: true
                });
                console.log("handle is setiped")

                console.log(`handle data :${handle}`)

                //handle = await window.showSaveFilePicker({ suggestedName: `${userName}-${metaData.fileName}` })
                // console.log(`handleee ${handle.name}`)
                writable = await handle.createWritable()
                console.log("writeable initiated")







                console.log(d)


            } else if (d.type == "end") {
                // if(metaData.fileArray.length == currentFile.fileNumber){

                //    await writable.close();
                //    console.log("writable closed")
                // }
                await writable.close();
                console.log("writable closed")

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



    // const sendFileBtn = document.getElementById("btn").addEventListener("click", async () => {
    //  console.log("send button clicked")
    //     const totalFiles = document.getElementById("fileInput").files



    //     for await (let f of files){
    //         let index = f.fileNumber
    //         let file = document.getElementById("fileInput").files[index]
    //        await sendFile(file)

    //        const ack = new Promise((resolve) => {

    //                if(parsedData.type = "ack"){
    //                  if(parsedData.status == "success"){
    //                     console.log(`${parsedData.fileNumber} is successfully transmitted`)
    //                     resolve()
    //                  }
    //                }

    //        })
    //     }




    // })

    // if (parsedData.type == "info") {
    //     await sendFile()

    // }




};







export { answerDataChannel, callDataChannel }