interface MiniGamesProps {
  setMode: (mode: string) => void;
}

export default function MiniGamesMode({ setMode }: MiniGamesProps) {
  return (
    <div className="landing-container games-container">
      <div className="landing-header">
        <h1 className="logo">Mini<span>Games</span></h1>
        <p className="welcome-text">Pick something quick and play together.</p>
      </div>

      <div className="games-grid">
        <div className="action-card game-card tictactoe-card" onClick={() => setMode("tictactoe")}>
          <span className="card-icon">#</span>
          <div className="card-text">
            <h3>Tic Tac Toe</h3>
            <p>Real-time 1v1 board game</p>
          </div>
        </div>

        {/* ✏️ UNLOCKED: Drawing Guess Card */}
        <div className="action-card game-card drawing-card" onClick={() => setMode("drawing")}>
          <span className="card-icon">✏️</span>
          <div className="card-text">
            <h3>Drawing Guess</h3>
            <p>Sketch and solve!</p>
          </div>
        </div>

        <div className="action-card game-card disabled-card">
          <span className="card-icon">?</span>
          <div className="card-text">
            <h3>Quick Quiz</h3>
            <p>Coming soon</p>
          </div>
        </div>
      </div>

      <div className="game-footer-actions">
        <button className="btn-secondary" onClick={() => setMode("landing")}>Back</button>
      </div>
    </div>
  );
}