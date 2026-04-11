import { useEffect, useState, useRef } from "react";
import Peer, { type MediaConnection } from "peerjs";
import { socket } from "../socket";

interface CallProps {
  setMode: (mode: string) => void;
  username: string;
  type: "audio" | "video";
}

export default function CallMode({ setMode, username, type }: CallProps) {
  const [status, setStatus] = useState("Accessing camera/mic...");
  
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  const peerInstance = useRef<Peer | null>(null);
  const myStreamRef = useRef<MediaStream | null>(null);
  const currentCall = useRef<MediaConnection | null>(null);

  useEffect(() => {
    // Standard, reliable PeerJS config
    const peer = new Peer({
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    });
    peerInstance.current = peer;

    navigator.mediaDevices.getUserMedia({ video: type === "video", audio: true })
      .then((stream) => {
        myStreamRef.current = stream;
        if (myVideoRef.current) myVideoRef.current.srcObject = stream;
        
        const attachRemoteStream = (remoteStream: MediaStream) => {
          if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.onloadedmetadata = () => {
              remoteVideoRef.current?.play().catch(e => console.error("Play blocked:", e));
            };
          }
        };

        peer.on('open', (myPeerId) => {
          setStatus("Finding partner...");
          socket.emit("join-mode", type);
          
          socket.on("chat start", (partnerName) => {
            setStatus(`Connecting to ${partnerName}...`);
            // Add a tiny delay to ensure both peers are fully ready before signaling
            setTimeout(() => {
              socket.emit("signal", { peerId: myPeerId });
            }, 500);
          });

          // Initiator Logic
          socket.on("signal", (data) => {
            setStatus(`Call Connected`);
            const strangerPeerId = data.peerId;
            
            if (myPeerId > strangerPeerId) {
              const call = peer.call(strangerPeerId, stream);
              currentCall.current = call;
              call.on("stream", attachRemoteStream);
            }
          });
        });

        // Receiver Logic
        peer.on("call", (call) => {
          currentCall.current = call;
          call.answer(stream);
          call.on("stream", attachRemoteStream);
        });
      })
      .catch((err) => {
        setStatus("Error: Camera/Mic locked or denied.");
        console.error("Media Error:", err);
      });

    // Handle stranger leaving
    socket.on("partner disconnected", () => {
      setStatus("Partner left. Finding new...");
      if (currentCall.current) {
        currentCall.current.close();
        currentCall.current = null;
      }
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      socket.emit("join-mode", type);
    });

    // Safe Cleanup on unmount
    return () => {
      socket.emit("next"); 
      socket.off("chat start");
      socket.off("signal");
      socket.off("partner disconnected");
      
      if (currentCall.current) currentCall.current.close();
      peer.destroy();
      
      if (myStreamRef.current) {
        myStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [type]);

  const handleNext = () => {
    if (currentCall.current) {
      currentCall.current.close();
      currentCall.current = null;
    }
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    
    setStatus("Finding new partner...");
    socket.emit("next");              
    socket.emit("join-mode", type);   
  };

  return (
    <div className="chat-container">
      <div className="header">
        <div>
          <h2>{type === "video" ? "🎥 Video Call" : "📞 Audio Call"}</h2>
          <p className="sub">{username}</p>
        </div>
        <div className="right-header">
          <p style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#22c55e" }}>{status}</p>
          <button className="btn-danger" onClick={() => setMode("landing")}>Leave</button>
        </div>
      </div>
      
      <div className="video-grid">
        <div className="video-wrapper">
          <video ref={myVideoRef} autoPlay muted playsInline className="video-element" />
          <span className="video-label">You</span>
        </div>
        <div className="video-wrapper">
          <video ref={remoteVideoRef} autoPlay playsInline className="video-element" />
          <span className="video-label">Stranger</span>
        </div>
      </div>
      
      <div className="input-area" style={{ justifyContent: 'center' }}>
        <button className="btn-secondary" onClick={handleNext}>Skip to Next Person</button>
      </div>
    </div>
  );
}