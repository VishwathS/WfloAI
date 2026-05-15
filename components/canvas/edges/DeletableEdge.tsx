"use client";

import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  useReactFlow,
  type EdgeProps
} from "reactflow";

export function DeletableEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  selected,
  markerEnd,
  style
}: EdgeProps) {
  const { deleteElements } = useReactFlow();
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition
  });

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      {selected ? (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="absolute rounded-full border border-rose-400/40 bg-zinc-950 px-2 py-1 text-xs font-semibold text-rose-200 shadow-lg transition hover:bg-rose-500/15"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all"
            }}
            onClick={() => {
              void deleteElements({
                edges: [{ id }]
              });
            }}
          >
            Delete
          </button>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
