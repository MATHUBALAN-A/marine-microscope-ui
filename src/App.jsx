import React, { useState, useEffect, useRef } from 'react';
import {
  Activity, Camera, Clock,
  LayoutDashboard, Menu, Play, Plus, ExternalLink,
  Download, RefreshCw, Eye, UploadCloud, Image as ImageIcon,
  Thermometer
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './App.css';

// Edge Device (Raspberry Pi 5) - Strictly used for Stream and Processing Trigger
const PI_IP = '10.139.235.135'; 
const PI_STREAM_URL = `http://${PI_IP}:5000/api/stream`;
const PI_TRIGGER_URL = `http://${PI_IP}:5000/api/trigger`;
const PI_CAPTURE_URL = `http://${PI_IP}:5000/api/capture`;

// Cloud Attributes (Proxied through Vite to prevent CORS blocks)
const CLOUD_ATTRIBUTES_URL = `/tb-api/attributes?clientKeys=latestAnalysis,analysisHistory,camera_connected,pi_temperature`;

// Helper function to fetch remote Dropbox image and convert it into Base64 for jsPDF
const getBase64FromUrl = async (url) => {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Could not convert image to base64:", err);
    return null;
  }
};

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [analysisMode, setAnalysisMode] = useState('camera'); // 'camera' | 'upload'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [connectionState, setConnectionState] = useState({
    status: 'connected',
    cameraConnected: true,
    temperature: null
  });

  const [capturedImage, setCapturedImage] = useState(null);
  const [uploadedImage, setUploadedImage] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const fileInputRef = useRef(null);
  const [historyList, setHistoryList] = useState([]);

  const [latestResult, setLatestResult] = useState({
    sampleId: 'Loading from Cloud...',
    timestamp: '-',
    totalOrganisms: 0,
    speciesRichness: 0,
    avgConfidence: 0,
    shannonIndex: 0,
    phytoCount: 0,
    zooCount: 0,
    processingTime: '-',
    species: [],
    rawImageUrl: '',
    annotatedImageUrl: ''
  });

  // --------------------------------------------------------------------------
  // 1. Fetch ALL Data & History Purely from ThingsBoard Cloud
  // --------------------------------------------------------------------------
  const fetchThingsBoardCloudData = async () => {
    try {
      const res = await fetch(CLOUD_ATTRIBUTES_URL);
      if (res.ok) {
        const data = await res.json();
        const clientAttrs = data.client || {};

        if (clientAttrs.pi_temperature !== undefined) {
          setConnectionState({
            status: 'connected',
            cameraConnected: clientAttrs.camera_connected ?? true,
            temperature: typeof clientAttrs.pi_temperature === 'number' ? clientAttrs.pi_temperature : null
          });
        }

        if (clientAttrs.latestAnalysis) {
          const parsed = typeof clientAttrs.latestAnalysis === 'string'
            ? JSON.parse(clientAttrs.latestAnalysis)
            : clientAttrs.latestAnalysis;

          setLatestResult(parsed);
        }

        // Pull the permanent historical audit trail stored in the Cloud
        if (clientAttrs.analysisHistory) {
          const parsedHistory = typeof clientAttrs.analysisHistory === 'string'
            ? JSON.parse(clientAttrs.analysisHistory)
            : clientAttrs.analysisHistory;

          if (Array.isArray(parsedHistory)) {
            setHistoryList(parsedHistory);
          }
        }
      }
    } catch (e) {
      console.warn("ThingsBoard telemetry polling notice:", e);
    }
  };

  useEffect(() => {
    fetchThingsBoardCloudData();
    const interval = setInterval(fetchThingsBoardCloudData, 3000);
    return () => clearInterval(interval);
  }, []);

  // --------------------------------------------------------------------------
  // 2. Capture Frame Snapshot (Direct from Pi)
  // --------------------------------------------------------------------------
  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const res = await fetch(PI_CAPTURE_URL, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCapturedImage(data.image);
      }
    } catch {
      alert("Failed to capture slide frame from Raspberry Pi.");
    } finally {
      setIsCapturing(false);
    }
  };

  // --------------------------------------------------------------------------
  // 3. File Drag & Drop / Upload Handlers
  // --------------------------------------------------------------------------
  const handleFileSelect = (file) => {
    if (!file || !file.type.startsWith('image/')) {
      alert('Please select a valid micrograph image (.jpg, .png, .webp)');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => setUploadedImage(e.target.result);
    reader.readAsDataURL(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // --------------------------------------------------------------------------
  // 4. Trigger Analysis on Pi (Zero Local Storage -> Cloud Dispatched)
  // --------------------------------------------------------------------------
  const handleAnalyze = async () => {
    if (analysisMode === 'camera' && !capturedImage) {
      alert("Please capture a slide frame first.");
      return;
    }
    if (analysisMode === 'upload' && !uploadedImage) {
      alert("Please upload or drop a micrograph image first.");
      return;
    }

    setIsAnalyzing(true);
    try {
      let options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };

      if (analysisMode === 'upload' && uploadedImage) {
        options.body = JSON.stringify({ image: uploadedImage });
      } else if (analysisMode === 'camera' && capturedImage) {
        options.body = JSON.stringify({ image: capturedImage });
      }

      const res = await fetch(PI_TRIGGER_URL, options);
      if (res.ok) {
        // Wait 3.5s for Dropbox upload & ThingsBoard ingestion to settle
        setTimeout(async () => {
          await fetchThingsBoardCloudData();
          setIsAnalyzing(false);
          setCurrentView('result');
        }, 3500);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.message || "Analysis failed on edge server.");
        setIsAnalyzing(false);
      }
    } catch (err) {
      console.error(err);
      alert("Cannot reach Raspberry Pi. Check local network connectivity.");
      setIsAnalyzing(false);
    }
  };

  // --------------------------------------------------------------------------
  // 5. Automated PDF Report Generation (Embedded Micrograph Image + Auto-Page)
  // --------------------------------------------------------------------------
  const handleExportReport = async () => {
    const doc = new jsPDF();

    // Top Header Banner
    doc.setFillColor(15, 76, 129);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MARINEAI LAB - ECOLOGICAL AUDIT REPORT', 14, 16);

    // Metadata
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Sample ID: ${latestResult.sampleId}`, 14, 34);
    doc.setFont('helvetica', 'normal');
    doc.text(`Timestamp: ${latestResult.timestamp || new Date().toLocaleString()}`, 14, 40);

    // Key Metrics Table
    autoTable(doc, {
      startY: 46,
      head: [['Metric', 'Value', 'Ecological Status']],
      body: [
        ['Total Detected Organisms', `${latestResult.totalOrganisms}`, 'Verified'],
        ['Species Richness', `${latestResult.speciesRichness}`, `${latestResult.speciesRichness > 3 ? 'High Diversity' : 'Low Richness'}`],
        ['Shannon Biodiversity Index (H\')', `${latestResult.shannonIndex}`, `${latestResult.shannonIndex >= 1.5 ? 'Balanced Ecosystem' : 'Stressed Environment'}`],
        ['Average Confidence', `${latestResult.avgConfidence}%`, 'Optimal Detection'],
        ['Inference & Slicing Time', `${latestResult.processingTime}`, 'Edge OpenVINO Accelerated']
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 76, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9 }
    });

    // Taxonomic Breakdown Table
    const tableData = (latestResult.species || []).map(sp => [
      sp.domain || 'Microorganism',
      sp.name,
      sp.count,
      `${sp.confidence}%`
    ]);

    const finalY = doc.lastAutoTable.finalY || 100;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Taxonomic Breakdown', 14, finalY + 8);

    autoTable(doc, {
      startY: finalY + 12,
      head: [['Domain', 'Species / Taxon Name', 'Count', 'Confidence']],
      body: tableData.length > 0 ? tableData : [['-', 'No organisms detected in slide frame', '0', '-']],
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      styles: { fontSize: 9 }
    });

    let currentY = doc.lastAutoTable.finalY + 8;

    // Embed Actual Micrograph Image into the PDF
    const imgUrl = latestResult.annotatedImageUrl || latestResult.rawImageUrl;
    if (imgUrl) {
      if (currentY > 190) {
        doc.addPage();
        currentY = 20;
      }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 76, 129);
      doc.text('Annotated Micrograph (Detection Layer)', 14, currentY);

      try {
        const base64Img = await getBase64FromUrl(imgUrl);
        if (base64Img) {
          doc.addImage(base64Img, 'JPEG', 14, currentY + 4, 130, 73.1);
          currentY += 82;
        }
      } catch (err) {
        console.error("Failed to render image in PDF:", err);
      }
    }

    // Direct Cloud Hyperlink fallback
    if (latestResult.annotatedImageUrl) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 76, 129);
      doc.textWithLink(
        '--> Open Full-Resolution Image on Dropbox',
        14,
        currentY + 4,
        { url: latestResult.annotatedImageUrl }
      );
    }

    // Footer note
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Generated automatically by MarineAI Edge Computing System (ThingsBoard & Dropbox Synced)', 14, 285);

    doc.save(`MarineAI_Report_${latestResult.sampleId.replace(/\s+/g, '_')}.pdf`);
  };

  const canRunAnalysis = analysisMode === 'camera' ? !!capturedImage : !!uploadedImage;

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="app-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button style={{ border: 'none', background: 'none', cursor: 'pointer' }} onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <Menu size={20} color="#64748b" />
          </button>
          <div className="logo-group" onClick={() => setCurrentView('dashboard')}>
            <Activity size={22} color="#0f4c81" />
            <span style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '0.5px' }}>MARINEAI LAB</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {connectionState.temperature !== null && (
            <span className={`temp-badge ${
              connectionState.temperature > 75 ? 'hot' : (connectionState.temperature > 60 ? 'warm' : 'normal')
            }`}>
              <Thermometer size={14} />
              <span>{connectionState.temperature}°C</span>
            </span>
          )}

          <span className="status-badge connected">
            <span className="status-dot"></span>
            Cloud Synced (ThingsBoard)
          </span>
        </div>
      </header>

      {/* NAVIGATION DRAWER */}
      {isSidebarOpen && (
        <aside className="nav-drawer">
          <div>
            <div className={`nav-item ${currentView === 'dashboard' ? 'active' : ''}`} onClick={() => { setCurrentView('dashboard'); setIsSidebarOpen(false); }}>
              <LayoutDashboard size={18} /> Dashboard
            </div>
            <div className={`nav-item ${currentView === 'analysis' ? 'active' : ''}`} onClick={() => { setCurrentView('analysis'); setIsSidebarOpen(false); }}>
              <Camera size={18} /> New analysis
            </div>
            <div className={`nav-item ${currentView === 'history' ? 'active' : ''}`} onClick={() => { setCurrentView('history'); setIsSidebarOpen(false); }}>
              <Clock size={18} /> History
            </div>
          </div>
        </aside>
      )}

      {/* MAIN VIEWPORT */}
      <main className="main-content">

        {/* 1. DASHBOARD OVERVIEW */}
        {currentView === 'dashboard' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Cloud Workspace (ThingsBoard)</div>
                <h1 className="page-title">Ecological & Specimen Overview</h1>
              </div>
              <button className="btn-primary" onClick={() => setCurrentView('analysis')}>
                <Plus size={16} /> Start new analysis
              </button>
            </div>

            <div className="grid-cards">
              <div className="card">
                <div className="card-value">{latestResult.totalOrganisms}</div>
                <div className="card-title">Total Detected Organisms</div>
              </div>
              <div className="card">
                <div className="card-value">{latestResult.speciesRichness}</div>
                <div className="card-title">Species Richness</div>
              </div>
              <div className="card">
                <div className="card-value">{latestResult.avgConfidence}%</div>
                <div className="card-title">Average Confidence</div>
              </div>
              <div className="card" style={{ borderLeft: '4px solid #0f4c81' }}>
                <div className="card-value" style={{ color: '#0f4c81' }}>{latestResult.shannonIndex}</div>
                <div className="card-title">Shannon Diversity Index (H')</div>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <div>
                <div className="eyebrow">Latest Sample from ThingsBoard</div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>{latestResult.sampleId}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {latestResult.totalOrganisms > 0 
                    ? `${latestResult.totalOrganisms} organisms (${latestResult.zooCount || 0} Zoo, ${latestResult.phytoCount || 0} Phyto) across ${latestResult.speciesRichness} taxa.`
                    : "No active slide analyzed yet."}
                </div>
              </div>
              {latestResult.totalOrganisms > 0 && (
                <button className="btn-secondary" onClick={() => setCurrentView('result')}>
                  <Eye size={14} /> View Results
                </button>
              )}
            </div>
          </div>
        )}

        {/* 2. CAPTURE & INGESTION */}
        {currentView === 'analysis' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Edge Acquisition & Cloud Slicing</div>
                <h1 className="page-title">Specimen Ingestion & Analysis</h1>
              </div>

              <div className="tab-pill-group">
                <button 
                  className={`tab-pill ${analysisMode === 'camera' ? 'active' : ''}`}
                  onClick={() => setAnalysisMode('camera')}
                >
                  <Camera size={15} /> Live HQ Camera (Pi)
                </button>
                <button 
                  className={`tab-pill ${analysisMode === 'upload' ? 'active' : ''}`}
                  onClick={() => setAnalysisMode('upload')}
                >
                  <UploadCloud size={15} /> Upload Micrograph File
                </button>
              </div>
            </div>

            <div className="capture-layout">
              {/* Left Column: Visual Viewport */}
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>
                    {analysisMode === 'camera' ? 'Optical Field View (Pi Stream)' : 'Local Micrograph File'}
                  </span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: '#0f4c81' }}>
                    • {analysisMode === 'camera' ? (capturedImage ? 'Frame Captured (Ready)' : 'Live IMX477 Optical Feed') : (uploadedImage ? 'File Staged (Ready)' : 'Awaiting File')}
                  </span>
                </div>
                
                {analysisMode === 'camera' ? (
                  <div className="preview-box">
                    {capturedImage ? (
                      <div className="uploaded-preview-wrapper" style={{ width: '100%', height: '100%' }}>
                        <img src={capturedImage} alt="Captured Slide" className="preview-overlay-image" />
                        <button 
                          className="dropzone-reset-btn"
                          onClick={() => setCapturedImage(null)}
                        >
                          <RefreshCw size={14} /> Recapture Live Feed
                        </button>
                      </div>
                    ) : (
                      <img src={PI_STREAM_URL} alt="Live Camera Feed" className="preview-overlay-image" />
                    )}
                  </div>
                ) : (
                  <div 
                    className={`upload-dropzone ${isDragging ? 'dragging' : ''} ${uploadedImage ? 'has-file' : ''}`}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => !uploadedImage && fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      style={{ display: 'none' }} 
                      accept="image/*"
                      onChange={(e) => e.target.files && handleFileSelect(e.target.files[0])}
                    />

                    {uploadedImage ? (
                      <div className="uploaded-preview-wrapper">
                        <img src={uploadedImage} alt="Uploaded Plankton Slide" className="preview-overlay-image" />
                        <button 
                          className="dropzone-reset-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            setUploadedImage(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                          }}
                        >
                          <RefreshCw size={14} /> Replace File
                        </button>
                      </div>
                    ) : (
                      <div className="dropzone-content">
                        <UploadCloud size={48} color="#0f4c81" style={{ marginBottom: '12px', opacity: 0.8 }} />
                        <h4 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>
                          Drag and drop plankton image here
                        </h4>
                        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '14px' }}>
                          Supports high-resolution JPG, PNG, WEBP micrographs
                        </p>
                        <button 
                          type="button" 
                          className="btn-secondary" 
                          style={{ pointerEvents: 'none' }}
                        >
                          <ImageIcon size={15} /> Browse Local Storage
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
                  <span>
                    {analysisMode === 'camera' 
                      ? "Sensor: Arducam IMX477 HQ (1080p @ 25 FPS)"
                      : "Source: High-Resolution File Ingestion"}
                  </span>
                  <span>Magnification: 100× Industrial Objective</span>
                </div>
              </div>

              {/* Right Column: Workflow Controls */}
              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                    {analysisMode === 'camera' ? "Slide Acquisition Workflow" : "File Ingestion Workflow"}
                  </h3>
                  
                  {analysisMode === 'camera' ? (
                    <ul className="checklist">
                      <li><span className="step-num">1</span> Mount water specimen slide & focus lighting.</li>
                      <li><span className="step-num">2</span> Click <b>Capture Slide Frame</b> to freeze.</li>
                      <li><span className="step-num">3</span> <b>Run Analysis</b> button unlocks once captured.</li>
                      <li><span className="step-num">4</span> All data & images synced directly to Cloud.</li>
                    </ul>
                  ) : (
                    <ul className="checklist">
                      <li><span className="step-num">1</span> Drag & drop or browse for a micrograph file.</li>
                      <li><span className="step-num">2</span> Inspect file preview thumbnail.</li>
                      <li><span className="step-num">3</span> <b>Run Analysis</b> button unlocks once staged.</li>
                      <li><span className="step-num">4</span> Results archived purely in Cloud (ThingsBoard & Dropbox).</li>
                    </ul>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {analysisMode === 'camera' ? (
                    <>
                      <button 
                        className="btn-primary" 
                        style={{ justifyContent: 'center' }} 
                        onClick={handleCapture} 
                        disabled={isCapturing}
                      >
                        <Camera size={16} /> {isCapturing ? "Capturing..." : (capturedImage ? "Recapture Slide Frame" : "Capture Slide Frame")}
                      </button>
                      
                      <button 
                        className={canRunAnalysis ? "btn-primary" : "btn-secondary"} 
                        style={{ 
                          display: 'flex', 
                          justifyContent: 'center', 
                          gap: '8px', 
                          background: canRunAnalysis ? '#0f4c81' : '#f1f5f9', 
                          color: canRunAnalysis ? '#fff' : '#94a3b8',
                          cursor: canRunAnalysis ? 'pointer' : 'not-allowed',
                          border: canRunAnalysis ? 'none' : '1px solid #e2e8f0'
                        }} 
                        onClick={handleAnalyze} 
                        disabled={!canRunAnalysis || isAnalyzing}
                      >
                        <Play size={16} /> {isAnalyzing ? "Processing & Syncing to Cloud..." : "Run Analysis & Sync to Cloud"}
                      </button>

                      {!capturedImage && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                          Capture a frame first to unlock AI analysis
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <button 
                        className={canRunAnalysis ? "btn-primary" : "btn-secondary"} 
                        style={{ 
                          justifyContent: 'center',
                          display: 'flex',
                          gap: '8px',
                          background: canRunAnalysis ? '#0f4c81' : '#f1f5f9',
                          color: canRunAnalysis ? '#fff' : '#94a3b8',
                          cursor: canRunAnalysis ? 'pointer' : 'not-allowed',
                          border: canRunAnalysis ? 'none' : '1px solid #e2e8f0'
                        }} 
                        onClick={handleAnalyze} 
                        disabled={!canRunAnalysis || isAnalyzing}
                      >
                        <Play size={16} /> {isAnalyzing ? "Processing & Syncing to Cloud..." : "Run Analysis (Uploaded File)"}
                      </button>

                      {!uploadedImage && (
                        <div style={{ fontSize: '11px', color: '#94a3b8', textAlign: 'center' }}>
                          Upload an image first to unlock AI analysis
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. SAMPLE RESULTS & TAXONOMIC REPORT */}
        {currentView === 'result' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Analysis Report (ThingsBoard & Dropbox Synced)</div>
                <h1 className="page-title">Taxonomic Breakdown ({latestResult.sampleId})</h1>
              </div>
              <button className="btn-secondary" onClick={handleExportReport}>
                <Download size={16} /> Export Lab Report
              </button>
            </div>

            <div className="capture-layout" style={{ marginBottom: '24px' }}>
              <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="card-title">Original Micrograph (Dropbox)</div>
                  <div className="preview-box" style={{ height: '280px' }}>
                    {latestResult.rawImageUrl ? (
                      <img src={latestResult.rawImageUrl} alt="Original Raw" className="preview-overlay-image" />
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Awaiting cloud image...</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="card-title">AI Detection Layer (Dropbox)</div>
                  <div className="preview-box" style={{ height: '280px', border: '2px solid #0f4c81' }}>
                    {latestResult.annotatedImageUrl ? (
                      <img src={latestResult.annotatedImageUrl} alt="AI Detected" className="preview-overlay-image" />
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>Awaiting cloud image...</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Species Distribution (From ThingsBoard)</h3>
                {latestResult.species && latestResult.species.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ paddingBottom: '8px' }}>TAXON / DOMAIN</th>
                        <th style={{ paddingBottom: '8px' }}>COUNT</th>
                        <th style={{ paddingBottom: '8px' }}>CONF.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestResult.species.map((sp, idx) => {
                        const isPhyto = sp.domain === 'Phytoplankton' || (sp.name && sp.name.toLowerCase().includes('phyto'));
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 0', fontWeight: 600 }}>
                              <span className={`domain-pill ${isPhyto ? 'phyto' : 'zoo'}`}>
                                {isPhyto ? 'Phyto' : 'Zoo'}
                              </span>
                              {sp.name}
                            </td>
                            <td><b>{sp.count}</b></td>
                            <td style={{ color: '#137333', fontWeight: 700 }}>{sp.confidence}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '16px' }}>
                    No organisms detected in this sample frame.
                  </div>
                )}
              </div>
            </div>

            <div className="grid-cards">
              <div className="card">
                <div className="card-value">{latestResult.totalOrganisms}</div>
                <div className="card-title">Total Organisms</div>
              </div>
              <div className="card">
                <div className="card-value">{latestResult.speciesRichness}</div>
                <div className="card-title">Species Richness</div>
              </div>
              <div className="card">
                <div className="card-value">{latestResult.shannonIndex}</div>
                <div className="card-title">Shannon Index (H')</div>
              </div>
              <div className="card">
                <div className="card-value">{latestResult.processingTime}</div>
                <div className="card-title">Inference & Slice Time</div>
              </div>
            </div>
          </div>
        )}

        {/* 4. PERMANENT CLOUD HISTORY ARCHIVE */}
        {currentView === 'history' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Cloud Archive (ThingsBoard Database)</div>
                <h1 className="page-title">Sample History & Audit Trail</h1>
              </div>
              <button className="btn-primary" onClick={() => setCurrentView('analysis')}>
                <Plus size={16} /> New analysis
              </button>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>SAMPLE PREVIEW</th>
                  <th>SAMPLE ID</th>
                  <th>TIMESTAMP</th>
                  <th>TOTAL COUNT</th>
                  <th>SHANNON (H')</th>
                  <th>CLOUD ARCHIVE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {historyList.length > 0 ? (
                  historyList.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ width: '64px', height: '48px', borderRadius: '4px', overflow: 'hidden', background: '#090d16' }}>
                          <img 
                            src={item.annotatedImageUrl || item.rawImageUrl} 
                            alt="Preview" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        </div>
                      </td>
                      <td><b>{item.sampleId}</b></td>
                      <td style={{ fontSize: '11px', color: '#64748b' }}>{item.timestamp}</td>
                      <td>{item.totalOrganisms}</td>
                      <td><b>{item.shannonIndex}</b></td>
                      <td>
                        {item.annotatedImageUrl ? (
                          <a href={item.annotatedImageUrl} target="_blank" rel="noreferrer" style={{ color: '#0f4c81', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            Dropbox Link <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Processing</span>
                        )}
                      </td>
                      <td>
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '4px 8px', fontSize: '12px' }} 
                          onClick={() => { setLatestResult(item); setCurrentView('result'); }}
                        >
                          View Results
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', color: '#64748b', padding: '24px' }}>
                      No archived analysis records found in ThingsBoard Cloud.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

      </main>
    </div>
  );
}