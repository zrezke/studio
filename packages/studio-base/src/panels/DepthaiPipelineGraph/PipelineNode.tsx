// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useCallback, useMemo } from "react";
import { Handle, Position } from "reactflow";

import Log from "@foxglove/log";

const log = Log.getLogger(__filename);

const handleStyle = { top: 10 };

enum PortType {
  Input = 3,
  Output = 0,
}
interface Port {
  name: string;
  type: PortType;
  node_id: string;
  group_name: string;
  blocking: boolean;
  queue_size: number;
  wait_for_message: boolean;
}

export interface PipelineNodeProps {
  data: {
    name: string;
    ports: Port[];
  };
}

const fontSize = 8;

export function PipelineNode({ data }: PipelineNodeProps): JSX.Element {
  const onChange = useCallback((evt) => {
    // console.log(evt.target.value);
  }, []);

  const inputPorts = useMemo(
    () =>
      data.ports
        .filter((port) => port.type === PortType.Input)
        .map((port, i) => {
          return (
            <>
              {/* <div key={port.name} style={{ top: 10 * (i + 1), fontSize: 10, textAlign: "right" }}> */}
              <div
                style={{
                  left: 4,
                  display: "block",
                  top: 10 * (i + 1) - fontSize / 2,
                  fontSize,
                  position: "absolute",
                }}
              >
                {port.name}
              </div>
              <Handle
                type="source"
                position={Position.Left}
                id={port.name}
                style={{ top: 10 * (i + 1), fontSize }}
                isConnectable={false}
              ></Handle>
              {/* </div> */}
            </>
          );
        }),
    [data],
  );
  const outputPorts = useMemo(
    () =>
      data.ports
        .filter((port) => port.type === PortType.Output)
        .map((port, i) => {
          return (
            <>
              {/* <div key={port.name} style={{ top: 10 * (i + 1), fontSize: 10, textAlign: "right" }}> */}
              <div
                style={{
                  right: 4,
                  display: "block",
                  top: 10 * (i + 1) - fontSize / 2,
                  fontSize,
                  position: "absolute",
                }}
              >
                {port.name}
              </div>
              <Handle
                type="source"
                position={Position.Right}
                id={port.name}
                style={{ top: 10 * (i + 1), fontSize }}
                isConnectable={false}
              ></Handle>
              {/* </div> */}
            </>
          );
        }),
    [data],
  );
  return (
    <>
      <div>
        <strong>{data.name}</strong>
      </div>
      {inputPorts}
      {outputPorts}
    </>
  );
}
