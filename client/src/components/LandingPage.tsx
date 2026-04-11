interface LandingProps {
  setMode: (mode: string) => void;
  onlineUsers: number;
  username: string;
}

export default function LandingPage({ setMode, onlineUsers, username }: LandingProps) {
  return (
    <div className="landing-container">
      
      <div className="landing-header">
        <h1 className="logo">MystroChat ⚡</h1>
        <p className="welcome-text">Welcome, <b>{username}</b></p>
        
        <div className="stats-badge">
          <span className="pulse-dot"></span>
          {onlineUsers} users online
        </div>
      </div>

      <div className="action-grid">
        <div className="action-card chat-card" onClick={() => setMode("chat")}>
          <span className="card-icon">💬</span>
          <div className="card-text">
            <h3>1-on-1 Chat</h3>
            <p>Talk to a random stranger</p>
          </div>
        </div>

        <div className="action-card room-card" onClick={() => setMode("room")}>
          <span className="card-icon">🌍</span>
          <div className="card-text">
            <h3>Global Room</h3>
            <p>Hang out with everyone</p>
          </div>
        </div>

        <div className="action-card audio-card" onClick={() => setMode("audio")}>
          <span className="card-icon">📞</span>
          <div className="card-text">
            <h3>Audio Call</h3>
            <p>Voice chat anonymously</p>
          </div>
        </div>

        <div className="action-card video-card" onClick={() => setMode("video")}>
          <span className="card-icon">🎥</span>
          <div className="card-text">
            <h3>Video Call</h3>
            <p>Face-to-face random chat</p>
          </div>
        </div>
      </div>
      
    </div>
  );
}