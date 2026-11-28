import { Handle, Position, type Node, type NodeProps, type NodeTypes } from '@xyflow/react';

export type BoxNodeData = { label: string; content: string };
export type BoxNode = Node<BoxNodeData>;

const SIDES = [
  { id: 'top', position: Position.Top },
  { id: 'right', position: Position.Right },
  { id: 'bottom', position: Position.Bottom },
  { id: 'left', position: Position.Left },
];

// One box for both diagram kinds: a UML class (name + members) or an ERD table (name + columns).
function BoxNodeView({ data, selected, isConnectable }: NodeProps<BoxNode>) {
  return (
    <div className={selected ? 'box-node selected' : 'box-node'}>
      {SIDES.map((side) => (
        <Handle key={side.id} id={side.id} type="source" position={side.position} isConnectable={isConnectable} />
      ))}
      <div className="box-node-title">{data.label}</div>
      {data.content && <div className="box-node-body">{data.content}</div>}
    </div>
  );
}

export const nodeTypes: NodeTypes = { umlClass: BoxNodeView, erdTable: BoxNodeView };
