# QR Scanner Chrome Extension (React + Vite + MV3)

Features:
- Scan QR via camera (popup)
- Scan QR from image files (popup)
- Scan QR from images on the active tab (content script)

## Setup

```bash
npm install
```

## Develop

```bash
npm run dev
```
This builds to `dist` continuously. Load unpacked in Chrome:
- Open chrome://extensions
- Enable Developer mode
- Load Unpacked -> select `dist`

## Build

```bash
npm run build
```

## Zip for store

```bash
npm run zip
```

## Permissions
- activeTab, scripting, tabs

## How to use
- Click the extension icon to open the popup
- Start Camera to scan live
- Choose Image to decode from a file
- Scan Active Tab to decode all images/background images in the current page

## Tech
- React 18, Vite 5, Manifest V3
- ZXing (`@zxing/browser`)