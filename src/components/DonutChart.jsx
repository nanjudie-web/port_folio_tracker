import { useState } from 'react';

export default function DonutChart({ data = [], currency = 'USD', thbRate = 36.50 }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Filter out zero values
  const validData = data.filter(d => d.value > 0);
  const total = validData.reduce((sum, d) => sum + d.value, 0);

  if (validData.length === 0) {
    return (
      <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        No holdings to display
      </div>
    );
  }

  // Curated premium HSL colors for asset sections
  const colors = [
    'hsl(239, 84%, 67%)', // Indigo
    'hsl(187, 92%, 45%)', // Cyan
    'hsl(162, 72%, 48%)', // Emerald Green
    'hsl(271, 81%, 70%)', // Purple
    'hsl(37, 90%, 55%)',  // Gold/Amber
    'hsl(343, 80%, 60%)',  // Pink/Rose
    'hsl(200, 80%, 50%)',  // Sky Blue
  ];

  const size = 220;
  const center = size / 2;
  const radius = 70;
  const strokeWidth = 22;
  const circumference = 2 * Math.PI * radius;

  // Format currency dynamically based on active code and exchange rate
  const formatCur = (val) => {
    const scale = currency === 'THB' ? thbRate : 1;
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: currency, 
      maximumFractionDigits: 0 
    }).format(val * scale);
  };

  const hoveredItem = hoveredIdx !== null ? validData[hoveredIdx] : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', width: '100%' }}>
      
      {/* SVG Donut Circle */}
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size}>
          <g transform={`rotate(-90 ${center} ${center})`}>
            {validData.map((d, idx) => {
              const percentage = d.value / total;
              const dashArray = `${percentage * circumference} ${circumference}`;
              const precedingPercent = validData
                .slice(0, idx)
                .reduce((sum, item) => sum + item.value / total, 0);
              const dashOffset = -precedingPercent * circumference;

              const isHovered = hoveredIdx === idx;
              const color = colors[idx % colors.length];

              return (
                <circle
                  key={d.label + idx}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="transparent"
                  stroke={color}
                  strokeWidth={isHovered ? strokeWidth + 4 : strokeWidth}
                  strokeDasharray={dashArray}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  style={{
                    cursor: 'pointer',
                    transition: 'stroke-width 0.2s ease, filter 0.2s ease',
                    filter: isHovered ? 'drop-shadow(0 0 4px rgba(255,255,255,0.2))' : 'none'
                  }}
                />
              );
            })}
          </g>
        </svg>

        {/* Center overlay label */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          textAlign: 'center',
          padding: '20px'
        }}>
          {hoveredItem ? (
            <>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                {hoveredItem.label}
              </span>
              <span style={{ fontSize: '18px', fontWeight: '800', margin: '2px 0', fontFamily: 'var(--font-heading)' }}>
                {((hoveredItem.value / total) * 100).toFixed(1)}%
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                {formatCur(hoveredItem.value)}
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Assets
              </span>
              <span style={{ fontSize: '20px', fontWeight: '800', marginTop: '2px', fontFamily: 'var(--font-heading)' }}>
                {formatCur(total)}
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {validData.length} holdings
              </span>
            </>
          )}
        </div>
      </div>

      {/* Legends List - Clean Vertical List (No Scrollbar, Bigger Font, Shows Converted Values) */}
      <div style={{ 
        width: '100%', 
        display: 'flex',
        flexDirection: 'column',
        gap: '8px', 
        borderTop: '1px solid var(--border-color)',
        paddingTop: '16px',
        marginTop: '8px'
      }}>
        {validData.map((d, idx) => {
          const color = colors[idx % colors.length];
          const pct = ((d.value / total) * 100).toFixed(1);
          const isHovered = hoveredIdx === idx;
          
          return (
            <div 
              key={d.label + '-legend'}
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 10px',
                borderRadius: '8px',
                cursor: 'pointer',
                backgroundColor: isHovered ? 'rgba(255,255,255,0.04)' : 'transparent',
                transition: 'background-color 0.2s ease',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <span style={{
                  width: '10px',
                  height: '10px',
                  borderRadius: '3px',
                  backgroundColor: color,
                  display: 'inline-block',
                  flexShrink: 0
                }} />
                <span style={{ 
                  fontSize: '14px', 
                  fontWeight: '600',
                  color: isHovered ? 'var(--text-primary)' : 'var(--text-secondary)',
                  transition: 'color 0.2s ease',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap'
                }}>
                  {d.label}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                  {formatCur(d.value)}
                </span>
                <span style={{ fontSize: '14px', fontWeight: '700', color: 'var(--text-primary)', width: '50px', textAlign: 'right' }}>
                  {pct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
