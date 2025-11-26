'use client';

import { useEffect } from 'react';

export default function CityBackground() {
  useEffect(() => {
    const world = document.getElementById('world');
    if (!world || world.children.length > 0) return;

    const size = 3000; // Map size
    const count = 60; // Number of buildings

    const fragment = document.createDocumentFragment();

    for(let i=0; i<count; i++) {
        const b = document.createElement('div');
        b.className = 'building';
        
        const w = 40 + Math.random() * 60;
        const d = 40 + Math.random() * 60;
        const h = 50 + Math.random() * 400;
        const x = (Math.random() - 0.5) * size;
        const y = (Math.random() - 0.5) * size;
        
        // Avoid center area
        if (Math.abs(x) < 300 && Math.abs(y) < 300) continue;

        b.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        
        // Create faces
        const faces = [
            { w: w, h: h, tx: 0, ty: -h/2, tz: d/2, rx: 90, ry: 0, rz: 0 }, // Front
            { w: w, h: h, tx: 0, ty: -h/2, tz: -d/2, rx: 90, ry: 0, rz: 0 }, // Back
            { w: d, h: h, tx: -w/2, ty: -h/2, tz: 0, rx: 90, ry: 90, rz: 0 }, // Left
            { w: d, h: h, tx: w/2, ty: -h/2, tz: 0, rx: 90, ry: 90, rz: 0 }, // Right
            { w: w, h: d, tx: 0, ty: -h, tz: 0, rx: 0, ry: 0, rz: 0, cls: 'top' } // Top
        ];

        faces.forEach(f => {
            const face = document.createElement('div');
            face.className = 'face ' + (f.cls || '');
            face.style.width = f.w + 'px';
            face.style.height = f.h + 'px';
            face.style.transform = `translate3d(${f.tx}px, ${f.ty}px, ${f.tz}px) rotateX(${f.rx}deg) rotateY(${f.ry}deg) rotateZ(${f.rz}deg)`;
            face.style.marginLeft = -f.w/2 + 'px';
            face.style.marginTop = -f.h/2 + 'px';
            b.appendChild(face);
        });

        fragment.appendChild(b);
    }
    world.appendChild(fragment);
  }, []);

  return (
    <div id="city-container">
        <div id="world"></div>
    </div>
  );
}
