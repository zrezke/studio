// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

const PORT = 9998;
const fs = require("node:fs");
const net = require("node:net");

var metaChannel = fs.createWriteStream(null, { fd: 3 });
metaChannel.write(Uint8Array.from([1]));

try {
  const server = net.createServer((socket) => {
    // socket.setNoDelay(true);
    let nBytes = 0;
    let nReceived = 0;
    const buffer = new Uint8Array(20000000);
    socket.on("data", (data) => {
      if (nBytes === 0) {
        try {
          nBytes = data.readUInt32BE();
          // // assume the image is bigger than 65k
          nReceived += data.byteLength - 4;
          buffer.set(data.slice(4), 0);
          // const bytes = Buffer.alloc(8);
          // bytes.writeBigInt64LE(BigInt(nBytes));
          // fs.writeSync(1, bytes);
          // fs.fsyncSync(1);
        } catch (e) {
          metaChannel.write(e.toString());
        }
        if (nReceived >= nBytes) {
          try {
            process.stdout.write(Buffer.from(buffer.slice(0, nReceived), 0, nReceived));
            // fs.writeSync(1, Buffer.from(buffer.slice(0, nReceived), 0, nReceived));
            // fs.fsyncSync(1);
          } catch (e) {
            metaChannel.write(e.toString());
          }
          nReceived = 0;
          nBytes = 0;
        }
        return;
      }
      buffer.set(data, nReceived);
      nReceived += data.byteLength;
      if (nReceived >= nBytes) {
        try {
          process.stdout.write(Buffer.from(buffer.slice(0, nReceived), 0, nReceived));
          // fs.writeSync(1, Buffer.from(buffer.slice(0, nReceived), 0, nReceived));
          // fs.fsyncSync(1);
        } catch (e) {
          metaChannel.write(e.toString());
        }
        nReceived = 0;
        nBytes = 0;
      }
    });

    process.stdin.on("data", (msg) => {
      // process.stdout.write("CHILD RECEIVED MESSAGE");
      try {
        const bytesInMessage = new Uint8Array(4);
        const byteLength = msg.byteLength;
        bytesInMessage[0] = (byteLength >> 24) & 0xff;
        bytesInMessage[1] = (byteLength >> 16) & 0xff;
        bytesInMessage[2] = (byteLength >> 8) & 0xff;
        bytesInMessage[3] = byteLength & 0xff;
        socket.write(Buffer.concat([bytesInMessage, msg]));
      } catch (e) {
        metaChannel.write(e.toString());
      }
    });
  });
  server.listen(PORT, "localhost", (s) => {});

  // process.stdout.write(server.listening.toString());
} catch (e) {
  metaChannel.write(e.toString());
  // process.stdout.write(e.toString());
}
