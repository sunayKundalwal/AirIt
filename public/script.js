// import { userName } from "./socket.js";
// import { dataChannel } from "./webRTCConnection.js";



// //document.querySelector('#user-name').innerHTML = userName;

// /////////////////////////////////////////////////


// const CHUNK_SIZE = 256 * 1024;
// let selectedFiles = [];
// let dirHandler
// // dataChannel.bufferedAmountLowThreshold = 1024 * 1024;


// function waitForBufferLow(dc) {
//         return new Promise(resolve => {
//             console.log(`buffered memory : ${dc.onbufferedamountlow}`)
//             dc.onbufferedamountlow = () => resolve();
//         });
//     }

//     const sendFile = async (file,currentFileNumber) => {
//         //const file = document.getElementById("fileInput").files[index]
//                dataChannel.send(JSON.stringify({
//         type: "currentFileMetaData",
//         fileName: file.name,
//         mime: file.type,
//         size: file.size,
//         fileNumber : currentFileNumber
//     }));

//         let offset = 0;
//         let percent;

//         while (offset < file.size) {
//             console.log((offset / file.size) * 100)
//             // console.log(dataChannel.bufferedAmount);
//             // 🔥 BACKPRESSURE CONTROL
//             if (dataChannel.bufferedAmount > 4 * 1024 * 1024) {
//                 await waitForBufferLow(dataChannel);
//             }

//             const slice = file.slice(offset, offset + CHUNK_SIZE);
//             const buffer = await slice.arrayBuffer();

//             dataChannel.send(buffer);

//             offset += CHUNK_SIZE;

//             percent = Math.min((offset / file.size) * 100, 100);

//             if (percent == 100) {
//                 dataChannel.send(JSON.stringify({ type: "end" }));
//             }

//             uploadProgress.value = percent;
//             uploadText.textContent = percent + "%";
//         }


//     };


// // const sendFileBtn = document.getElementById("btn").addEventListener("click", async () => {

// //     const file = document.getElementById("fileInput").files[0]
    

    

// //     sendFile(file)
// // })

// document.getElementById("btn-dir").addEventListener("click",async ()=> {
//       dirHandler = await window.showDirectoryPicker();
//       console.log("dirHAndlesssssssssssss")
//       let status = await dirHandler.queryPermission({
//     mode: "readwrite"
// });

//  console.log("Before request:", status);

//     if (status !== "granted") {
//         status = await dirHandler.requestPermission({
//             mode: "readwrite"
//         });

//         console.log("After request:", status);
//     }
// })



// // document.getElementById("down").addEventListener("click", async () => {
// //     chunks.forEach(element => {
// //         console.log(element)
// //     });

// //     const blob = new Blob(chunks,
// //         { type: metaData.mime }

// //     );
// //     console.log(`blob  : ${blob}`)

// //     const a = document.createElement("a");
// //     console.log(`a log ${a}`)
// //     a.href = URL.createObjectURL(blob);
// //     a.download = `DropIt-${metaData.fileName}`;
// //     a.click();
// //     console.log(`sender fie size: ${metaData.size} ans recieved file size: ${blob.size}`)
// // })

// document.getElementById("sendMeta").addEventListener("click", async () => {
//     console.log(`dataChannel label: ${(dataChannel.label)}`)
//     const x = document.getElementById("fileInput").files
//         console.log(x)
//     console.log("called metaSend")
//     const file = document.getElementById("fileInput").files
//     console.log(file)
//     // dataChannel.send(JSON.stringify({
//     //     type:"metaData",
//     //     files : JSON.stringify
//     // }))
// let fileArray =[]
//     for(let f of file){
//     //        dataChannel.send(JSON.stringify({
//     //     type: "metaData",
//     //     fileName: f.name,
//     //     mime: f.type,
//     //     size: f.size
//     // }));
//     fileArray.push({
//         fileNumber : (fileArray.length+1),
//         name: f.name,
//         type: f.type,
//         size: f.size,
//         lastModified: f.lastModified
//     })
//     }



//     await dataChannel.send(JSON.stringify({
//         type: "metaData",
//         // fileName: file.name,
//         // mime: file.type,
//         // size: file.size
//         fileArray : fileArray
//     }));



// })



// // document.getElementById("fileInput").addEventListener("change", (event)=> {
// //     const files = event.target.value ? event.target.files : [];

// //     console.log(files)
// // })

// function renderFileList(selectedFiles) {
//   const container = document.getElementById("fileList");
//   container.innerHTML = "";

//   selectedFiles.forEach((file, index) => {
//     const div = document.createElement("div");
//     div.className = "file-item";

//     div.innerHTML = `
//       <div class="file-name">${file.name}</div>
//       <div class="small-text">${(file.size / 1024).toFixed(2)} KB</div>



//       <div class="progress-row">
//       <div>upload</div>
//         <progress id="up-${index}" value="0" max="100"></progress>
//         <span id="upText-${index}">0%</span>
//       </div>

//       <div class="progress-row">
//       <div>download</div>
//         <progress id="down-${index}" value="0" max="100"></progress>
//         <span id="downText-${index}">0%</span>
//       </div>
//     `;

//     container.appendChild(div);
//   });
// }

// fileInput.addEventListener("change", (e) => {
//   selectedFiles = Array.from(e.target.files);
//   renderFileList(selectedFiles);
// });

// let fileArr = []
// document.getElementById("btn").addEventListener("click", async () => {
//          console.log("send button clicked")
//             const Files = document.getElementById("fileInput").files
//             console.log(Files)
            
//                let index =1;
//             for await (let f of Files){
//                 fileArr.push(f)
//                 let currentFileNumber = fileArr.length
//                 console.log("f printing")
//                 console.log(f)
//                 //let index = f.fileNumber
//                 let file = document.getElementById("fileInput").files[index]
//                 console.log(index)
//                await sendFile(f,currentFileNumber)

//               await new Promise((resolve) => {
//                 dataChannel.addEventListener("message",(e)=> {
//                     const parsedData = JSON.parse(e.data)
//                        if(parsedData.type == "ack"){
//                          if(parsedData.status == "success"){
//                             console.log(`${currentFileNumber} is successfully transmitted`)
//                             resolve()
//                          }
                       
//                 }})
//                       })

//                }
//             })

          

//             //  document.getElementById("btn-dir").addEventListener("click", async () => {
                
//             //         handle = await dirHandle.getFileHandle(`${userName}-${metaData.fileName}`, {
//             //             create: true
//             //         });
        


// export const uploadProgress = document.getElementById("uploadProgress");
// export const uploadText = document.getElementById("uploadText");

// export {sendFile,renderFileList,dirHandler}