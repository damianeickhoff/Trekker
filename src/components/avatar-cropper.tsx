"use client";

import { Loader2, X, ZoomIn } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OUTPUT = 512;

/**
 * Square avatar cropper. Drag to reposition, slider to zoom; exports a
 * 512×512 JPEG. Deliberately dependency-free — it is a canvas and two events.
 */
export function AvatarCropper({
  file,
  onCancel,
  onDone,
}: {
  file: File;
  onCancel: () => void;
  onDone: (cropped: File) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<{ x: number; y: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);

  // Load the picked file into an Image once.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      imageRef.current = image;
      setOffset({ x: 0, y: 0 });
      setZoom(1);
      setReady(true);
    };
    image.src = url;

    return () => URL.revokeObjectURL(url);
  }, [file]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);

    // "Cover" the square, then apply the user's zoom and pan.
    const base = Math.max(size / image.width, size / image.height);
    const scale = base * zoom;
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;

    ctx.drawImage(
      image,
      (size - drawWidth) / 2 + offset.x,
      (size - drawHeight) / 2 + offset.y,
      drawWidth,
      drawHeight,
    );
  }, [zoom, offset]);

  useEffect(() => {
    if (ready) draw();
  }, [ready, draw]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onCancel]);

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    dragRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const start = dragRef.current;
    if (!start) return;
    setOffset({ x: e.clientX - start.x, y: e.clientY - start.y });
  }

  function onPointerUp() {
    dragRef.current = null;
  }

  function save() {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setSaving(true);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setSaving(false);
          return;
        }
        onDone(new File([blob], "avatar.jpg", { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.9,
    );
  }

  // Portalled to the body: inside the settings card, `backdrop-filter` creates
  // a stacking context that would trap this dialog behind later cards.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Crop your picture"
      className="fixed inset-0 z-[100] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div onClick={(e) => e.stopPropagation()} className="card w-full max-w-sm p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Crop your picture</h2>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="grid h-8 w-8 place-items-center rounded-full text-ink-400 transition hover:bg-ink-800 hover:text-ink-100"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex justify-center">
          <div className="relative h-64 w-64 overflow-hidden rounded-full border border-ink-700 bg-ink-800">
            <canvas
              ref={canvasRef}
              width={OUTPUT}
              height={OUTPUT}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="h-64 w-64 cursor-grab touch-none active:cursor-grabbing"
            />
            {!ready && (
              <div className="absolute inset-0 grid place-items-center text-ink-400">
                <Loader2 className="animate-spin" size={20} />
              </div>
            )}
          </div>
        </div>

        <label className="mt-4 flex items-center gap-3">
          <ZoomIn size={16} className="shrink-0 text-ink-400" />
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            aria-label="Zoom"
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-ink-700 accent-flare-500"
          />
        </label>

        <p className="mt-2 text-center text-xs text-ink-500">Drag the image to reposition.</p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={save}
            disabled={!ready || saving}
            className="flex-1 rounded-xl bg-flare-600 py-2.5 text-sm font-semibold text-white transition hover:bg-flare-500 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Use this picture"}
          </button>
          <button
            onClick={onCancel}
            className="rounded-xl border border-ink-700 px-4 py-2.5 text-sm text-ink-300 transition hover:bg-ink-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
