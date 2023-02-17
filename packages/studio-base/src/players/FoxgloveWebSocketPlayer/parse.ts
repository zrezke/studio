// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

//import Log from "@foxglove/log";
import { BinaryOpcode, ServerMessage } from "@foxglove/ws-protocol";

//const log = Log.getLogger(__filename);
export function parseServerMessage(buffer: ArrayBuffer): ServerMessage {
  const view = new DataView(buffer);

  let offset = 0;
  const op = view.getUint8(offset);
  // log.info("OP: ", op);
  offset += 1;

  switch (op as BinaryOpcode) {
    case BinaryOpcode.MESSAGE_DATA: {
      const subscriptionId = view.getUint32(offset, true);
      offset += 4;
      const timestamp = view.getBigUint64(offset, true);
      offset += 8;
      const data = new DataView(buffer, offset);
      return { op, subscriptionId, timestamp, data };
    }
    case BinaryOpcode.TIME: {
      const timestamp = view.getBigUint64(offset, true);
      return { op, timestamp };
    }
  }
  throw new Error(`Unrecognized server opcode in binary message: ${op.toString(16)}`);
}
