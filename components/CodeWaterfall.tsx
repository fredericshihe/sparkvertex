import React, { useEffect, useRef } from 'react';

interface CodeWaterfallProps {
  code: string;
  isGenerating: boolean;
}

export const CodeWaterfall: React.FC<CodeWaterfallProps> = ({ code, isGenerating }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let particles: { x: number; y: number; speed: number; char: string; color: string; size: number }[] = [];
    
    const resizeCanvas = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    // Initialize particles based on code content or random chars if code is empty/short
    const initParticles = () => {
      // If we have code, we want to visualize it flowing
      // But for a "Matrix" style, we usually drop random chars.
      // Let's try to make it look like the code is being constructed.
    };

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<>{}[]/\\*&^%$#@!';
    const codeLines = code.split('\n');
    
    // Matrix Rain Configuration
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = [];
    
    for (let i = 0; i < columns; i++) {
      drops[i] = Math.random() * -100; // Start above screen
    }

    const draw = () => {
      // Semi-transparent black to create trail effect
      ctx.fillStyle = 'rgba(15, 23, 42, 0.1)'; // Slate-900 with low opacity
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = `${fontSize}px monospace`;
      
      for (let i = 0; i < drops.length; i++) {
        // Pick a character
        // If we have code, try to use characters from the code roughly mapped to position?
        // Or just random characters for the "rain" effect, and we overlay the actual code separately?
        // The user wants "waterfall code".
        
        // Let's stick to the classic Matrix rain but with a blue/cyan theme for "Spark"
        const text = chars[Math.floor(Math.random() * chars.length)];
        
        // Color: Cyan/Blue gradient
        const isHead = Math.random() > 0.98;
        ctx.fillStyle = isHead ? '#fff' : '#0ea5e9'; // White head, Sky-500 tail
        
        ctx.fillText(text, i * fontSize, drops[i] * fontSize);

        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }
        
        drops[i]++;
      }
      
      animationFrameId = requestAnimationFrame(draw);
    };

    if (isGenerating) {
        draw();
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationFrameId);
    };
  }, [isGenerating]);

  // We also want to display the ACTUAL code streaming in a nice way
  // Maybe an overlay on top of the rain?
  
  return (
    <div ref={containerRef} className="absolute inset-0 overflow-hidden pointer-events-none">
      <canvas ref={canvasRef} className="absolute inset-0 opacity-30" />
      
      {/* Actual Code Streaming Overlay */}
      <div className="absolute inset-0 p-8 overflow-hidden flex flex-col justify-end">
         <div className="font-mono text-xs md:text-sm text-cyan-400/80 whitespace-pre-wrap break-all shadow-black drop-shadow-md leading-relaxed mask-image-gradient">
            {code.slice(-2000)} {/* Show last 2000 chars */}
            <span className="inline-block w-2 h-4 bg-cyan-400 ml-1 animate-pulse"></span>
         </div>
      </div>
      
      <style jsx>{`
        .mask-image-gradient {
            mask-image: linear-gradient(to bottom, transparent, black 20%);
            -webkit-mask-image: linear-gradient(to bottom, transparent, black 20%);
        }
      `}</style>
    </div>
  );
};
