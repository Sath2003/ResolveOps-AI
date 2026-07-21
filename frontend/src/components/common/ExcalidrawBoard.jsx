"use client";

import React from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";



export default function ExcalidrawBoard({ elements, appState }) {
  // Excalidraw wrapper component with styling for a dark theme dashboard integration
  return (
    <div className="w-full h-[400px] border border-white/10 rounded-xl overflow-hidden bg-[#020617] my-3 relative">
      <Excalidraw
        initialData={{
          elements: elements || [],
          appState: {
            viewBackgroundColor: "#020617",
            currentItemFontFamily: 1, // Hand-drawn/Sketch style font
            theme: "dark",
            collaborative: false,
            ...appState
          },
          scrollToContent: true
        }}
        detectScroll={true}
      />
    </div>
  );
}
