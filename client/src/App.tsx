import { useEffect, useState } from "react";
import { socket } from "./socket";
import LandingPage from "./components/LandingPage";
import ChatMode from "./components/ChatMode";
import GlobalRoomMode from "./components/GlobalRoomMode";
import CallMode from "./components/CallMode";
import MiniGamesMode from "./components/MiniGamesMode";
import TicTacToeMode from "./components/TicTacToeMode";
import DrawingGuessMode from "./components/DrawingGuessMode"; // NEW IMPORT
import "./App.css";

function App() {
  const [mode, setMode] = useState<string>("landing"); 
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [username, setUsername] = useState("");

  useEffect(() => {
    socket.on("online users", (count: number) => setOnlineUsers(count));
    socket.on("your name", (name: string) => setUsername(name));
    socket.connect();

    // 👻 THE GHOST KILLER: Instantly drop socket if user refreshes/closes the tab
    const handleUnload = () => socket.disconnect();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      socket.off("online users");
      socket.off("your name");
      window.removeEventListener("beforeunload", handleUnload);
      socket.disconnect();
    };
  }, []);

  return (
    <div className="app">
      {mode === "landing" && <LandingPage setMode={setMode} onlineUsers={onlineUsers} username={username} />}
      {mode === "chat" && <ChatMode setMode={setMode} username={username} />}
      {mode === "room" && <GlobalRoomMode setMode={setMode} username={username} />}
      {mode === "video" && <CallMode setMode={setMode} username={username} type="video" />}
      {mode === "audio" && <CallMode setMode={setMode} username={username} type="audio" />}
      {mode === "games" && <MiniGamesMode setMode={setMode} />}
      {mode === "tictactoe" && <TicTacToeMode setMode={setMode} username={username} />}
      {mode === "drawing" && <DrawingGuessMode setMode={setMode} username={username} />}
    </div>
  );
}

export default App;