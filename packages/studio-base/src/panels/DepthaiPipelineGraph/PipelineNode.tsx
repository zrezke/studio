// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useCallback, useEffect, useMemo } from "react";
import { Handle, Position, useUpdateNodeInternals } from "reactflow";

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
  id: string;
  data: {
    name: string;
    ports: Port[];
  };
}

const fontSize = 8;

export function PipelineNode({ data, id }: PipelineNodeProps): JSX.Element {
  const onChange = useCallback((evt) => {
    // console.log(evt.target.value);
  }, []);

  const updateNodeInternals = useUpdateNodeInternals();

  const inputPorts = useMemo(
    () =>
      data.ports
        .filter((port) => port.type === PortType.Input)
        .map((port, i) => {
          return (
            <>
              <div
                key={port.name}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  fontSize,
                  justifyContent: "flex-start",
                }}
              >
                <Handle
                  key={port.name}
                  type="target"
                  style={{
                    position: "relative",
                    fontSize,
                    marginLeft: "1px",
                  }}
                  position={Position.Left}
                  id={port.name}
                  isConnectable={false}
                ></Handle>
                {port.name}
              </div>
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
              <div
                key={port.name}
                style={{
                  display: "flex",
                  flexDirection: "row",
                  fontSize,
                  justifyContent: "flex-end",
                }}
              >
                {port.name}
                <Handle
                  key={port.name}
                  type="source"
                  style={{
                    position: "relative",
                    fontSize,
                  }}
                  position={Position.Right}
                  id={port.name}
                  isConnectable={false}
                ></Handle>
                {/* </div> */}
              </div>
            </>
          );
        }),
    [data],
  );
  // for (const port of data.ports) {
  //   updateNodeInternals(data.name + "-" + port.name);
  // }
  useEffect(() => {
    updateNodeInternals(id);
  }, [inputPorts, outputPorts, id]);
  return (
    <div
      style={{
        width: "fit-content",
        height: "fit-content",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "#faa",
        padding: "2px",
        border: "none",
        borderRadius: "4px",
      }}
    >
      <div
        style={{
          filter: "brightness(0.8)",
          fontSize: 10,
          border: "none",
          borderRadius: "4px",
          backgroundColor: "#faa",
          fontWeight: "500",
          display: "flex",
          flexDirection: "row",
          justifyContent: "center",
          paddingLeft: "4px",
          paddingRight: "4px",
        }}
      >
        {data.name}
      </div>
      <div
        style={{
          display: "flex",
          position: "relative",
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: "4px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginRight: "24px",
          }}
        >
          {inputPorts}
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
          }}
        >
          {outputPorts}
        </div>
      </div>
    </div>
  );
}
