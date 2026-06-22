"use client";

import { useCallback, useRef } from "react";
import { useReactFlow } from "reactflow";

const MIN_WIDTH = 220;
const MIN_HEIGHT = 120;

export function useNodeResize(nodeId: string) {
  const { setNodes, getZoom } = useReactFlow();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const onResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const zoom = getZoom();
      const startX = e.clientX;
      const startY = e.clientY;
      const startWidth = containerRef.current?.offsetWidth ?? MIN_WIDTH;
      const startHeight = containerRef.current?.offsetHeight ?? MIN_HEIGHT;

      function onMove(moveEvent: PointerEvent) {
        const newWidth = Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX) / zoom);
        const newHeight = Math.max(MIN_HEIGHT, startHeight + (moveEvent.clientY - startY) / zoom);

        setNodes((nodes) =>
          nodes.map((node) =>
            node.id === nodeId
              ? { ...node, style: { ...node.style, width: newWidth, height: newHeight } }
              : node
          )
        );
      }

      function onUp() {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      }

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [nodeId, setNodes, getZoom]
  );

  return { containerRef, onResizePointerDown };
}
