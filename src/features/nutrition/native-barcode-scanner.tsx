import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  CapacitorBarcodeScanner,
  CapacitorBarcodeScannerTypeHint,
} from "@capacitor/barcode-scanner";

// Native scanner (AVFoundation/Vision via the official plugin). It opens its
// own full-screen camera UI and resolves once with the decoded text, so there
// is no video element to manage and the camera permission is a normal iOS one.
export function NativeBarcodeScanner({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  // StrictMode runs effects twice in development; one scan session at a time.
  const running = useRef(false);
  const onScanRef = useRef(onScan);
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const scan = useCallback(async () => {
    if (running.current) return;
    running.current = true;
    setScanning(true);
    setMessage(null);
    try {
      const result = await CapacitorBarcodeScanner.scanBarcode({
        hint: CapacitorBarcodeScannerTypeHint.ALL,
        scanInstructions: "Halte den Barcode vor die Kamera",
        cancelButtonAccessibilityLabel: "Scanner schließen",
      });
      const code = result.ScanResult?.trim();
      if (code) onScanRef.current(code);
      else setMessage("Nichts erkannt.");
    } catch (err) {
      // Backing out of the camera UI also rejects; only a real failure
      // (permission denied, no camera) deserves a message.
      const text = (err as Error).message ?? "";
      if (!/cancel|dismiss|abort/i.test(text)) {
        setMessage("Kamera nicht verfügbar. Zugriff in den Einstellungen erlauben.");
      }
    } finally {
      running.current = false;
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">Barcode scannen</p>
        <button onClick={onClose} aria-label="Scanner schließen">
          <X className="h-4 w-4 text-neutral-500" />
        </button>
      </div>
      <button
        onClick={() => void scan()}
        disabled={scanning}
        className="w-full rounded-xl bg-neutral-800 py-3 text-sm font-medium text-neutral-200 disabled:opacity-50"
      >
        {scanning ? "Scanner läuft..." : "Erneut scannen"}
      </button>
      {message && (
        <p role="alert" className="text-center text-xs text-red-400">
          {message}
        </p>
      )}
    </div>
  );
}
