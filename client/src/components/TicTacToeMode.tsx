import { useEffect, useMemo, useState } from "react";
import { socket } from "../socket";

interface TicTacToeProps {
  setMode: (mode: string) => void;
  username: string;
}

type TicTacToeCell = "X" | "O" | null;
type TicTacToeStatus = "waiting" | "playing" | "finished";
type TicTacToePlayer = {
  id: string;
  name: string;
  symbol: "X" | "O";
};
type TicTacToeState = {
  id: string;
  board: TicTacToeCell[];
  turn: "X" | "O";
  status: TicTacToeStatus;
  winner: "X" | "O" | "draw" | null;
  players: TicTacToePlayer[];
};

export default function TicTacToeMode({ setMode, username }: TicTacToeProps) {
  const [game, setGame] = useState<TicTacToeState | null>(null);
  const [status, setStatus] = useState("Finding opponent...");

  useEffect(() => {
    socket.emit("join-tictactoe");

    socket.on("tictactoe-waiting", () => {
      setStatus("Waiting for another player...");
      setGame(null);
    });

    socket.on("tictactoe-state", (nextGame: TicTacToeState) => {
      setGame(nextGame);
      setStatus("Game started");
    });

    socket.on("tictactoe-ended", (message: string) => {
      setStatus(message);
      setGame(null);
    });

    return () => {
      socket.emit("leave-tictactoe");
      socket.off("tictactoe-waiting");
      socket.off("tictactoe-state");
      socket.off("tictactoe-ended");
    };
  }, []);

  const me = useMemo(() => {
    if (!game) return null;
    return game.players.find((player) => player.id === socket.id) ?? null;
  }, [game]);

  const opponent = useMemo(() => {
    if (!game || !me) return null;
    return game.players.find((player) => player.id !== me.id) ?? null;
  }, [game, me]);

  const statusText = useMemo(() => {
    if (!game) return status;
    if (game.winner === "draw") return "Draw. Nobody gets bragging rights.";
    if (game.winner) return game.winner === me?.symbol ? "You won." : "Opponent won.";
    return game.turn === me?.symbol ? "Your turn" : "Opponent turn";
  }, [game, me?.symbol, status]);

  const playMove = (index: number) => {
    if (!game || game.status !== "playing") return;
    if (game.turn !== me?.symbol) return;
    if (game.board[index]) return;
    socket.emit("tictactoe-move", index);
  };

  const restart = () => {
    socket.emit("tictactoe-restart");
  };

  const leave = () => {
    socket.emit("leave-tictactoe");
    setMode("games");
  };

  return (
    <div className="chat-container game-room-container">
      <div className="header">
        <div>
          <h2>Tic Tac Toe</h2>
          <p className="sub">{username}</p>
        </div>
        <div className="right-header">
          <p className="game-status">{statusText}</p>
          <div className="moderation-actions">
            <button className="btn-secondary compact-btn" onClick={restart} disabled={!game}>Restart</button>
            <button className="btn-danger compact-btn" onClick={leave}>Leave</button>
          </div>
        </div>
      </div>

      <div className="game-stage">
        <div className="players-strip">
          <div className="player-pill active-player">
            <span>You</span>
            <strong>{me?.symbol ?? "-"}</strong>
          </div>
          <div className="player-pill">
            <span>{opponent?.name ?? "Waiting..."}</span>
            <strong>{opponent?.symbol ?? "-"}</strong>
          </div>
        </div>

        <div className="tictactoe-board" aria-label="Tic Tac Toe board">
          {(game?.board ?? Array<TicTacToeCell>(9).fill(null)).map((cell, index) => (
            <button
              className="tictactoe-cell"
              key={index}
              onClick={() => playMove(index)}
              disabled={!game || game.status !== "playing" || game.turn !== me?.symbol || Boolean(cell)}
              aria-label={`Cell ${index + 1}`}
            >
              {cell}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
