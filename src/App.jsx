import { useState, useRef, useCallback, useEffect } from 'react';
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
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      streamRef.current = stream;
      setUseCamera(true);
      setStatus('Starting camera preview...');
    } catch (err) {
      setStatus('Camera access denied');
      console.error('Camera error:', err);
    }
  };

  // Effect to handle video stream when camera mode changes
  useEffect(() => {
    if (useCamera && streamRef.current && videoRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(err => {
        console.error('Video play error:', err);
        setStatus('Error starting camera preview');
      });
      setStatus('Camera ready - Click "Capture" to take photo');
    }
  }, [useCamera]);

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
      
      // Draw the video frame to canvas
      ctx.drawImage(video, 0, 0);

      // Create preview from original color image
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setImage(blob);
        stopCamera();
        processReceipt(blob);
      }, 'image/jpeg', 0.95); // High quality JPEG
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

      // Try OCR multiple times with different configurations for better results
      let bestResult = null;
      let bestScore = 0;

      // First attempt with default settings
      setStatus('OCR attempt 1 - Standard settings...');
      const result1 = await Tesseract.recognize(
        imageFile,
        ocrLanguage,
        {
          logger: (m) => {
            if (m.status === 'recognizing text') {
              setStatus(`OCR attempt 1... ${Math.round(m.progress * 100)}%`);
              setProgress(Math.round(m.progress * 100));
            } else {
              setStatus(m.status);
            }
          },
        }
      );

      bestResult = result1;
      bestScore = result1.data.text.replace(/\s/g, '').length;

      // Second attempt with enhanced settings if first attempt has low confidence
      if (bestScore < 50) {
        setStatus('OCR attempt 2 - Enhanced settings...');
        const result2 = await Tesseract.recognize(
          imageFile,
          ocrLanguage,
          {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                setStatus(`OCR attempt 2... ${Math.round(m.progress * 100)}%`);
                setProgress(Math.round(m.progress * 100));
              } else {
                setStatus(m.status);
              }
            },
            tessjs_config_page_seg_mode: '4', // Assume a single column of text
            tessjs_config_tessedit_char_whitelist: '၀၁၃၄၅၇၈၉0123456789.,MMKkyatMyanmarကြောင်းလခစွန့်လုပ်ငန်းယဉ်ဆေးဘေငွေပြည်ရန်တန်ဖိုးခုနှစ်ဆယ်သောင်းထောင်ရာကြော်ငြာ',
          }
        );

        const score2 = result2.data.text.replace(/\s/g, '').length;
        if (score2 > bestScore) {
          bestResult = result2;
          bestScore = score2;
        }
      }

      // Third attempt with English + Myanmar if still low score
      if (bestScore < 50 && ocrLanguage !== 'eng+mya') {
        setStatus('OCR attempt 3 - Bilingual mode...');
        const result3 = await Tesseract.recognize(
          imageFile,
          'eng+mya',
          {
            logger: (m) => {
              if (m.status === 'recognizing text') {
                setStatus(`OCR attempt 3... ${Math.round(m.progress * 100)}%`);
                setProgress(Math.round(m.progress * 100));
              } else {
                setStatus(m.status);
              }
            },
            tessjs_config_page_seg_mode: '6',
          }
        );

        const score3 = result3.data.text.replace(/\s/g, '').length;
        if (score3 > bestScore) {
          bestResult = result3;
          bestScore = score3;
        }
      }

      setStatus('Analyzing receipt data...');
      const extractedText = bestResult.data.text;
      console.log('Extracted text:', extractedText); // Debug log

      // Show confidence level
      const avgConfidence = bestResult.data.confidence;
      console.log('OCR confidence:', avgConfidence);

      parseReceipt(extractedText);
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

    console.log('Parsing receipt with text:', text); // Debug log

    // Support multiple price formats for Myanmar receipts
    // Handles: "2,000", "2000", "20,000", "600", "70000", etc.
    const priceRegex = /(\d{1,3}(?:,\d{3})+|\d{3,})\s*(MMK|ကျပ်|kyat|Kyat)?$/gi;
    const totalRegex = /(total|amount|balance|due|subtotal|sum|စုစုပေါင်း|စုစု|တန်ဖိုး|စုစုပေါင်းတန်ဖိုး)\s*[\$]?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(MMK|မြန်မာကျပ်|kyat|Kyat)?/i;

    // First pass: Look for explicit total line
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
        }
      }
    });

    // Second pass: Extract all items
    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      // Skip header lines or total lines
      if (/^(total|amount|balance|due|subtotal|sum|စုစုပေါင်း)/i.test(trimmedLine)) {
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
            .replace(/[:|]\s*$/, '') // Remove trailing colons or pipes
            .trim();

          // Only accept if we have meaningful content
          if (cleanedName.length > 0 || price > 100) {
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

    // If no items found with price regex, try alternative parsing
    if (foundItems.length === 0) {
      console.log('Trying alternative parsing method...');
      // Look for lines with just numbers (price only lines)
      const priceOnlyRegex = /^\s*(\d{1,3}(?:,\d{3})+|\d{3,})\s*$/;
      let currentName = '';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check if this line is a price
        const priceMatch = line.match(priceOnlyRegex);
        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(/,/g, ''));
          if (price > 0 && price < 10000000) {
            foundItems.push({
              name: currentName || 'Item',
              price: price,
              isTotal: false
            });
            if (!hasExplicitTotal) {
              calculatedTotal += price;
            }
          }
          currentName = '';
        } else if (line.length > 2 && !/^(total|amount|balance)/i.test(line)) {
          // This might be an item name
          currentName = line;
        }
      }
    }

    // Add total item at the end if we found one
    if (hasExplicitTotal) {
      foundItems.push({ 
        name: 'TOTAL', 
        price: calculatedTotal, 
        isTotal: true 
      });
    }

    setItems(foundItems);
    setTotal(calculatedTotal);
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
                muted
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
