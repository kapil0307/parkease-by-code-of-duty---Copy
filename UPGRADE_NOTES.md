# ParkEase v2.0 — Upgrade Notes

## OCR Change: Tesseract.js → OCR.space API

The gate entry system now uses **OCR.space** (cloud-based) instead of the browser-based Tesseract.js.

### Why OCR.space?
- No local engine to download (Tesseract needed ~100MB language data)
- Faster first scan — no warm-up time
- Cloud OCR Engine 2 is optimized for license plates
- Works even on low-powered devices

### API Key
- Key: `K89634200288957`
- Endpoint: `https://api.ocr.space/parse/image`
- Configured directly in `gate.html` (no backend change needed)

### How it works
1. User enters IP Webcam URL (e.g. `http://192.168.1.5:8080/shot.jpg`)
2. Browser fetches image, shows preview
3. Image is base64-encoded and sent to OCR.space API
4. Detected plate text is returned, cleaned, and shown for confirmation
5. User clicks Verify → backend checks booking

### Running the project
```
npm install
npm start
```
Open `gate.html` in your browser. Backend runs on `http://localhost:5000`.
