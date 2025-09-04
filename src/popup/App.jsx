import React, { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader, BrowserQRCodeReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

const readerHints = new Map();
readerHints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
readerHints.set(DecodeHintType.TRY_HARDER, false); // Reduce processing intensity

const MAX_CANVAS_SIDE = 1400; // cap to avoid huge readbacks

let videoReader = null;
let qrReader = null;

export default function App() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [cameraRunning, setCameraRunning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [decodedText, setDecodedText] = useState("");
  const [pageResults, setPageResults] = useState([]);
  const [isScanningPage, setIsScanningPage] = useState(false);

  useEffect(() => {
    return () => {
      // Cleanup on unmount
      if (cameraRunning) {
        stopCamera();
      }
    };
  }, [cameraRunning]);

  const startCamera = async () => {
    setCameraError("");
    setDecodedText("");
    try {
      setCameraRunning(true);

      // Initialize ZXing readers
      videoReader = new BrowserMultiFormatReader();
      qrReader = new BrowserQRCodeReader(readerHints);

      // Get the video stream and store it for later cleanup
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;

      // Set the stream to the video element
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      // Start ZXing decoding with silent error handling
      await videoReader.decodeFromVideoDevice(
        null,
        videoRef.current,
        (result, err) => {
          if (result) {
            console.log("[camera] decoded", result.getText());
            setDecodedText(result.getText());
          }
          // Silently ignore expected "no QR code found" errors
          // Only log unexpected errors
          if (
            err &&
            err.name !== "NotFoundException" &&
            !err.message?.includes(
              "No MultiFormat Readers were able to detect the code"
            )
          ) {
            console.warn("[camera] decode error", err);
          }
        }
      );
    } catch (e) {
      console.error("[camera] start error", e);
      setCameraError(String(e?.message || e));
      setCameraRunning(false);
      // Clean up stream if it was created
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      // Clean up readers
      videoReader = null;
      qrReader = null;
    }
  };

  const stopCamera = () => {
    try {
      // Stop ZXing reader if it exists
      if (videoReader && typeof videoReader.reset === "function") {
        videoReader.reset();
      } else if (
        videoReader &&
        typeof videoReader.stopAsyncDecode === "function"
      ) {
        videoReader.stopAsyncDecode();
      }

      // Stop the stored stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          console.log("[camera] stopping track:", track.kind, track.label);
          track.stop();
        });
        streamRef.current = null;
      }

      // Clear video element
      if (videoRef.current) {
        videoRef.current.srcObject = null;
        videoRef.current.pause();
      }

      // Clean up readers
      videoReader = null;
      qrReader = null;

      console.log("[camera] camera stopped successfully");
    } catch (e) {
      console.warn("[camera] stop error", e);
      // Force cleanup even if there's an error
      videoReader = null;
      qrReader = null;
    }
    setCameraRunning(false);
  };

  async function decodeWithBarcodeDetectorFromBlobUrl(blobUrl) {
    console.log("[file] try BarcodeDetector");
    if (!("BarcodeDetector" in window)) {
      console.log("[file] BarcodeDetector not available");
      return null;
    }
    try {
      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const img = await createImageFromUrl(blobUrl);
      if (!img) {
        console.log("[file] image load failed for BarcodeDetector");
        return null;
      }
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const bitmap = await createImageBitmap(canvas);
      const barcodes = await detector.detect(bitmap);
      console.log("[file] BarcodeDetector detected", barcodes);
      if (barcodes && barcodes.length > 0) return barcodes[0].rawValue || null;
      return null;
    } catch (e) {
      console.warn("[file] BarcodeDetector error", e);
      return null;
    }
  }

  function createImageFromUrl(url) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = (e) => {
        console.warn("[file] image onerror", e);
        resolve(null);
      };
      img.src = url;
    });
  }

  function drawScaled(img, scale) {
    const rawW = (img.naturalWidth || img.width) * scale;
    const rawH = (img.naturalHeight || img.height) * scale;
    const factor = Math.min(1, MAX_CANVAS_SIDE / Math.max(rawW, rawH));
    const w = Math.max(1, Math.floor(rawW * factor));
    const h = Math.max(1, Math.floor(rawH * factor));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  function preprocessVariants(canvas) {
    const variants = [];
    variants.push({ canvas, note: "orig" });

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;

    const grayData = new Uint8ClampedArray(data);
    for (let i = 0; i < grayData.length; i += 4) {
      const r = grayData[i],
        g = grayData[i + 1],
        b = grayData[i + 2];
      let y = 0.299 * r + 0.587 * g + 0.114 * b;
      y = (y - 128) * 1.2 + 128;
      const v = Math.max(0, Math.min(255, y));
      grayData[i] = grayData[i + 1] = grayData[i + 2] = v;
    }
    const grayCanvas = document.createElement("canvas");
    grayCanvas.width = canvas.width;
    grayCanvas.height = canvas.height;
    const gctx = grayCanvas.getContext("2d", { willReadFrequently: true });
    const gimg = new ImageData(grayData, canvas.width, canvas.height);
    gctx.putImageData(gimg, 0, 0);
    variants.push({ canvas: grayCanvas, note: "gray" });

    const thresholds = [90, 110, 128, 140, 160, 180, 200];
    for (const t of thresholds) {
      const c = document.createElement("canvas");
      c.width = canvas.width;
      c.height = canvas.height;
      const cctx = c.getContext("2d", { willReadFrequently: true });
      const id = cctx.createImageData(canvas.width, canvas.height);
      const dd = id.data;
      for (let i = 0; i < grayData.length; i += 4) {
        const vv = grayData[i] >= t ? 255 : 0;
        dd[i] = dd[i + 1] = dd[i + 2] = vv;
        dd[i + 3] = 255;
      }
      cctx.putImageData(id, 0, 0);
      variants.push({ canvas: c, note: `bin${t}` });

      const ci = document.createElement("canvas");
      ci.width = canvas.width;
      ci.height = canvas.height;
      const ic = ci.getContext("2d", { willReadFrequently: true });
      const iid = ic.createImageData(canvas.width, canvas.height);
      const iiddata = iid.data;
      for (let i = 0; i < grayData.length; i += 4) {
        const vv2 = grayData[i] >= t ? 0 : 255;
        iiddata[i] = iiddata[i + 1] = iiddata[i + 2] = vv2;
        iiddata[i + 3] = 255;
      }
      ic.putImageData(iid, 0, 0);
      variants.push({ canvas: ci, note: `bin${t}-inv` });
    }

    return variants;
  }

  function rotatedCanvases(canvas) {
    const rotations = [0, 90, 180, 270];
    const result = [];
    for (const deg of rotations) {
      if (deg === 0) {
        result.push({ canvas, deg });
        continue;
      }
      const rad = (deg * Math.PI) / 180;
      const w = canvas.width,
        h = canvas.height;
      const rc = document.createElement("canvas");
      if (deg % 180 === 0) {
        rc.width = w;
        rc.height = h;
      } else {
        rc.width = h;
        rc.height = w;
      }
      const rctx = rc.getContext("2d", { willReadFrequently: true });
      rctx.translate(rc.width / 2, rc.height / 2);
      rctx.rotate(rad);
      rctx.drawImage(canvas, -w / 2, -h / 2);
      result.push({ canvas: rc, deg });
    }
    return result;
  }

  async function decodeWithZXingFromBlobUrl(blobUrl) {
    try {
      // Initialize qrReader if not already done
      if (!qrReader) {
        qrReader = new BrowserQRCodeReader(readerHints);
      }

      const img = await createImageFromUrl(blobUrl);
      if (!img) {
        console.log("[file] ZXing: image failed to load");
        return null;
      }
      const scales = [1.5, 1, 2, 0.75]; // reduced to avoid heavy loops
      for (const s of scales) {
        const base = drawScaled(img, s);
        const variants = preprocessVariants(base);
        for (const v of variants) {
          const rots = rotatedCanvases(v.canvas);
          for (const r of rots) {
            // Try ZXing
            try {
              const result = await qrReader.decodeFromCanvas(r.canvas);
              const text = result?.getText?.() || null;
              console.log("[file] ZXing decoded", {
                scale: s,
                variant: v.note,
                rot: r.deg,
                text,
              });
              if (text) return text;
            } catch {}
          }
        }
        console.log(
          "[file] ZXing tried variants at scale",
          s,
          "none succeeded"
        );
      }
      // Direct fallbacks
      try {
        const direct = await qrReader.decodeFromImageElement(img);
        const text = direct?.getText?.() || null;
        console.log("[file] ZXing imageElement direct", text);
        if (text) return text;
      } catch {}
      try {
        const directUrl = await qrReader.decodeFromImageUrl(blobUrl);
        const text2 = directUrl?.getText?.() || null;
        console.log("[file] ZXing imageUrl direct", text2);
        if (text2) return text2;
      } catch {}
      return null;
    } catch (e) {
      console.warn("[file] ZXing decode error", e);
      return null;
    }
  }

  const onPickFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    console.log("[file] selected", {
      name: file.name,
      type: file.type,
      size: file.size,
    });
    setDecodedText("");
    const blobUrl = URL.createObjectURL(file);
    try {
      let text = await decodeWithBarcodeDetectorFromBlobUrl(blobUrl);
      if (!text) {
        console.log("[file] fallback to ZXing");
        text = await decodeWithZXingFromBlobUrl(blobUrl);
      }
      console.log("[file] final text", text);
      setDecodedText(text || "No QR code found in the selected image.");
    } catch (e) {
      console.error("[file] fatal decode error", e);
      setDecodedText("Failed to decode the selected image.");
    } finally {
      URL.revokeObjectURL(blobUrl);
      event.target.value = "";
    }
  };

  /*const testContentScript = async () => {
    console.log("[popup] testing content script injection");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "TEST_CONTENT_SCRIPT",
      });
      console.log("[popup] test response", response);
      alert(
        "Content script test: " + (response?.success ? "SUCCESS" : "FAILED")
      );
    } catch (e) {
      console.error("[popup] test failed", e);
      alert("Content script test FAILED: " + e.message);
    }
  };
*/
  const scanActiveTab = async () => {
    console.log("[popup] starting scan active tab");
    setIsScanningPage(true);
    setPageResults([]);
    try {
      console.log("[popup] sending SCAN_PAGE_IMAGES message");
      const response = await chrome.runtime.sendMessage({
        type: "SCAN_PAGE_IMAGES",
      });
      console.log("[popup] received response", response);
      const results = response?.results || [];
      console.log("[popup] results count", results.length);
      setPageResults(results);
    } catch (e) {
      console.error("[popup] scan failed", e);
      setPageResults([
        {
          text: "Failed to scan the active tab: " + e.message,
          source: "error",
        },
      ]);
    } finally {
      setIsScanningPage(false);
    }
  };

  const saveQRImage = async (imageData, width, height, source) => {
    try {
      // Create canvas from image data
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      const imgData = new ImageData(
        new Uint8ClampedArray(imageData),
        width,
        height
      );
      ctx.putImageData(imgData, 0, 0);

      // Convert to blob and download
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `qr-detected-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, "image/png");

      console.log("[popup] QR image saved");
    } catch (e) {
      console.error("[popup] failed to save QR image:", e);
    }
  };

  return (
    <div className="container">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="pill">QR Scanner</div>
        <div className="row">
          {/*<button
            className="secondary"
            onClick={testContentScript}
            style={{ fontSize: "10px" }}
          >
            Test Injection
          </button>
          */}
          <button
            className="secondary"
            onClick={scanActiveTab}
            disabled={isScanningPage}
          >
            {isScanningPage ? "Scanning…" : "Scan Active Tab"}
          </button>
        </div>
      </div>

      <div className="video-wrap">
        <video ref={videoRef} muted playsInline />
      </div>
      <div className="row">
        {!cameraRunning ? (
          <button onClick={startCamera}>Start Camera</button>
        ) : (
          <button className="secondary" onClick={stopCamera}>
            Stop Camera
          </button>
        )}
        <label className="file">
          Choose Image
          <input type="file" accept="image/*" onChange={onPickFile} />
        </label>
      </div>

      {cameraError && (
        <div className="result-item" style={{ color: "#b91c1c" }}>
          {cameraError}
        </div>
      )}
      {decodedText && (
        <div className="results">
          <div className="pill">Camera/File Result</div>
          <div className="result-item">{decodedText}</div>
        </div>
      )}

      <div className="results">
        <div className="pill">Active Tab Results</div>
        {pageResults.length === 0 ? (
          <div className="result-item">No results yet.</div>
        ) : (
          pageResults.map((r, idx) => (
            <div key={idx} className="result-item">
              <div>{r.text}</div>
              {r.imageData && r.width && r.height && (
                <button
                  className="secondary"
                  style={{ fontSize: "10px", marginTop: "5px" }}
                  onClick={() =>
                    saveQRImage(r.imageData, r.width, r.height, r.source)
                  }
                >
                  Save QR Image
                </button>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
