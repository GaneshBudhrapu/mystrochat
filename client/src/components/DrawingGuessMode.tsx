import { useEffect, useState, useRef, useMemo } from "react";
import { socket } from "../socket";

interface DrawingProps {
  setMode: (mode: string) => void;
  username: string;
}

type DrawingGame = {
  id: string;
  players: string[];
  drawerId: string;
  word: string;
  status: "waiting" | "playing" | "finished";
};

const COLORS = ["#000000", "#ef4444", "#3b82f6", "#22c55e", "#eab308", "#a855f7"];

export default function DrawingGuessMode({ setMode, username }: DrawingProps) {
  const [game, setGame] = useState<DrawingGame | null>(null);
  const [status, setStatus] = useState("Finding opponent...");
  const [chats, setChats] = useState<{sender: string, text: string}[]>([]);
  const [input, setInput] = useState("");
  
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(5);
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const isDrawer = useMemo(() => game?.drawerId === socket.id, [game]);

  useEffect(() => {
    socket.emit("join-drawing");

    socket.on("drawing-waiting", () => setStatus("Waiting for another player..."));

    socket.on("drawing-start", (newGame: DrawingGame) => {
      setGame(newGame);
      setChats([]);
      setStatus(newGame.drawerId === socket.id ? `Draw: ${newGame.word}` : "Guess what they are drawing!");
      setBrushColor("#000000"); 
      setBrushSize(5);
      
      if (ctxRef.current && canvasRef.current) {
        ctxRef.current.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        ctxRef.current.beginPath();
      }
    });

    socket.on("drawing-path", ({ x, y, isDrawing: remoteDrawing, color, size }) => {
      if (!ctxRef.current) return;
      if (!remoteDrawing) {
        ctxRef.current.beginPath();
        return;
      }
      
      ctxRef.current.strokeStyle = color;
      ctxRef.current.lineWidth = size;
      ctxRef.current.lineTo(x, y);
      ctxRef.current.stroke();
      ctxRef.current.beginPath();
      ctxRef.current.moveTo(x, y);
    });

    socket.on("drawing-chat", (msg) => setChats(prev => [...prev, msg]));

    socket.on("drawing-ended", ({ message }) => {
      setStatus(message);
      setGame(prev => prev ? { ...prev, status: "finished" } : null);
    });

    return () => {
      socket.emit("leave-drawing");
      socket.off("drawing-waiting");
      socket.off("drawing-start");
      socket.off("drawing-path");
      socket.off("drawing-chat");
      socket.off("drawing-ended");
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = 500;
      canvas.height = 400;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.lineCap = "round";
        ctxRef.current = ctx;
      }
    }
  }, []);

  const getCoordinates = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;   
    const scaleY = canvas.height / rect.height;

    let clientX, clientY;
    if ('touches' in e) { 
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else { 
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e && e.cancelable) e.preventDefault(); 
    if (!isDrawer || game?.status !== "playing") return;
    isDrawing.current = true;
    draw(e);
  };

  const stopDrawing = () => {
    if (!isDrawer || game?.status !== "playing") return;
    isDrawing.current = false;
    ctxRef.current?.beginPath();
    socket.emit("drawing-path", { x: 0, y: 0, isDrawing: false });
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing.current || !isDrawer || !ctxRef.current || game?.status !== "playing") return;
    
    const coords = getCoordinates(e);
    if (!coords) return;
    const { x, y } = coords;

    ctxRef.current.strokeStyle = brushColor;
    ctxRef.current.lineWidth = brushSize;
    ctxRef.current.lineTo(x, y);
    ctxRef.current.stroke();
    ctxRef.current.beginPath();
    ctxRef.current.moveTo(x, y);

    socket.emit("drawing-path", { x, y, isDrawing: true, color: brushColor, size: brushSize });
  };

  const sendGuess = () => {
    if (!input.trim() || !game || game.status !== "playing") return;
    if (isDrawer) {
      setChats(prev => [...prev, { sender: username, text: input.trim() }]);
      socket.emit("drawing-chat", { sender: username, text: input.trim() });
    } else {
      socket.emit("drawing-guess", input);
    }
    setInput("");
  };

  const selectColor = (hex: string) => { setBrushColor(hex); setBrushSize(5); };
  const selectEraser = () => { setBrushColor("#ffffff"); setBrushSize(25); };

  return (
    <div className="chat-container drawing-container" style={{ maxWidth: '800px' }}>
      <div className="header">
        <div>
          <h2>✏️ Drawing Guess</h2>
          <p className="sub">{username}</p>
        </div>
        <div className="right-header">
          <p className="game-status">{status}</p>
          <div className="moderation-actions">
             {game?.status === "finished" && (
                <button className="btn-secondary compact-btn" onClick={() => socket.emit("drawing-next-round")}>Next Round</button>
             )}
            <button className="btn-danger compact-btn" onClick={() => { socket.emit("leave-drawing"); setMode("games"); }}>Leave</button>
          </div>
        </div>
      </div>

      <div className="drawing-layout" style={{ display: 'flex', flexWrap: 'wrap', padding: '20px', gap: '20px' }}>
        <div className="canvas-column" style={{ flex: '1 1 400px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          
          {isDrawer && game?.status === "playing" && (
            <div className="toolbar" style={{ display: 'flex', gap: '10px', padding: '10px', background: '#1e293b', borderRadius: '8px', alignItems: 'center' }}>
              <span style={{ fontSize: '12px', fontWeight: 'bold', color: '#94a3b8' }}>TOOLS:</span>
              {COLORS.map(c => (
                <button 
                  key={c} 
                  onClick={() => selectColor(c)}
                  style={{ width: '24px', height: '24px', borderRadius: '50%', background: c, border: brushColor === c ? '3px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0 }}
                  title="Color"
                />
              ))}
              <div style={{ flex: 1 }} />
              <button 
                onClick={selectEraser} 
                style={{ padding: '4px 10px', fontSize: '12px', background: brushColor === '#ffffff' ? '#3b82f6' : '#334155', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}
              >
                🧼 Eraser
              </button>
            </div>
          )}

          <div className="canvas-wrapper" style={{ flex: 1, background: '#fff', borderRadius: '12px', overflow: 'hidden', border: '2px solid #334155', minHeight: '300px' }}>
            <canvas
              ref={canvasRef}
              onMouseDown={startDrawing}
              onMouseUp={stopDrawing}
              onMouseOut={stopDrawing}
              onMouseMove={draw}
              onTouchStart={startDrawing}
              onTouchEnd={stopDrawing}
              onTouchCancel={stopDrawing}
              onTouchMove={draw}
              style={{ cursor: isDrawer ? 'crosshair' : 'default', display: 'block', width: '100%', height: '100%', touchAction: 'none' }}
            />
          </div>
        </div>

        <div className="chat-wrapper" style={{ flex: '1 1 250px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div className="chat-box" style={{ flex: 1, minHeight: '200px', background: '#1e293b', padding: '10px', borderRadius: '8px', overflowY: 'auto' }}>
            {chats.map((c, i) => (
              <div key={i} style={{ fontSize: '14px', marginBottom: '8px' }}>
                <b style={{ color: c.sender === username ? '#3b82f6' : '#94a3b8' }}>{c.sender}: </b> 
                {c.text}
              </div>
            ))}
          </div>
          <div className="input-area" style={{ padding: 0 }}>
            <input 
              value={input} 
              onChange={e => setInput(e.target.value)} 
              onKeyDown={e => e.key === "Enter" && sendGuess()}
              placeholder={isDrawer ? "Chat with guesser..." : "Type your guess..."}
              disabled={game?.status !== "playing"}
            />
            <button onClick={sendGuess} disabled={game?.status !== "playing"}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}