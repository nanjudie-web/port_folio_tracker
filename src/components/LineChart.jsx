import { useState, useRef, useEffect } from 'react';

export default function LineChart({ 
  data = [], 
  keys = [], 
  colors = {}, 
  labels = {}, 
  type = 'currency',
  currency = 'USD'
}) {
  const containerRef = useRef(null);
  const [hoverIndex, setHoverIndex] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [width, setWidth] = useState(600);
  const height = 300;

  // Handle responsive resizing
  useEffect(() => {
    if (!containerRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setWidth(entry.contentRect.width || 600);
      }
    });
    
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  if (!data || data.length === 0 || keys.length === 0) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No data available to plot
      </div>
    );
  }

  const margin = { top: 20, right: 30, bottom: 40, left: 65 };
  const chartWidth = width - margin.left - margin.right;
  const chartHeight = height - margin.top - margin.bottom;

  // Find min and max across all keys to scale Y axis
  let yMin = Infinity;
  let yMax = -Infinity;

  data.forEach((d) => {
    keys.forEach((key) => {
      const val = d[key] ?? 0;
      if (val < yMin) yMin = val;
      if (val > yMax) yMax = val;
    });
  });

  // Add a buffer to Y limits
  const yRange = yMax - yMin;
  const buffer = yRange === 0 ? 10 : yRange * 0.1;
  yMin = yMin - buffer;
  yMax = yMax + buffer;

  // For percentage return charts, let's make sure we show 0 return as a reference line if possible
  if (type === 'percentage') {
    if (yMin > 0) yMin = -0.05; // start slightly below zero
    if (yMax < 0) yMax = 0.05;
  }

  const getX = (index) => {
    if (data.length <= 1) return margin.left;
    return margin.left + (index / (data.length - 1)) * chartWidth;
  };

  const getY = (val) => {
    const scale = yMax - yMin;
    if (scale === 0) return margin.top + chartHeight / 2;
    return margin.top + chartHeight - ((val - yMin) / scale) * chartHeight;
  };

  // Format value based on type
  const formatVal = (val) => {
    if (type === 'currency') {
      return new Intl.NumberFormat('en-US', { style: 'currency', currency: currency, maximumFractionDigits: 0 }).format(val);
    }
    return (val * 100).toFixed(2) + '%';
  };

  // Generate paths for each key
  const paths = keys.map((key) => {
    return data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[key] ?? 0)}`).join(' ');
  });

  // Generate area paths for the first key (primary area, standard for portfolio value)
  const primaryKey = keys[0];
  const areaPath = data.length > 0 ? 
    `${data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)} ${getY(d[primaryKey] ?? 0)}`).join(' ')} ` +
    `L ${getX(data.length - 1)} ${margin.top + chartHeight} L ${getX(0)} ${margin.top + chartHeight} Z` : '';

  // Generate Y axis tick labels (5 ticks)
  const yTicks = [];
  const tickCount = 5;
  for (let i = 0; i < tickCount; i++) {
    const val = yMin + (i / (tickCount - 1)) * (yMax - yMin);
    yTicks.push(val);
  }

  // Generate X axis tick labels (4 ticks)
  const xTicks = [];
  const xTickIndices = [];
  const xTickCount = 4;
  if (data.length >= xTickCount) {
    for (let i = 0; i < xTickCount; i++) {
      const idx = Math.floor((i / (xTickCount - 1)) * (data.length - 1));
      xTickIndices.push(idx);
      xTicks.push(data[idx].date);
    }
  }

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    // Find index of closest data point
    const xInChart = clientX - margin.left;
    const pct = xInChart / chartWidth;
    const index = Math.max(0, Math.min(data.length - 1, Math.round(pct * (data.length - 1))));
    
    setHoverIndex(index);
    setTooltipPos({ x: clientX + 15, y: clientY - 40 });
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
  };

  const hoverItem = hoverIndex !== null ? data[hoverIndex] : null;

  return (
    <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <defs>
          <linearGradient id="chart-glow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.25" />
            <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0.0" />
          </linearGradient>
        </defs>

        {/* Horizontal Grid lines */}
        {yTicks.map((tick, i) => (
          <g key={i}>
            <line 
              x1={margin.left} 
              y1={getY(tick)} 
              x2={width - margin.right} 
              y2={getY(tick)} 
              stroke="var(--border-color)" 
              strokeDasharray="4 4" 
            />
            <text 
              x={margin.left - 10} 
              y={getY(tick) + 4} 
              fill="var(--text-muted)" 
              fontSize="10px" 
              textAnchor="end"
              fontFamily="var(--font-sans)"
            >
              {formatVal(tick)}
            </text>
          </g>
        ))}

        {/* Zero Return Reference Line (for percentage returns) */}
        {type === 'percentage' && yMin < 0 && yMax > 0 && (
          <line 
            x1={margin.left} 
            y1={getY(0)} 
            x2={width - margin.right} 
            y2={getY(0)} 
            stroke="rgba(255, 255, 255, 0.2)" 
            strokeWidth="1.5" 
          />
        )}

        {/* X axis date labels */}
        {xTickIndices.map((idx, i) => (
          <text 
            key={i} 
            x={getX(idx)} 
            y={height - margin.bottom + 20} 
            fill="var(--text-muted)" 
            fontSize="10px" 
            textAnchor="middle"
            fontFamily="var(--font-sans)"
          >
            {new Date(data[idx].date).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })}
          </text>
        ))}

        {/* Area fill for primary key */}
        {keys.length === 1 && areaPath && (
          <path d={areaPath} fill="url(#chart-glow)" />
        )}

        {/* Line paths */}
        {paths.map((path, i) => {
          const key = keys[i];
          const color = colors[key] || 'var(--color-primary)';
          const isSecond = i > 0;
          return (
            <path 
              key={key} 
              d={path} 
              fill="none" 
              stroke={color} 
              strokeWidth={isSecond ? 1.5 : 2.5} 
              strokeDasharray={isSecond ? "3 3" : "0"}
            />
          );
        })}

        {/* Interactive Hover Marker Line */}
        {hoverIndex !== null && (
          <line 
            x1={getX(hoverIndex)} 
            y1={margin.top} 
            x2={getX(hoverIndex)} 
            y2={height - margin.bottom} 
            stroke="rgba(255, 255, 255, 0.15)" 
            strokeWidth="1.5" 
            strokeDasharray="2 2" 
          />
        )}

        {/* Interactive Hover Dots */}
        {hoverIndex !== null && keys.map((key) => {
          const color = colors[key] || 'var(--color-primary)';
          const val = hoverItem[key] ?? 0;
          return (
            <circle 
              key={key} 
              cx={getX(hoverIndex)} 
              cy={getY(val)} 
              r="5" 
              fill={color} 
              stroke="white" 
              strokeWidth="1.5" 
            />
          );
        })}

        {/* Mouse Listening Rect */}
        <rect 
          x={margin.left} 
          y={margin.top} 
          width={chartWidth} 
          height={chartHeight} 
          fill="transparent" 
          onMouseMove={handleMouseMove} 
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'crosshair' }}
        />
      </svg>

      {/* Interactive Tooltip popup */}
      {hoverIndex !== null && hoverItem && (
        <div 
          className="svg-chart-tooltip animate-fade-in"
          style={{ 
            left: `${Math.min(tooltipPos.x, width - 200)}px`, 
            top: `${Math.max(10, tooltipPos.y)}px`
          }}
        >
          <div className="tooltip-title">
            {new Date(hoverItem.date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          {keys.map((key) => {
            const color = colors[key] || 'var(--color-primary)';
            const label = labels[key] || key;
            const val = hoverItem[key] ?? 0;
            return (
              <div key={key} className="tooltip-row">
                <span className="tooltip-label">
                  <span className="tooltip-color-dot" style={{ backgroundColor: color }} />
                  {label}:
                </span>
                <span style={{ fontWeight: '600' }}>
                  {formatVal(val)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
