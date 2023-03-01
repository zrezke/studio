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
  ConnectionMode,
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
          name: "video",
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
          name: "preview",
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
          name: "frameEvent",
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
    type: "pipelineNode",
  },
  {
    data: {
      name: "ImageManip",
      ports: [
        {
          name: "out",
          type: 0,
          node_id: "2",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "inputConfig",
          type: 3,
          node_id: "2",
          group_name: "",
          blocking: true,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "inputImage",
          type: 3,
          node_id: "2",
          group_name: "",
          blocking: false,
          queue_size: 2,
          wait_for_message: true,
        },
      ],
    },
    id: "2",
    position: { x: 200, y: 0 },
    type: "pipelineNode",
  },
  {
    data: {
      name: "XLinkOut",
      ports: [
        {
          name: "in",
          type: 3,
          node_id: "4",
          group_name: "",
          blocking: true,
          queue_size: 8,
          wait_for_message: true,
        },
      ],
    },
    id: "4",
    position: { x: 200, y: 100 },
    type: "pipelineNode",
  },
  {
    data: {
      name: "DetectionNetwork",
      ports: [
        {
          name: "out",
          type: 0,
          node_id: "1",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "passthrough",
          type: 0,
          node_id: "1",
          group_name: "",
          blocking: false,
          queue_size: 8,
          wait_for_message: false,
        },
        {
          name: "in",
          type: 3,
          node_id: "1",
          group_name: "",
          blocking: true,
          queue_size: 5,
          wait_for_message: true,
        },
      ],
    },
    id: "1",
    position: { x: 400, y: 0 },
    type: "pipelineNode",
  },
  {
    data: {
      name: "XLinkOut",
      ports: [
        {
          name: "in",
          type: 3,
          node_id: "3",
          group_name: "",
          blocking: true,
          queue_size: 8,
          wait_for_message: true,
        },
      ],
    },
    id: "3",
    position: { x: 600, y: 0 },
    type: "pipelineNode",
  },
  {
    data: {
      name: "XLinkOut",
      ports: [
        {
          name: "in",
          type: 3,
          node_id: "5",
          group_name: "",
          blocking: true,
          queue_size: 8,
          wait_for_message: true,
        },
      ],
    },
    id: "5",
    position: { x: 600, y: 100 },
    type: "pipelineNode",
  },
];

const initialEdges: Edge[] = [
  {
    source: "1",
    target: "5",
    targetHandle: "in",
    sourceHandle: "passthrough",
    id: "1[passthrough]-5[in]",
  },
  { source: "0", target: "4", targetHandle: "in", sourceHandle: "preview", id: "0[preview]-4[in]" },
  { source: "1", target: "3", targetHandle: "in", sourceHandle: "out", id: "1[out]-3[in]" },
  { source: "2", target: "1", targetHandle: "in", sourceHandle: "out", id: "2[out]-1[in]" },
  {
    source: "0",
    target: "2",
    targetHandle: "inputImage",
    sourceHandle: "preview",
    id: "0[preview]-2[inputImage]",
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
        connectionMode={ConnectionMode.Loose}
      />
    </>
  );
}

DepthaiPipelineGraph.panelType = "DepthaiPipelineGraph";
DepthaiPipelineGraph.defaultConfig = {};

export default Panel(DepthaiPipelineGraph);
