import React, { useState, useEffect } from 'react';
import {
  Activity, Camera, Clock, HelpCircle,
  LayoutDashboard, Menu, Play, Plus, ExternalLink,
  Download, RefreshCw, Eye
} from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './App.css';

const PI_IP = '10.138.130.135'; 
const API_BASE_URL = `http://${PI_IP}:5000`;

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [connectionState, setConnectionState] = useState({
    status: 'disconnected',
    cameraConnected: false,
    modelLoaded: false,
    mode: 'Offline'
  });

  const [capturedImage, setCapturedImage] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Restored missing state definition
  const [historyList, setHistoryList] = useState([]);

  const [latestResult, setLatestResult] = useState({
    sampleId: 'SMPL_TEST_2026_001',
    timestamp: '2026-09-01 14:30:00',
    totalOrganisms: 14,
    speciesRichness: 4,
    avgConfidence: 89.5,
    shannonIndex: 1.34,
    phytoCount: 9,
    zooCount: 5,
    processingTime: '0.42 sec',
    species: [
      { name: 'Chaetoceros (Diatom)', count: 6, confidence: 92.4, domain: 'Phytoplankton' },
      { name: 'Coscinodiscus (Diatom)', count: 3, confidence: 88.1, domain: 'Phytoplankton' },
      { name: 'Calanoid Copepod', count: 4, confidence: 91.0, domain: 'Zooplankton' },
      { name: 'Nauplius Larva', count: 1, confidence: 86.5, domain: 'Zooplankton' }
    ],
    rawImageBase64: null,
    annotatedImageBase64: null,
    rawImageUrl: '',
    annotatedImageUrl: ''
  });

  // 1. Connection Poller
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/status`);
        if (res.ok) {
          const data = await res.json();
          const isSim = data.status === 'simulation_active' || (!data.camera_connected && data.model_loaded);
          setConnectionState({
            status: data.camera_connected ? 'connected' : (isSim ? 'simulation' : 'disconnected'),
            cameraConnected: !!data.camera_connected,
            modelLoaded: !!data.model_loaded,
            mode: data.camera_connected ? 'Live HQ Camera' : 'Simulation Mode'
          });
        } else {
          setConnectionState(prev => ({ ...prev, status: 'disconnected' }));
        }
      } catch {
        setConnectionState(prev => ({ ...prev, status: 'disconnected' }));
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch History
  const fetchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/history`);
      if (res.ok) {
        const data = await res.json();
        setHistoryList(data);
        if (data.length > 0 && latestResult.sampleId === 'No Analysis Yet') {
          setLatestResult(data[0]);
        }
      }
    } catch (e) {
      console.error("Failed to fetch history:", e);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [currentView]);

  // 3. Capture Action
  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/capture`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCapturedImage(data.image);
      }
    } catch {
      alert("Failed to capture image frame.");
    } finally {
      setIsCapturing(false);
    }
  };

  // 4. Analyze Action
  const handleAnalyze = async () => {
    setIsAnalyzing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/analyse`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setLatestResult(data);
        await fetchHistory();
        setCurrentView('result');
      }
    } catch {
      alert("Analysis failed. Verify backend service.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  // 5. Automated PDF Report Generation
  const handleExportReport = () => {
    const doc = new jsPDF();

    // Document Header & Styling
    doc.setFillColor(15, 76, 129);
    doc.rect(0, 0, 210, 24, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('MARINEAI LAB - ECOLOGICAL AUDIT REPORT', 14, 16);

    // Metadata Section
    doc.setTextColor(30, 41, 59);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(`Sample ID: ${latestResult.sampleId}`, 14, 34);
    doc.setFont('helvetica', 'normal');
    doc.text(`Timestamp: ${latestResult.timestamp || new Date().toLocaleString()}`, 14, 40);

    // Summary Metric Cards (Table)
    autoTable(doc, {
      startY: 58,
      head: [['Metric', 'Value', 'Ecological Status']],
      body: [
        ['Total Detected Organisms', `${latestResult.totalOrganisms}`, 'Verified'],
        ['Species Richness', `${latestResult.speciesRichness}`, `${latestResult.speciesRichness > 3 ? 'High Diversity' : 'Low Richness'}`],
        ['Shannon Biodiversity Index (H\')', `${latestResult.shannonIndex}`, `${latestResult.shannonIndex >= 1.5 ? 'Balanced Ecosystem' : 'Stressed Environment'}`],
        ['Average Confidence', `${latestResult.avgConfidence}%`, 'Optimal Detection'],
        ['Inference & Scan Latency', `${latestResult.processingTime}`, 'Edge Accelerated']
      ],
      theme: 'grid',
      headStyles: { fillColor: [15, 76, 129], textColor: [255, 255, 255], fontStyle: 'bold' },
      styles: { fontSize: 9 }
    });

    // Species Distribution Breakdown Table
    const tableData = (latestResult.species || []).map(sp => {
      const isPhyto = sp.domain === 'Phytoplankton' || (sp.name && sp.name.toLowerCase().includes('phyto'));
      return [
        isPhyto ? 'Phytoplankton' : 'Zooplankton',
        sp.name,
        sp.count,
        `${sp.confidence}%`
      ];
    });

    const finalY = doc.lastAutoTable.finalY || 110;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Taxonomic Breakdown', 14, finalY + 10);

    autoTable(doc, {
      startY: finalY + 14,
      head: [['Domain', 'Species / Taxon Name', 'Count', 'Confidence']],
      body: tableData.length > 0 ? tableData : [['-', 'No organisms detected in slide frame', '0', '-']],
      theme: 'striped',
      headStyles: { fillColor: [51, 65, 85], textColor: [255, 255, 255] },
      styles: { fontSize: 9 }
    });

    // Micrograph Image Embed (if base64 exists)
    const imgData = latestResult.annotatedImageBase64 || latestResult.rawImageBase64;
    let nextY = doc.lastAutoTable.finalY + 10;

    if (imgData && nextY < 210) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text('Annotated Micrograph', 14, nextY);
      doc.addImage(imgData, 'JPEG', 14, nextY + 4, 80, 60);
      nextY += 70;
    }

    // Sign-off Footer
    doc.setFontSize(8);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(100, 116, 139);
    doc.text('Generated automatically by MarineAI Edge Computing System', 14, 285);

    // Trigger Browser Download
    doc.save(`MarineAI_Report_${latestResult.sampleId.replace(/\s+/g, '_')}.pdf`);
  };

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

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span className={`status-badge ${connectionState.status}`}>
            <span className="status-dot"></span>
            {connectionState.status === 'connected' && "Live HQ Sensor"}
            {connectionState.status === 'simulation' && "Simulation Active"}
            {connectionState.status === 'disconnected' && "Offline"}
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

      {/* MAIN CONTENT */}
      <main className="main-content">

        {/* 1. DASHBOARD OVERVIEW */}
        {currentView === 'dashboard' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Laboratory Workspace</div>
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
                <div className="eyebrow">Most Recent Sample</div>
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

        {/* 2. CAPTURE & LIVE PREVIEW */}
        {currentView === 'analysis' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Microscopy Ingestion</div>
                <h1 className="page-title">Live Slide Capture</h1>
              </div>
            </div>

            <div className="capture-layout">
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>Optical Field View</span>
                  <span style={{ fontSize: '12px', fontWeight: 600, color: connectionState.status === 'connected' ? '#137333' : '#b45309' }}>
                    • {connectionState.mode}
                  </span>
                </div>
                
                <div className="preview-box">
                  {capturedImage ? (
                    <img src={capturedImage} alt="Captured Slide" className="preview-overlay-image" />
                  ) : connectionState.status !== 'disconnected' ? (
                    <img src={`${API_BASE_URL}/api/stream`} alt="Live Camera Feed" className="preview-overlay-image" />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#64748b' }}>
                      <Camera size={40} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <div>Connect Raspberry Pi server to activate optical feed</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
                  <span>Sensor: {connectionState.status === 'connected' ? "Arducam IMX477 HQ" : "Simulated Slide Feed"}</span>
                  <span>Magnification: 100× Industrial Objective</span>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Slide Acquisition Workflow</h3>
                  
                  <ul className="checklist">
                    <li><span className="step-num">1</span> Mount water specimen slide.</li>
                    <li><span className="step-num">2</span> Focus microscope lighting.</li>
                    <li><span className="step-num">3</span> Click <b>Capture Slide Frame</b>.</li>
                    <li><span className="step-num">4</span> Run <b>Run Analysis</b>.</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={handleCapture} disabled={isCapturing || connectionState.status === 'disconnected'}>
                    <Camera size={16} /> {isCapturing ? "Capturing..." : "Capture Slide Frame"}
                  </button>
                  
                  <button className="btn-secondary" style={{ display: 'flex', justifyContent: 'center', gap: '8px', background: capturedImage ? '#0f4c81' : '', color: capturedImage ? '#fff' : '' }} onClick={handleAnalyze} disabled={!capturedImage || isAnalyzing}>
                    <Play size={16} /> {isAnalyzing ? "Analyzing (OpenVINO)..." : "Run Analysis"}
                  </button>

                  {capturedImage && (
                    <button className="btn-secondary" style={{ border: 'none', background: 'none', color: '#64748b', justifyContent: 'center' }} onClick={() => setCapturedImage(null)}>
                      <RefreshCw size={14} /> Clear Frame & Return to Live Feed
                    </button>
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
                <div className="eyebrow">Analysis Report</div>
                <h1 className="page-title">Taxonomic Breakdown ({latestResult.sampleId})</h1>
              </div>
              <button className="btn-secondary" onClick={handleExportReport}>
                <Download size={16} /> Export Lab Report
              </button>
            </div>

            <div className="capture-layout" style={{ marginBottom: '24px' }}>
              <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="card-title">Original Micrograph</div>
                  <div className="preview-box" style={{ height: '280px' }}>
                    {latestResult.rawImageBase64 || latestResult.rawImageUrl ? (
                      <img src={latestResult.rawImageBase64 || latestResult.rawImageUrl} alt="Original Raw" className="preview-overlay-image" />
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>No image loaded</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="card-title">AI Detection Layer (Dual-Model)</div>
                  <div className="preview-box" style={{ height: '280px', border: '2px solid #0f4c81' }}>
                    {latestResult.annotatedImageBase64 || latestResult.annotatedImageUrl ? (
                      <img src={latestResult.annotatedImageBase64 || latestResult.annotatedImageUrl} alt="AI Detected" className="preview-overlay-image" />
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>No detections loaded</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Species Distribution</h3>
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

        {/* 4. HISTORY ARCHIVE */}
        {currentView === 'history' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Analysis Archive</div>
                <h1 className="page-title">Sample History & Telemetry</h1>
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
                  <th>STORAGE</th>
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
                            src={item.annotatedImageBase64 || item.annotatedImageUrl || item.rawImageBase64} 
                            alt="Preview" 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                          />
                        </div>
                      </td>
                      <td><b>{item.sampleId}</b></td>
                      <td style={{ fontSize: '11px', color: '#64748b' }}>{item.timestamp}</td>
                      <td>{item.totalOrganisms}</td>
                      <td><b>{item.shannonIndex}</b></td>
                      <td>
                        {item.rawImageUrl ? (
                          <a href={item.rawImageUrl} target="_blank" rel="noreferrer" style={{ color: '#0f4c81', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}>
                            Cloud Archive <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Local RAM</span>
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
                      No archived analysis records found.
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