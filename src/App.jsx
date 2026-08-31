import React, { useState, useEffect } from 'react';
import {
  Activity, Camera, Clock, HelpCircle,
  LayoutDashboard, Menu, Play, Plus, ExternalLink
} from 'lucide-react';
import './App.css';

const PI_IP = '10.138.130.135'; 
const API_BASE_URL = `http://${PI_IP}:5000`;

export default function App() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isPiConnected, setIsPiConnected] = useState(false);

  const [capturedImage, setCapturedImage] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const [historyList, setHistoryList] = useState([]);
  const [latestResult, setLatestResult] = useState({
    sampleId: 'No Analysis Yet',
    timestamp: '-',
    totalOrganisms: 0,
    speciesRichness: 0,
    avgConfidence: 0.0,
    shannonIndex: 0.0,
    processingTime: '0.0 sec',
    species: [],
    rawImageBase64: null,
    annotatedImageBase64: null,
    rawImageUrl: '',
    annotatedImageUrl: ''
  });

  // 1. Check Connection Status
  useEffect(() => {
    const checkStatus = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/status`);
        if (res.ok) {
          const data = await res.json();
          setIsPiConnected(data.status === 'connected' && data.camera_connected);
        } else {
          setIsPiConnected(false);
        }
      } catch {
        setIsPiConnected(false);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, []);

  // 2. Fetch History Log
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

  // 3. Capture Frame
  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/capture`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setCapturedImage(data.image);
      }
    } catch {
      alert("Failed to capture image from camera.");
    } finally {
      setIsCapturing(false);
    }
  };

  // 4. Analyze Sample
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
      alert("Analysis failed. Please check Raspberry Pi connection.");
    } finally {
      setIsAnalyzing(false);
    }
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
            <span style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '0.5px' }}>MARINEAI</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span className={isPiConnected ? "status-badge connected" : "status-badge disconnected"}>
            <span className="status-dot"></span>
            {isPiConnected ? "Connected" : "Disconnected"}
          </span>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#0f4c81' }}>
            MB
          </div>
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
          <div className="nav-item" style={{ fontSize: '12px', color: '#94a3b8' }}>
            <HelpCircle size={16} /> Support & documentation
          </div>
        </aside>
      )}

      {/* MAIN CONTENT */}
      <main className="main-content">

        {/* 1. DASHBOARD */}
        {currentView === 'dashboard' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Laboratory Workspace</div>
                <h1 className="page-title">System overview</h1>
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
                <div className="card-title">Shannon Biodiversity Index (H')</div>
              </div>
            </div>

            <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px' }}>
              <div>
                <div className="eyebrow">Most Recent Sample</div>
                <div style={{ fontWeight: 700, fontSize: '16px' }}>{latestResult.sampleId}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>
                  {latestResult.totalOrganisms > 0 ? `${latestResult.totalOrganisms} organisms detected across ${latestResult.speciesRichness} species` : "No active sample analyzed yet."}
                </div>
              </div>
              {latestResult.totalOrganisms > 0 && (
                <button className="btn-secondary" onClick={() => setCurrentView('result')}>
                  View Results
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
                <div className="eyebrow">New Analysis</div>
                <h1 className="page-title">Capture sample</h1>
              </div>
              <span className={isPiConnected ? "status-badge connected" : "status-badge disconnected"}>
                • {isPiConnected ? "Live RPi HQ Camera Active" : "Camera Offline"}
              </span>
            </div>

            <div className="capture-layout">
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <span style={{ fontWeight: 600, fontSize: '14px' }}>Live Microscope Preview</span>
                  <span style={{ color: isPiConnected ? '#137333' : '#d93025', fontSize: '12px', fontWeight: 600 }}>
                    • {isPiConnected ? "Connected" : "Disconnected"}
                  </span>
                </div>
                
                <div className="preview-box">
                  {capturedImage ? (
                    <img src={capturedImage} alt="Captured Sample" className="preview-overlay-image" />
                  ) : isPiConnected ? (
                    <img src={`${API_BASE_URL}/api/stream`} alt="Live Camera Feed" className="preview-overlay-image" />
                  ) : (
                    <div style={{ textAlign: 'center', color: '#64748b' }}>
                      <Camera size={40} style={{ marginBottom: '8px', opacity: 0.5 }} />
                      <div>Connect Raspberry Pi and Camera to view live feed</div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px', fontSize: '12px', color: '#64748b' }}>
                  <span>Camera: {isPiConnected ? "Raspberry Pi HQ Camera (IMX477)" : "Offline"}</span>
                  <span>Objective: 100× Industrial Lens</span>
                </div>
              </div>

              <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                <div>
                  <h3 style={{ fontSize: '16px', fontWeight: 700 }}>Prepare your sample</h3>
                  <p style={{ fontSize: '12px', color: '#64748b', marginTop: '4px' }}>
                    Mount specimen slide under lens and ensure optimal focus before capturing.
                  </p>
                  <ul className="checklist">
                    <li><span className="step-num">1</span> Mount slide under lens.</li>
                    <li><span className="step-num">2</span> Focus microscope image.</li>
                    <li><span className="step-num">3</span> Click <b>Capture Image</b>.</li>
                    <li><span className="step-num">4</span> Click <b>Analyze Sample</b>.</li>
                  </ul>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={handleCapture} disabled={isCapturing || !isPiConnected}>
                    <Camera size={16} /> {isCapturing ? "Capturing..." : "Capture Image"}
                  </button>
                  
                  <button className="btn-secondary" style={{ display: 'flex', justifyContent: 'center', gap: '8px', background: capturedImage ? '#0f4c81' : '', color: capturedImage ? '#fff' : '' }} onClick={handleAnalyze} disabled={!capturedImage || isAnalyzing}>
                    <Play size={16} /> {isAnalyzing ? "Processing & Uploading..." : "Analyze Sample"}
                  </button>

                  {capturedImage && (
                    <button className="btn-secondary" style={{ border: 'none', background: 'none', color: '#64748b' }} onClick={() => setCapturedImage(null)}>
                      Clear Captured Image (Return to Live Feed)
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. SAMPLE RESULTS */}
        {currentView === 'result' && (
          <div>
            <div className="page-title-section">
              <div>
                <div className="eyebrow">Analysis Complete</div>
                <h1 className="page-title">Sample results ({latestResult.sampleId})</h1>
              </div>
            </div>

            <div className="capture-layout" style={{ marginBottom: '24px' }}>
              <div className="card" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <div className="card-title">Original Captured Image</div>
                  <div className="preview-box" style={{ height: '260px' }}>
                    {latestResult.rawImageBase64 || latestResult.rawImageUrl ? (
                      <img src={latestResult.rawImageBase64 || latestResult.rawImageUrl} alt="Original Raw" className="preview-overlay-image" />
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>No image available</div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="card-title">AI Detected Annotated Image</div>
                  <div className="preview-box" style={{ height: '260px', border: '2px solid #0f4c81' }}>
                    {latestResult.annotatedImageBase64 || latestResult.annotatedImageUrl ? (
                      <img src={latestResult.annotatedImageBase64 || latestResult.annotatedImageUrl} alt="AI Detected" className="preview-overlay-image" />
                    ) : (
                      <div style={{ fontSize: '12px', color: '#64748b' }}>No image available</div>
                    )}
                  </div>
                </div>
              </div>

              <div className="card">
                <h3 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '12px' }}>Identified Species Breakdown</h3>
                {latestResult.species && latestResult.species.length > 0 ? (
                  <table style={{ width: '100%', fontSize: '12px', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ color: '#64748b', textAlign: 'left', borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ paddingBottom: '8px' }}>SPECIES</th>
                        <th style={{ paddingBottom: '8px' }}>COUNT</th>
                        <th style={{ paddingBottom: '8px' }}>CONF.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {latestResult.species.map((sp, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '8px 0', fontWeight: 600 }}>• {sp.name}</td>
                          <td>{sp.count}</td>
                          <td style={{ color: '#137333', fontWeight: 700 }}>{sp.confidence}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ fontSize: '12px', color: '#64748b', marginTop: '16px' }}>
                    No species detected in this frame.
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
                <div className="card-title">Inference & Upload Time</div>
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
                <h1 className="page-title">Sample history</h1>
              </div>
              <button className="btn-primary" onClick={() => setCurrentView('analysis')}>
                <Plus size={16} /> New analysis
              </button>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>SAMPLE PREVIEW</th>
                  <th>ANALYSIS ID</th>
                  <th>TIMESTAMP</th>
                  <th>ORGANISMS</th>
                  <th>SHANNON INDEX (H')</th>
                  <th>DROPBOX IMAGE</th>
                  <th>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {historyList.length > 0 ? (
                  historyList.map((item, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '8px' }}>
                        <div style={{ width: '64px', height: '48px', borderRadius: '4px', overflow: 'hidden', background: '#e2e8f0' }}>
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
                            Dropbox <ExternalLink size={12} />
                          </a>
                        ) : (
                          <span style={{ color: '#94a3b8', fontSize: '12px' }}>Pending Token</span>
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
                      No archived analysis records found in RAM memory.
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