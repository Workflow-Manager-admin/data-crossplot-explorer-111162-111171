import React, { useRef, useState } from "react";
import "./App.css";

// Utility function to read and parse CSV data
// PUBLIC_INTERFACE
function parseCSV(file, delimiter = ",") {
  /** Reads a CSV File object and returns a Promise resolving to { headers, rows }
   *  Handles quoted fields and commas
   */
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = event => {
      try {
        const text = event.target.result;
        // Split into rows
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        if (!lines.length) return reject(new Error("CSV is empty"));
        // Use a regex to correctly parse quoted values with separator inside quotes
        const csvRowRegex =
          /(?:,|\s|^)(?:"((?:[^"]|"")*)"|([^",\r\n]*))/g;
        const parseLine = line => {
          const result = [];
          let match;
          let regex = new RegExp(csvRowRegex.source, "g");
          while ((match = regex.exec(line)) !== null) {
            let val = match[1] !== undefined
              ? match[1].replace(/""/g, '"')
              : match[2];
            if (val !== undefined)
              result.push(val.trim());
          }
          // Remove empty leading column if present
          if (result.length && result[0] === "") result.shift();
          return result;
        };
        const headers = parseLine(lines[0]);
        const rows = lines.slice(1).map(parseLine);
        resolve({ headers, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

// PUBLIC_INTERFACE: Main App
function App() {
  // State
  const [csvHeaders, setCsvHeaders] = useState([]);
  const [csvRows, setCsvRows] = useState([]);
  const [plotX, setPlotX] = useState("");
  const [plotY, setPlotY] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [viewBox, setViewBox] = useState({
    xmin: -1,
    xmax: 1,
    ymin: -1,
    ymax: 1,
  });
  const [dragAnchor, setDragAnchor] = useState(null); // for panning
  const svgRef = useRef();

  // Theming colors (primary, accent, secondary)
  const theme = {
    accent: "#ff9800",
    primary: "#1976d2",
    secondary: "#424242",
    background: "#fff",
    text: "#252525",
  };

  // CSV Upload handler
  // PUBLIC_INTERFACE
  const handleFileChange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    setError("");
    setFileName(file.name);
    setPlotX("");
    setPlotY("");
    try {
      const { headers, rows } = await parseCSV(file);
      setCsvHeaders(headers);
      setCsvRows(rows);
    } catch (err) {
      setCsvHeaders([]);
      setCsvRows([]);
      setError("Failed to parse CSV: " + err.message);
    }
  };

  // When new columns selected, reset viewbox
  React.useEffect(() => {
    if (!plotX || !plotY) return;
    // Try to auto-scale to data
    const xIdx = csvHeaders.indexOf(plotX);
    const yIdx = csvHeaders.indexOf(plotY);
    if (xIdx === -1 || yIdx === -1) return;
    const pts = csvRows
      .map(row => [Number(row[xIdx]), Number(row[yIdx])])
      .filter(([x, y]) => !isNaN(x) && !isNaN(y));
    if (!pts.length) return;
    const xs = pts.map(p => p[0]);
    const ys = pts.map(p => p[1]);
    const padFrac = 0.05;
    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);
    const xPad = (xmax - xmin) * padFrac || 1;
    const yPad = (ymax - ymin) * padFrac || 1;
    setViewBox({
      xmin: xmin - xPad,
      xmax: xmax + xPad,
      ymin: ymin - yPad,
      ymax: ymax + yPad,
    });
  }, [plotX, plotY, csvHeaders, csvRows]);

  // Handlers for zoom/pan interaction
  // PUBLIC_INTERFACE
  const handleWheel = e => {
    // Zoom on cursor point
    if (!plotX || !plotY) return;
    e.preventDefault();
    const { left, top, width, height } = svgRef.current.getBoundingClientRect();
    const mouseX = e.clientX - left;
    const mouseY = e.clientY - top;
    const { xmin, xmax, ymin, ymax } = viewBox;
    const wx = mouseX / width;
    const wy = mouseY / height;
    const scale = e.deltaY < 0 ? 0.85 : 1.15;
    // Cursor-centered zoom
    const nxmin = wx * (xmin * scale) + (1 - wx) * xmin;
    const nxmax = wx * (xmax * scale) + (1 - wx) * xmax;
    const nymin = (1 - wy) * ymin + wy * (ymin * scale);
    const nymax = (1 - wy) * ymax + wy * (ymax * scale);
    setViewBox({
      xmin: nxmin,
      xmax: nxmax,
      ymin: nymin,
      ymax: nymax,
    });
  };

  // PUBLIC_INTERFACE
  const handleMouseDown = e => {
    if (!plotX || !plotY) return;
    e.preventDefault();
    setDragAnchor({ x: e.clientX, y: e.clientY, view: { ...viewBox } });
  };
  // PUBLIC_INTERFACE
  const handleMouseMove = e => {
    if (!dragAnchor) return;
    e.preventDefault();
    const dx = e.clientX - dragAnchor.x;
    const dy = e.clientY - dragAnchor.y;
    const { xmin, xmax, ymin, ymax } = dragAnchor.view;
    const svg = svgRef.current;
    const w = svg.clientWidth;
    const h = svg.clientHeight;
    const xrange = xmax - xmin, yrange = ymax - ymin;
    // negative dx because svg x increases right, positive user drag moves left
    setViewBox({
      xmin: xmin - (dx / w) * xrange,
      xmax: xmax - (dx / w) * xrange,
      ymin: ymin + (dy / h) * yrange,
      ymax: ymax + (dy / h) * yrange,
    });
  };
  // PUBLIC_INTERFACE
  const handleMouseUp = () => setDragAnchor(null);

  // Plot points data
  const plotPoints = React.useMemo(() => {
    if (!plotX || !plotY || !csvHeaders.length) return [];
    const xIdx = csvHeaders.indexOf(plotX);
    const yIdx = csvHeaders.indexOf(plotY);
    return csvRows.map((row, i) => ({
      x: Number(row[xIdx]),
      y: Number(row[yIdx]),
      idx: i,
      raw: row,
    })).filter(d => !isNaN(d.x) && !isNaN(d.y));
  }, [plotX, plotY, csvHeaders, csvRows]);

  // Tooltip state and handler
  const [tooltip, setTooltip] = useState({ show: false, x: 0, y: 0, content: "" });

  // PUBLIC_INTERFACE
  const handlePointMouseOver = (e, d) => {
    const svg = svgRef.current;
    const { left, top } = svg.getBoundingClientRect();
    // Add vertical offset for tooltip above cursor
    setTooltip({
      show: true,
      x: e.clientX - left,
      y: e.clientY - top - 32,
      content:
        `<strong>${plotX}:</strong> ${d.x}<br/><strong>${plotY}:</strong> ${d.y}`
    });
  };
  const handlePointMouseOut = () =>
    setTooltip({ ...tooltip, show: false });

  // Export sample CSV (for convenience)
  // PUBLIC_INTERFACE
  const handleSample = () => {
    const sample =
      "Depth,GR,RES,BulkDensity\n1000,80,55,2.65\n1002,85,50,2.67\n1004,88,75,2.68\n1006,90,44,2.64\n1008,76,120,2.66\n1010,81,52,2.63";
    const blob = new Blob([sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  // Layout
  return (
    <div
      className="app-root"
      style={{
        minHeight: "100vh",
        background: theme.background,
        color: theme.text,
        fontFamily:
          "'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "0",
      }}
    >
      {/* Topbar */}
      <div
        style={{
          width: "100%",
          background: theme.primary,
          color: "#fff",
          padding: "18px 0 10px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          boxShadow: "0 2px 8px rgba(25,118,210,0.05)",
          marginBottom: "0",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontWeight: 800,
            fontSize: "2.4rem",
            letterSpacing: "1px",
            color: "#fff",
          }}
        >
          CSV Crossplot Explorer
        </h1>
        <p style={{ color: "#e0e0e0", margin: "0.3em 0 0.5em 0", fontSize: "1em" }}>
          Upload a CSV, pick columns, explore interactive crossplots.
        </p>
      </div>

      {/* Card: Upload/Controls */}
      <div
        className="dashboard-card"
        style={{
          boxShadow: "0 2px 12px rgba(50,60,80,0.10)",
          background: "#fff",
          borderRadius: "15px",
          padding: "30px 24px 20px 24px",
          width: "95%",
          maxWidth: "630px",
          margin: "32px 0 10px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* Upload section */}
        <div style={{ width: "100%" }}>
          <label
            htmlFor="file-upload"
            style={{
              fontWeight: 600,
              fontSize: "1.13em",
              color: theme.primary,
              display: "block",
              marginBottom: "6px",
              letterSpacing: "0.2px",
            }}
          >
            Upload CSV file
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".csv,text/csv"
            onChange={handleFileChange}
            style={{
              width: "100%",
              background: "#fafbfc",
              border: "1px solid #e2e8f0",
              borderRadius: "7px",
              padding: "10px",
              fontSize: "1em",
              color: "#555",
              marginBottom: "0.7em",
              cursor: "pointer",
            }}
          />
          <div style={{ textAlign: "left", marginTop: "2px", color: "#888" }}>
            {fileName && (
              <>
                <span style={{ fontSize: "0.97em", color: theme.secondary }}>
                  {fileName}
                </span>
                <span style={{ marginLeft: "18px" }}>
                  {`(${csvHeaders.length} columns, ${csvRows.length} rows)`}
                </span>
              </>
            )}
          </div>
          <button
            className="download-sample-btn"
            onClick={handleSample}
            style={{
              marginTop: "9px",
              padding: "4px 12px",
              background: theme.accent,
              color: "#fff",
              fontWeight: 600,
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "0.95em",
              float: "right",
              marginBottom: "8px",
            }}
          >
            Download sample CSV
          </button>
          {error && (
            <div
              style={{
                marginTop: "8px",
                color: "#c62828",
                background: "#ffe0e0",
                border: "1px solid #faa",
                padding: "8px",
                borderRadius: "7px",
                fontSize: "0.97em",
              }}
            >
              {error}
            </div>
          )}
        </div>
        {/* Selectors */}
        {csvHeaders.length > 1 && (
          <div
            className="selectors"
            style={{
              marginTop: "24px",
              width: "100%",
              display: "flex",
              flexWrap: "wrap",
              gap: "25px",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "start" }}>
              <label style={{ fontWeight: 500, color: theme.primary }}>X-axis:</label>
              <select
                value={plotX}
                onChange={e => { setPlotX(e.target.value); }}
                style={{
                  fontSize: "1em",
                  minWidth: "120px",
                  padding: "7px 13px",
                  border: `2px solid ${theme.primary}`,
                  borderRadius: "6px",
                }}
              >
                <option value="">Select column...</option>
                {csvHeaders.map((col, idx) => (
                  <option key={"x" + idx} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "start" }}>
              <label style={{ fontWeight: 500, color: theme.primary }}>Y-axis:</label>
              <select
                value={plotY}
                onChange={e => { setPlotY(e.target.value); }}
                style={{
                  fontSize: "1em",
                  minWidth: "120px",
                  padding: "7px 13px",
                  border: `2px solid ${theme.primary}`,
                  borderRadius: "6px",
                }}
              >
                <option value="">Select column...</option>
                {csvHeaders.map((col, idx) => (
                  <option key={"y" + idx} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Plot area */}
      <div
        style={{
          margin: 0,
          marginTop: "5px",
          width: "100%",
          maxWidth: "920px",
          minHeight: "357px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {plotX && plotY && plotPoints.length ? (
          <div
            className="svg-plot-area"
            style={{
              width: "98%",
              maxWidth: "740px",
              minHeight: "320px",
              background: "#fafbfc",
              border: `1.7px solid ${theme.primary}33`,
              borderRadius: "16px",
              padding: "19px 11px 22px 36px",
              margin: "auto",
              marginBottom: "30px",
              boxSizing: "border-box",
              position: "relative",
            }}
          >
            {/* Crossplot SVG */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "320px",
                touchAction: "pan-x pan-y",
              }}
            >
              <svg
                ref={svgRef}
                tabIndex={0}
                width="100%"
                height="320"
                viewBox={`${viewBox.xmin} ${viewBox.ymin} ${viewBox.xmax - viewBox.xmin} ${viewBox.ymax - viewBox.ymin}`}
                style={{
                  border: `1.5px solid ${theme.secondary}22`,
                  background: "#fff",
                  borderRadius: "13px",
                  width: "100%",
                  height: "320px",
                  cursor: dragAnchor ? "move" : "crosshair",
                  boxShadow: "0 0 12px rgba(120,150,140,0.07)",
                }}
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onDoubleClick={() => {
                  // Reset zoom
                  setViewBox(
                    (() => {
                      const xs = plotPoints.map(p => p.x), ys = plotPoints.map(p => p.y);
                      const padFrac = 0.05;
                      const xmin = Math.min(...xs), xmax = Math.max(...xs);
                      const ymin = Math.min(...ys), ymax = Math.max(...ys);
                      const xPad = (xmax - xmin) * padFrac || 1;
                      const yPad = (ymax - ymin) * padFrac || 1;
                      return {
                        xmin: xmin - xPad,
                        xmax: xmax + xPad,
                        ymin: ymin - yPad,
                        ymax: ymax + yPad,
                      };
                    })()
                  );
                }}
              >
                {/* Axes */}
                <g>
                  {/* X axis */}
                  <line
                    x1={viewBox.xmin}
                    x2={viewBox.xmax}
                    y1={0}
                    y2={0}
                    stroke={theme.secondary}
                    strokeDasharray="3,2"
                    strokeWidth="0.6"
                  />
                  {/* Y axis */}
                  <line
                    x1={0}
                    x2={0}
                    y1={viewBox.ymin}
                    y2={viewBox.ymax}
                    stroke={theme.secondary}
                    strokeDasharray="3,2"
                    strokeWidth="0.6"
                  />
                </g>
                {/* Plot points */}
                <g>
                  {plotPoints.map((d, idx) => (
                    <circle
                      key={idx}
                      cx={d.x}
                      cy={d.y}
                      r={Math.max(1.5, (viewBox.xmax - viewBox.xmin) / 160)}
                      fill={theme.accent + "CC"}
                      stroke={theme.primary + "BB"}
                      strokeWidth="0.7"
                      onMouseOver={e => handlePointMouseOver(e, d)}
                      onMouseOut={handlePointMouseOut}
                    />
                  ))}
                </g>
                {/* Axis ticks/labels */}
                {/* X axis */}
                <g>
                  {(() => {
                    const range = viewBox.xmax - viewBox.xmin;
                    const ticks = 5;
                    return Array.from({ length: ticks + 1 }).map((_, i) => {
                      const x = viewBox.xmin + (i / ticks) * range;
                      return (
                        <g key={i}>
                          <line
                            x1={x}
                            y1={viewBox.ymin}
                            x2={x}
                            y2={viewBox.ymin + 1 / 20 * (viewBox.ymax - viewBox.ymin)}
                            stroke={theme.primary}
                            strokeWidth="0.4"
                          />
                          <text
                            x={x}
                            y={viewBox.ymin - 0.01 * (viewBox.ymax - viewBox.ymin)}
                            textAnchor="middle"
                            fontSize="0.038em"
                            fill={theme.secondary}
                          >
                            {Number(x).toFixed(2)}
                          </text>
                        </g>
                      );
                    });
                  })()}
                </g>
                {/* Y axis */}
                <g>
                  {(() => {
                    const range = viewBox.ymax - viewBox.ymin;
                    const ticks = 5;
                    return Array.from({ length: ticks + 1 }).map((_, i) => {
                      const y = viewBox.ymin + (i / ticks) * range;
                      return (
                        <g key={i}>
                          <line
                            x1={viewBox.xmin}
                            y1={y}
                            x2={viewBox.xmin + 1 / 32 * (viewBox.xmax - viewBox.xmin)}
                            y2={y}
                            stroke={theme.primary}
                            strokeWidth="0.4"
                          />
                          <text
                            x={viewBox.xmin - 0.01 * (viewBox.xmax - viewBox.xmin)}
                            y={y}
                            dominantBaseline="middle"
                            textAnchor="end"
                            fontSize="0.038em"
                            fill={theme.secondary}
                          >
                            {Number(y).toFixed(2)}
                          </text>
                        </g>
                      );
                    });
                  })()}
                </g>
              </svg>
              {/* Tooltip */}
              {tooltip.show && (
                <div
                  style={{
                    position: "absolute",
                    pointerEvents: "none",
                    left: tooltip.x,
                    top: tooltip.y,
                    minWidth: "100px",
                    background: "#fffbe6",
                    color: "#373737",
                    borderRadius: "7px",
                    padding: "9px 12px",
                    boxShadow: "0 2px 12px rgba(100,70,5,0.10)",
                    border: `1.3px solid ${theme.accent}AA`,
                    fontSize: "0.99em",
                    zIndex: 100,
                    whiteSpace: "nowrap"
                  }}
                  dangerouslySetInnerHTML={{ __html: tooltip.content }}
                />
              )}
            </div>
            {/* Legends */}
            <div
              style={{
                display: "flex",
                width: "100%",
                justifyContent: "space-between",
                marginTop: "10px",
                fontWeight: 500,
                color: theme.secondary,
                fontSize: "1em",
              }}
            >
              <span>
                <span style={{ color: theme.primary }}>X:</span> {plotX}
              </span>
              <span>
                <span style={{ color: theme.primary }}>Y:</span> {plotY}
              </span>
              <span style={{ color: theme.accent, fontWeight: 600 }}>
                {plotPoints.length} points
              </span>
            </div>
            {/* Controls guide */}
            <div
              style={{
                width: "100%",
                marginTop: "9px",
                fontSize: "0.97em",
                color: "#876b24",
                background: "#fff9f0",
                borderRadius: "8px",
                textAlign: "center",
                padding: "7px",
              }}
            >
              <span style={{ color: theme.accent, fontWeight: 600 }}>Controls:</span>{" "}
              <span>
                Zoom: Mouse wheel &nbsp;&bull;&nbsp; Pan: Drag &nbsp;&bull;&nbsp;
                Reset: Double-click
              </span>
            </div>
          </div>
        ) : plotX && plotY ? (
          <div
            style={{
              margin: "30px auto",
              fontSize: "1.13em",
              color: theme.secondary,
              background: "#fff5f3",
              padding: "19px 40px",
              borderRadius: "11px",
            }}
          >
            No valid numeric data for the selected columns.
          </div>
        ) : (
          <div
            style={{
              margin: "48px auto",
              fontSize: "1.07em",
              color: "#4f5e7e",
              background: "#f5f8fa",
              padding: "30px 45px",
              borderRadius: "15px",
              maxWidth: "640px",
            }}
          >
            <div style={{ fontWeight: 500, marginBottom: "2px" }}>
              To get started:<br />
              <span style={{ color: theme.primary }}>
                Upload a CSV file and select columns for your crossplot!
              </span>
            </div>
            <span
              style={{
                display: "block",
                color: "#9ca8bf",
                marginTop: "11px",
                fontSize: "0.98em",
              }}
            >
              (You can use the Download sample CSV for a demo)
            </span>
          </div>
        )}
      </div>
      <footer
        style={{
          marginTop: "auto",
          width: "100%",
          borderTop: "1.5px solid #e9e9ee",
          background: "#f8f9fb",
          color: "#888",
          fontSize: "0.96em",
          textAlign: "center",
          padding: "14px 0 14px 0"
        }}
      >
        <span>
          <span style={{ color: theme.accent, fontWeight: 600 }}>
            CSV Crossplot Explorer
          </span>{" "}
          &nbsp;&bull;&nbsp;
          <a
            href="https://react.dev/"
            style={{
              color: theme.primary,
              textDecoration: "none",
              fontWeight: 400,
              marginLeft: "6px",
            }}
            rel="noopener noreferrer"
            target="_blank"
          >
            Made with React
          </a>
        </span>
      </footer>
    </div>
  );
}

export default App;
