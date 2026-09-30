"use client";

import { useEffect, useRef } from "react";

// Canvas-based animated noise/grain effect for Live mode background.
export default function NoiseCanvas() {
  const canvasRef = useRef(null);
  const frameRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let w = 0, h = 0;
    let seed = Date.now();

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener("resize", resize);

    // Seed-based random so the noise doesn't flicker between frames.
    function nextRand() {
      seed = (seed * 16807 + 1) & 0x7fffffff;
      return (seed - 1) / 0x7fffffff;
    }

    function frame() {
      const imgData = ctx.createImageData(w, h);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = nextRand() * 255 | 0;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      frameRef.current = requestAnimationFrame(frame);
    }
    frameRef.current = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 0,
        opacity: 0.06,
        pointerEvents: "none",
        filter: "blur(2px)",
      }}
    />
  );
}
