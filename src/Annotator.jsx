import React, { useRef, useState } from 'react';

export default function Annotator({ src, points, onPoint, label = 'Foto della parete', activeIndex }) {
  const [cursor, setCursor] = useState(null);
  const host = useRef(null);
  function position(event) {
    const rect = host.current.getBoundingClientRect();
    return [Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height))];
  }
  return <div className="annotation-well">
    <div ref={host} className={`annotator ${onPoint ? 'editable' : ''}`}
      onPointerDown={(event) => { if (onPoint) { event.currentTarget.setPointerCapture(event.pointerId); setCursor(position(event)); } }}
      onPointerMove={(event) => { if (cursor) setCursor(position(event)); }}
      onPointerCancel={() => setCursor(null)}
      onPointerUp={(event) => { if (onPoint && cursor) onPoint(position(event)); setCursor(null); }}>
      <img src={src} alt={label} draggable="false" />
      <svg viewBox="0 0 1000 1000" preserveAspectRatio="none" aria-hidden="true">
        {Array.from({ length: Math.ceil(points.length / 4) }, (_, i) => <polyline key={i} points={points.slice(i * 4, i * 4 + 4).map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ')} />)}
        {points.map(([x, y], i) => <g key={i} className={activeIndex === i ? 'selected' : ''}>
          <circle cx={x * 1000} cy={y * 1000} r="9" /><text x={x * 1000 + 16} y={y * 1000 - 12}>{Math.floor(i / 4) + 1}.{i % 4 + 1}</text>
        </g>)}
        {cursor && <g className="crosshair"><path d={`M${cursor[0] * 1000 - 20},${cursor[1] * 1000}h40 M${cursor[0] * 1000},${cursor[1] * 1000 - 20}v40`} /></g>}
      </svg>
    </div>
    {cursor && <div className="loupe" aria-hidden="true" style={{ backgroundImage: `url("${src}")`, backgroundSize: `${host.current.clientWidth * 4}px ${host.current.clientHeight * 4}px`, backgroundPosition: `${60 - cursor[0] * host.current.clientWidth * 4}px ${60 - cursor[1] * host.current.clientHeight * 4}px` }}><span>+</span></div>}
  </div>;
}
