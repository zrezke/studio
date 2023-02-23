// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

const PORT = 9999;
const fs = require("node:fs");
const net = require("node:net");

var metaChannel = fs.createWriteStream(null, { fd: 3 });
metaChannel.write(Uint8Array.from([1]));
// process.stdout.write("STARTED CHILD");
try {
  const server = net.createServer((socket) => {
    // process.stdout.write("CREATED SERVER");
    socket.setNoDelay(true);
    let nBytes = 0;
    let nReceived = 0;
    // let received = [];
    const buffer = new Uint8Array(20000000);
    socket.on("data", (data) => {
      if (nBytes === 0) {
        // log.info("Length: ", data.byteLength);
        nBytes = data.readUInt32BE();
        // assume the image is bigger than 65k
        nReceived += data.byteLength - 4;
        // log.info("N Bytes: ", nBytes, " N Received: ", nReceived);
        // received.push(data.slice(4));
        buffer.set(data.slice(4), 0);
        if (nReceived >= nBytes) {
          // process.send(Buffer.from(buffer.slice(0, nReceived), 0, nReceived)); // This get's serialized (ugh)
          process.stdout.write(Buffer.from(buffer.slice(0, nReceived), 0, nReceived), (err) => {
            metaChannel.write(Uint8Array.from([1]));
          });
          // process.parentPort.postMessage(Buffer.concat(received));
          // received = null;
          // received = [];
          nReceived = 0;
          nBytes = 0;
        }
        return;
      }
      // received.push(data);
      buffer.set(data, nReceived);
      nReceived += data.byteLength;
      // log.info("N ALL: ", nReceived, " N BYTES: ", nBytes);
      if (nReceived >= nBytes) {
        // log.info("Sending");
        // process.send(Buffer.from(buffer.slice(0, nReceived), 0, nReceived)); // This get's serialized (ugh) switch to stdout but it gets cutofff omg
        process.stdout.write(Buffer.from(buffer.slice(0, nReceived), 0, nReceived), (err) => {
          metaChannel.write(Uint8Array.from([1]));
        });
        // process.parentPort.postMessage(Buffer.concat(received));
        // received = null;
        // received = [];
        nReceived = 0;
        nBytes = 0;
      }
      // browserWindow.webContents.send("fromMain", data);
    });

    process.stdin.on("data", (msg) => {
      // process.stdout.write("CHILD RECEIVED MESSAGE");
      const bytesInMessage = new Uint8Array(4);
      const byteLength = msg.byteLength;
      bytesInMessage[0] = (byteLength >> 24) & 0xff;
      bytesInMessage[1] = (byteLength >> 16) & 0xff;
      bytesInMessage[2] = (byteLength >> 8) & 0xff;
      bytesInMessage[3] = byteLength & 0xff;
      socket.write(Buffer.concat([bytesInMessage, msg]));
    });
  });
  server.listen(PORT, "localhost", (s) => {});

  // process.stdout.write(server.listening.toString());
} catch (e) {
  // process.stdout.write("ERROR");
  // process.stdout.write(e.toString());
}
