import { useEffect, useState, useRef } from "react";
import Peer, { type MediaConnection } from "peerjs";
import { socket } from "../socket";

interface CallProps {
  setMode: (mode: string) => void;
  username: string;
  type: "audio" | "video";
}

export default function CallMode({ setMode, username, type }: CallProps) {
  const [status, setStatus] = useState("Finding partner...");
  
  const myVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  
  const peerInstance = useRef<Peer | null>(null);
  const myStreamRef = useRef<MediaStream | null>(null);
  const currentCall = useRef<MediaConnection | null>(null);

  useEffect(() => {
    let mounted = true;

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

    const attachRemoteStream = (remoteStream: MediaStream) => {
      if (!mounted) return;
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject !== remoteStream) {
        remoteVideoRef.current.srcObject = remoteStream;
        
        // Attempt to play immediately and on metadata load
        remoteVideoRef.current.play().catch(e => console.error("Immediate play blocked:", e));
        
        remoteVideoRef.current.onloadedmetadata = () => {
          remoteVideoRef.current?.play().catch(e => console.error("Play blocked on metadata:", e));
        };
      }
    };

    // --- Socket Listeners Setup ---
    const handleChatStart = (partnerName: string) => {
      if (!mounted) return;
      setStatus(`Connecting to ${partnerName}...`);
      
      // Delay to ensure both peers are ready
      setTimeout(() => {
        if (mounted && peer.id) {
          socket.emit("signal", { peerId: peer.id });
        }
      }, 500);
    };

    const handleSignal = (data: { peerId: string }) => {
      if (!mounted) return;
      setStatus(`Call Connected`);
      const strangerPeerId = data.peerId;
      
      // Initiator Logic based on peerId comparison
      if (peer.id && peer.id > strangerPeerId && myStreamRef.current) {
        const call = peer.call(strangerPeerId, myStreamRef.current);
        currentCall.current = call;
        call.on("stream", attachRemoteStream);
      }
    };

    const handlePartnerDisconnected = () => {
      if (!mounted) return;
      setStatus("Partner left. Finding new...");
      if (currentCall.current) {
        currentCall.current.close();
        currentCall.current = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      socket.emit("join-mode", type);
    };

    const handleModerationNotice = (notice: string) => {
      if (!mounted) return;
      setStatus(notice);
    };

    const handleUserBlocked = (blockedName: string) => {
      if (!mounted) return;
      setStatus(`Blocked ${blockedName}. Finding new...`);
      if (currentCall.current) {
        currentCall.current.close();
        currentCall.current = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      socket.emit("join-mode", type);
    };

    // Register handlers without wiping others
    socket.on("chat start", handleChatStart);
    socket.on("signal", handleSignal);
    socket.on("partner disconnected", handlePartnerDisconnected);
    socket.on("moderation notice", handleModerationNotice);
    socket.on("user blocked", handleUserBlocked);

    // --- Media & WebRTC Setup ---
    navigator.mediaDevices.getUserMedia({ video: type === "video", audio: true })
      .then((stream) => {
        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        myStreamRef.current = stream;
        if (myVideoRef.current) {
          myVideoRef.current.srcObject = stream;
          myVideoRef.current.onloadedmetadata = () => {
            myVideoRef.current?.play().catch(e => console.error("Local play blocked:", e));
          };
        }

        peer.on('open', () => {
          if (!mounted) return;
          setStatus("Finding partner...");
          socket.emit("join-mode", type);
        });

        // Receiver Logic
        peer.on("call", (call) => {
          if (!mounted) return;
          currentCall.current = call;
          call.answer(stream);
          call.on("stream", attachRemoteStream);
        });
      })
      .catch((err) => {
        if (!mounted) return;
        setStatus("Error: Camera/Mic blocked or denied.");
        console.error("Media Error:", err);
      });

    // Cleanup
    return () => {
      mounted = false;
      socket.emit("next"); 
      
      // Target specific listener removal to avoid side-effects
      socket.off("chat start", handleChatStart);
      socket.off("signal", handleSignal);
      socket.off("partner disconnected", handlePartnerDisconnected);
      socket.off("moderation notice", handleModerationNotice);
      socket.off("user blocked", handleUserBlocked);
      
      if (currentCall.current) {
        currentCall.current.close();
      }
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
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    
    setStatus("Finding new partner...");
    socket.emit("next");              
    socket.emit("join-mode", type);   
  };

  const handleReport = () => {
    socket.emit("report-user", `Reported from ${type} call`);
    setStatus("Report submitted.");
  };

  const handleBlock = () => {
    socket.emit("block-user");
    setStatus("Blocking user...");
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
          <div className="moderation-actions">
            <button className="btn-secondary compact-btn" onClick={handleReport}>Report</button>
            <button className="btn-secondary compact-btn" onClick={handleBlock}>Block</button>
            <button className="btn-danger compact-btn" onClick={() => setMode("landing")}>Leave</button>
          </div>
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
