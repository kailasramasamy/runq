import { useCallback, useEffect, useState } from 'react';
import Cropper, { type Area } from 'react-easy-crop';
import { X, Check, ZoomIn, ZoomOut } from 'lucide-react';

/**
 * Square crop + zoom modal. Renders the chosen file inside a 1:1 frame the
 * user can drag and zoom. On confirm, exports the cropped region to a JPEG
 * blob via canvas — the server still re-encodes / resizes, but doing the
 * heavy work in the browser means the upload payload is small and the user
 * controls framing.
 *
 * `srcFile` is the raw File chosen from the input; we object-URL it for
 * the cropper and revoke on unmount. `onConfirm(blob)` receives the
 * cropped JPEG (typically ~50–150 KB for a phone source).
 */

const OUTPUT_PX = 512;        // matches server-side PHOTO_SIZE_PX
const OUTPUT_QUALITY = 0.9;   // client quality; server re-encodes at 0.85

export function PhotoCropModal({
  srcFile,
  onConfirm,
  onCancel,
}: {
  srcFile: File;
  onConfirm: (blob: Blob) => void;
  onCancel: () => void;
}) {
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [pixelCrop, setPixelCrop] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(srcFile);
    setSrcUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [srcFile]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setPixelCrop(areaPixels);
  }, []);

  async function handleConfirm() {
    if (!srcUrl || !pixelCrop) return;
    setBusy(true);
    try {
      const blob = await renderCrop(srcUrl, pixelCrop);
      onConfirm(blob);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-xl shadow-2xl"
        style={{ background: 'var(--surface)' }}
      >
        <div
          className="flex items-center justify-between border-b px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="text-[14px] font-semibold" style={{ color: 'var(--text-1)' }}>
            Crop photo
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded p-1 hover:bg-[color:var(--surface-2)]"
            style={{ color: 'var(--text-2)' }}
            aria-label="Cancel"
          >
            <X size={16} />
          </button>
        </div>

        <div className="relative h-72 bg-black">
          {srcUrl && (
            <Cropper
              image={srcUrl}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>

        <div className="flex items-center gap-3 border-t px-4 py-3" style={{ borderColor: 'var(--border)' }}>
          <ZoomOut size={14} style={{ color: 'var(--text-3)' }} />
          <input
            type="range"
            min={1}
            max={4}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1 accent-[color:var(--accent)]"
            aria-label="Zoom"
          />
          <ZoomIn size={14} style={{ color: 'var(--text-3)' }} />
        </div>

        <div
          className="flex justify-end gap-2 border-t px-4 py-3"
          style={{ borderColor: 'var(--border)' }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-md px-3 py-1.5 text-[13px] font-medium hover:bg-[color:var(--surface-2)]"
            style={{ color: 'var(--text-2)' }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={busy || !pixelCrop}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-semibold text-white"
            style={{ background: 'var(--accent)' }}
          >
            <Check size={14} />
            {busy ? 'Saving…' : 'Use photo'}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Load the source image, draw the cropped rectangle into a fixed-size
 * OUTPUT_PX canvas, export as JPEG. Always returns a square OUTPUT_PX
 * image regardless of source dimensions.
 */
async function renderCrop(srcUrl: string, area: Area): Promise<Blob> {
  const img = await loadImage(srcUrl);
  const canvas = document.createElement('canvas');
  canvas.width = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(
    img,
    area.x, area.y, area.width, area.height,
    0, 0, OUTPUT_PX, OUTPUT_PX,
  );
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      OUTPUT_QUALITY,
    );
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}
