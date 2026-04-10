import { useState, useRef, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import './App.css';

function App() {
  const [image, setImage] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState('Ready - Scan a receipt to begin');
  const [progress, setProgress] = useState(0);
  const [useCamera, setUseCamera] = useState(false);
  const [ocrLanguage, setOcrLanguage] = useState('mya'); // Default to Myanmar
  
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const streamRef = useRef(null);

  // Start camera
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      streamRef.current = stream;
      setUseCamera(true);
      setStatus('Camera ready - Click "Capture" to take photo');
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setStatus('Camera access denied');
      console.error('Camera error:', err);
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setUseCamera(false);
  };

  // Capture from camera
  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);
      
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setImage(blob);
        stopCamera();
        processReceipt(blob);
      }, 'image/png');
    }
  };

  // Handle file upload
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      setImage(file);
      processReceipt(file);
    }
  };

  // Process receipt with OCR
  const processReceipt = async (imageFile) => {
    setIsProcessing(true);
    setStatus('Initializing OCR engine...');
    setProgress(0);
    setItems([]);
    setTotal(0);

    try {
      // Preprocess image for better OCR results
      setStatus('Preprocessing image for better recognition...');
      
      const result = await Tesseract.recognize(
        imageFile,
        ocrLanguage,
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setStatus(`Extracting text... ${Math.round(m.progress * 100)}%`);
              setProgress(Math.round(m.progress * 100));
            } else {
              setStatus(m.status);
            }
          },
          tessedit_char_whitelist: '၀၁၂၃၄၅၆၇၈၉0123456789,.MMKkyat Myanmar ကြောင်း လခ စွန့် လုပ် ငန်း ယဉ် ဆေး ဘေ ငွေ ပြည် ရန် တန် ဖိုး ခု နှစ် ဆယ် သောင်း ထောင် ရာ',
        }
      );

      setStatus('Analyzing receipt data...');
      const extractedText = result.data.text;
      console.log('Extracted text:', extractedText); // Debug log
      
      // Try multiple times with different settings if Myanmar text is not recognized
      if (extractedText.replace(/\s/g, '').length < 20) {
        setStatus('Retrying with enhanced settings...');
        const retryResult = await Tesseract.recognize(
          imageFile,
          'eng+mya',
          {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                setStatus(`Retrying OCR... ${Math.round(m.progress * 100)}%`);
                setProgress(Math.round(m.progress * 100));
              }
            }
          }
        );
        parseReceipt(retryResult.data.text);
      } else {
        parseReceipt(extractedText);
      }
    } catch (error) {
      setStatus('Error processing receipt');
      console.error('OCR Error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  // Change OCR language
  const handleLanguageChange = (lang) => {
    setOcrLanguage(lang);
  };

  // Parse receipt text to extract items and total
  const parseReceipt = (text) => {
    const lines = text.split('\n').filter(line => line.trim());
    const foundItems = [];
    let calculatedTotal = 0;
    let hasExplicitTotal = false;

    // Support multiple price formats for Myanmar receipts
    // Handles: "2,000", "2000", "20,000", "600", "70000", etc.
    const priceRegex = /(\d{1,3}(?:,\d{3})+|\d{3,})\s*$/gi;
    const totalRegex = /(total|amount|balance|due|subtotal|sum|စုစုပေါင်း|စုစု|တန်ဖိုး)\s*[\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(MMK|မြန်မာကျပ်|kyat|Kyat)?/i;

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // Check for explicit total
      const totalMatch = trimmedLine.match(totalRegex);
      if (totalMatch && !hasExplicitTotal) {
        const amount = parseFloat(totalMatch[2].replace(/,/g, ''));
        if (amount > 0) {
          calculatedTotal = amount;
          hasExplicitTotal = true;
          foundItems.push({ name: 'TOTAL', price: amount, isTotal: true });
        }
        return;
      }

      // Check for line items with prices at the end of line
      const matches = [...trimmedLine.matchAll(priceRegex)];
      if (matches.length > 0) {
        const lastMatch = matches[matches.length - 1];
        const priceStr = lastMatch[1].replace(/,/g, '');
        const price = parseFloat(priceStr);

        // Show all items regardless of price
        if (price > 0 && price < 10000000) {
          const itemText = trimmedLine.substring(0, lastMatch.index).trim();
          
          // Clean up item name - remove leading numbers, dots, dashes, and special chars
          let cleanedName = itemText
            .replace(/^\d+[\.\)]\s*/, '') // Remove "1. " or "1) "
            .replace(/^[-•]\s*/, '') // Remove "- " or "• "
            .replace(/[^\u1000-\u109F\s\-()]/g, '') // Remove non-Myanmar characters but keep spaces, dashes, parentheses
            .trim();
          
          if (cleanedName || price > 100) { // Accept items with no name if price is significant
            foundItems.push({
              name: cleanedName || 'Item',
              price: price,
              isTotal: false
            });

            // Sum items if no explicit total
            if (!hasExplicitTotal) {
              calculatedTotal += price;
            }
          }
        }
      }
    });

    setItems(foundItems);
    setTotal(hasExplicitTotal ? calculatedTotal : calculatedTotal);
    setStatus(`Done! Found ${foundItems.length} items`);
  };

  // Format currency in MMK
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('my-MM', {
      style: 'currency',
      currency: 'MMK',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="app">
      <div className="container">
        {/* Header */}
        <header className="header">
          <h1 className="title">AI Receipt Scanner</h1>
          <p className="subtitle">Scan, Extract & Calculate Automatically</p>
        </header>

        {/* Scanner Section */}
        <div className="scanner-section">
          {/* Language Selector */}
          <div className="language-selector">
            <label htmlFor="language-select">Language: </label>
            <select
              id="language-select"
              value={ocrLanguage}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="language-dropdown"
            >
              <option value="mya">မြန်မာ (Myanmar)</option>
              <option value="eng">English</option>
              <option value="eng+mya">English + Myanmar</option>
            </select>
          </div>

          <div className="button-group">
            {!useCamera ? (
              <>
                <button
                  className="btn btn-primary"
                  onClick={startCamera}
                  disabled={isProcessing}
                >
                  <span className="btn-icon">📷</span>
                  Scan from Camera
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                >
                  <span className="btn-icon">📁</span>
                  Upload Receipt
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                />
              </>
            ) : (
              <>
                <button
                  className="btn btn-success"
                  onClick={captureImage}
                >
                  <span className="btn-icon">📸</span>
                  Capture
                </button>
                <button
                  className="btn btn-cancel"
                  onClick={stopCamera}
                >
                  <span className="btn-icon">✕</span>
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Camera Preview */}
        {useCamera && (
          <div className="camera-section">
            <div className="camera-container">
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="camera-preview"
              />
              <canvas ref={canvasRef} style={{ display: 'none' }} />
            </div>
          </div>
        )}

        {/* Receipt Preview */}
        {previewUrl && !useCamera && (
          <div className="preview-section">
            <h3 className="section-title">Receipt Preview</h3>
            <div className="image-preview">
              <img src={previewUrl} alt="Receipt preview" />
            </div>
          </div>
        )}

        {/* Processing Progress */}
        {isProcessing && (
          <div className="progress-section">
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="status-text">{status}</p>
          </div>
        )}

        {/* Results Section */}
        {(items.length > 0 || isProcessing) && (
          <div className="results-section">
            <h3 className="section-title">Calculation Results</h3>
            
            {/* Items List */}
            <div className="items-container">
              <div className="items-list">
                <div className="items-header">
                  <span>Items Found</span>
                  <span>Price</span>
                </div>
                {items.map((item, index) => (
                  <div 
                    key={index} 
                    className={`item-row ${item.isTotal ? 'total-row' : ''}`}
                  >
                    <span className="item-name">{item.name}</span>
                    <span className="item-price">
                      {formatCurrency(item.price)}
                    </span>
                  </div>
                ))}
                {items.length === 0 && isProcessing && (
                  <div className="loading-items">
                    <div className="loading-dots">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <p>Extracting items...</p>
                  </div>
                )}
              </div>
            </div>

            {/* Total Display */}
            <div className="total-container">
              <span className="total-label">Total Amount:</span>
              <span className="total-amount">
                {formatCurrency(total)}
              </span>
            </div>
          </div>
        )}

        {/* Status Message */}
        {!isProcessing && items.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">🧾</div>
            <p className="empty-text">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
