import { useEffect, useId, useRef } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";

function SupervisorStudentQrScanner({ onScan, onScannerError }) {
  const scannerId = `supervisor-student-qr-scanner-${useId().replace(/:/g, "")}`;
  const onScanRef = useRef(onScan);
  const onScannerErrorRef = useRef(onScannerError);

  useEffect(() => {
    onScanRef.current = onScan;
    onScannerErrorRef.current = onScannerError;
  });

  useEffect(() => {
    let isMounted = true;
    let scanner = null;
    let scanSubmitted = false;

    if (!window.isSecureContext && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1") {
      onScannerErrorRef.current?.(
        "Camera access requires a secure connection (HTTPS or localhost). Please access the system via https:// or localhost.",
      );
      return undefined;
    }

    try {
      scanner = new Html5QrcodeScanner(
        scannerId,
        {
          fps: 10,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdge * 0.7);
            return {
              width: Math.max(180, Math.min(280, qrboxSize)),
              height: Math.max(180, Math.min(280, qrboxSize)),
            };
          },
          rememberLastUsedCamera: true,
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
        },
        false,
      );

      scanner.render(
        (decodedText) => {
          if (!isMounted || scanSubmitted) return;
          scanSubmitted = true;
          onScanRef.current?.(decodedText);
        },
        (error) => {
          // Continuous frame scan misses are normal; ignore
          if (typeof error === "string" && error.includes("NotAllowedError")) {
            onScannerErrorRef.current?.("Camera access was denied. Please allow camera permissions in your browser.");
          }
        },
      );
    } catch (initErr) {
      console.error("Unable to initialize QR camera scanner:", initErr);
      onScannerErrorRef.current?.(
        initErr.message || "Unable to start the camera scanner. Ensure camera permissions are granted.",
      );
    }

    return () => {
      isMounted = false;
      if (scanner) {
        try {
          void scanner.clear().catch((error) => {
            console.warn("Unable to cleanly stop camera scanner:", error);
          });
        } catch {
          // ignore
        }
      }
    };
  }, [scannerId]);

  return (
    <div
      className="supervisor-student-qr-reader"
      id={scannerId}
      aria-label="Student attendance QR camera scanner"
    />
  );
}

export default SupervisorStudentQrScanner;
