// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { Box, Divider } from "@mui/material";
import { useState, useCallback } from "react";
import ReactFlow, {
  addEdge,
  FitViewOptions,
  applyNodeChanges,
  applyEdgeChanges,
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  Position,
} from "reactflow";

import "reactflow/dist/style.css";
import Panel from "@foxglove/studio-base/components/Panel";
import PanelToolbar from "@foxglove/studio-base/components/PanelToolbar";

import { PipelineNode, PipelineNodeProps } from "./PipelineNode";

const nodeTypes = {
  pipelineNode: PipelineNode,
};

// const initialNodes: Node[] = [
//   { id: "node-1", type: "pipelineNode", position: { x: 0, y: 0 }, data: { value: 123 } },
//   {
//     id: "node-2",
//     type: "output",
//     targetPosition: Position.Top,
//     position: { x: 0, y: 200 },
//     data: { label: "node 2" },
//   },
//   {
//     id: "node-3",
//     type: "output",
//     targetPosition: Position.Top,
//     position: { x: 200, y: 200 },
//     data: { label: "node 3" },
//   },
// ];

// const initialEdges = [
//   { id: "edge-1", source: "node-1", target: "node-2", sourceHandle: "a" },
//   { id: "edge-2", source: "node-1", target: "node-3", sourceHandle: "b" },
// ];

const initialNodes: Node[] = [
  {
    data: {
      name: "ColorCamera",
      ports: [
        {
          name: "preview",
          type: 0,
          node_id: "0",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "still",
          type: 0,
          node_id: "0",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "isp",
          type: 0,
          node_id: "0",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "video",
          type: 0,
          node_id: "0",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "raw",
          type: 0,
          node_id: "0",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "inputConfig",
          type: 3,
          node_id: "0",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "inputControl",
          type: 3,
          node_id: "0",
          group_name: "",
          blocking: true,
          queue_size: 8,
          wait_for_message: false,
        },
      ],
    },
    id: "0",
    position: { x: 0, y: 0 },
    style: { border: "1px solid #777", padding: 10, background: "#faa" },
    type: "pipelineNode",
  },
  {
    data: {
      name: "VideoEncoder",
      ports: [
        {
          name: "bitstream",
          type: 0,
          node_id: "2",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "in",
          type: 3,
          node_id: "2",
          group_name: "",
          blocking: true,
          queue_size: 4,
          wait_for_message: true,
        },
      ],
    },
    id: "2",
    position: { x: 100, y: 0 },
    style: { border: "1px solid #777", padding: 10, background: "#faa" },
    type: "pipelineNode",
  },
  {
    data: {
      name: "XLinkOut",
      ports: [
        {
          name: "in",
          type: 3,
          node_id: "1",
          group_name: "",
          blocking: true,
          queue_size: 8,
          wait_for_message: true,
        },
      ],
    },
    id: "1",
    position: { x: 200, y: 0 },
    style: { border: "1px solid #777", padding: 10, background: "#faa" },
    type: "pipelineNode",
  },
];

const initialEdges: Edge[] = [
  {
    id: "edge-1",
    source: "0",
    sourceHandle: "preview",
    target: "1",
    targetHandle: "in",
    animated: true,
    label: "preview",
  },
];

const fitViewOptions: FitViewOptions = {
  padding: 0.2,
};

function DepthaiPipelineGraph(): JSX.Element {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((nds) => applyNodeChanges(changes, nds)),
    [setNodes],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    [setEdges],
  );
  const onConnect = useCallback(
    (connection: Connection) => setEdges((eds) => addEdge(connection, eds)),
    [setEdges],
  );
  return (
    <>
      <PanelToolbar />
      <Divider />
      <Box paddingTop={1}></Box>
      <Divider />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={fitViewOptions}
      />
    </>
  );
}

DepthaiPipelineGraph.panelType = "DepthaiPipelineGraph";
DepthaiPipelineGraph.defaultConfig = {};

export default Panel(DepthaiPipelineGraph);
