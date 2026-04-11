import { useEffect, useState, useRef } from "react";
import { socket } from "../socket";

interface GlobalRoomProps {
  setMode: (mode: string) => void;
  username: string;
}

interface RoomMessage {
  sender: string;
  text: string;
}

export default function GlobalRoomMode({ setMode, username }: GlobalRoomProps) {
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [input, setInput] = useState("");
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.emit("join-global-room");
    socket.on("receive-global-msg", (data: RoomMessage) => {
      setMessages((prev) => [...prev, data]);
    });
    return () => { socket.off("receive-global-msg"); };
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    socket.emit("send-global-msg", input);
    setInput("");
  };

  return (
    <div className="chat-container">
      <div className="header">
        <div>
          <h2>🌍 Global Chat Room</h2>
          <p className="sub">{username}</p>
        </div>
        <div className="right-header">
          <button className="btn-danger" onClick={() => setMode("landing")}>Leave Room</button>
        </div>
      </div>

      <div className="chat-box" ref={chatRef}>
        {messages.map((msg, i) => {
          const isYou = msg.sender === username;
          return (
            <div key={i} className={isYou ? "msg you" : "msg stranger"}>
              {!isYou && <span style={{display: 'block', marginBottom: '4px', opacity: 0.7, fontWeight: 'bold', fontSize: '11px'}}>{msg.sender}</span>}
              {msg.text}
            </div>
          );
        })}
      </div>

      <div className="input-area">
        <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendMessage()} placeholder="Message everyone..." />
        <button onClick={sendMessage}>Send</button>
      </div>
    </div>
  );
}