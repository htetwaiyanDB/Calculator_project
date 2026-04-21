# SmartCalc

SmartCalc is a React + Vite OCR receipt scanner that extracts text from receipt images and calculates item totals automatically.

## Features

- Scan receipts with device camera
- Upload receipt images from local files
- OCR text extraction with `tesseract.js`
- Automatic line-item and total detection
- Real-time processing progress UI

## Tech Stack

- React
- Vite
- Tesseract.js

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Install

```bash
npm install
```

### Run in Development

```bash
npm run dev
```

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```text
src/
  App.jsx      # Main UI and OCR workflow
  App.css      # Styles
  main.jsx     # App entry point
index.html     # HTML template
```

## Usage

1. Open SmartCalc in your browser.
2. Capture a receipt photo with camera or upload an image.
3. Wait for OCR to finish.
4. Review extracted items and total amount.

## Notes

- OCR accuracy depends on image clarity and lighting.
- Clean, high-contrast receipt images usually produce better results.
