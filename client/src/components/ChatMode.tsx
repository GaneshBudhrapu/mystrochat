import { useEffect, useState, useRef } from "react";
import { socket } from "../socket";

interface ChatProps {
  setMode: (mode: string) => void;
  username: string;
}

export default function ChatMode({ setMode, username }: ChatProps) {
  const [status, setStatus] = useState("Connecting...");
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 1. Join the queue on load
    socket.emit("join-mode", "chat");

    socket.on("waiting", () => setStatus("Waiting for partner..."));
    
    socket.on("chat start", (partnerName) => {
      setStatus(`Connected to ${partnerName}`);
      setMessages([]); 
    });

    socket.on("message", (msg: string) => {
      setMessages((prev) => [...prev, `Stranger: ${msg}`]);
      setIsTyping(false);
    });

    // 🐛 THE FIX: Auto-rejoin the queue if the stranger leaves
    socket.on("partner disconnected", () => {
      setStatus("Stranger disconnected... Finding new partner...");
      socket.emit("join-mode", "chat"); 
    });

    socket.on("typing", () => {
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 1200);
    });

    return () => {
      // 👻 BUG 2 FIX: Tell server we left so we don't become a "Ghost"
      socket.emit("next"); 
      
      // Cleanup listeners
      socket.off("waiting");
      socket.off("chat start");
      socket.off("message");
      socket.off("partner disconnected");
      socket.off("typing");
    };
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  const sendMessage = () => {
    if (!input.trim()) return;
    setMessages((prev) => [...prev, `You: ${input}`]);
    socket.emit("message", input);
    setInput("");
  };

  const handleNext = () => {
    socket.emit("next");              // Tell server to drop partner
    socket.emit("join-mode", "chat"); // 🐛 BUG 1 FIX: Re-join the queue!
    setMessages([]);
    setStatus("Finding new user...");
  };

  return (
    <div className="chat-container">
      <div className="header">
        <div>
          <h2>💬 1-on-1 Chat</h2>
          <p className="sub">{username}</p>
        </div>
        <div className="right-header">
          <p style={{ margin: "0 0 8px 0", fontSize: "14px", color: "#22c55e" }}>{status}</p>
          <button className="btn-danger" onClick={() => setMode("landing")}>Leave</button>
        </div>
      </div>

      <div className="chat-box" ref={chatRef}>
        {messages.map((msg, i) => {
          const isYou = msg.startsWith("You:");
          return (
            <div key={i} className={isYou ? "msg you" : "msg stranger"}>
              {msg.replace("You: ", "").replace("Stranger: ", "")}
            </div>
          );
        })}
        {isTyping && <div className="msg stranger typing">Typing...</div>}
      </div>

      <div className="input-area">
        <input
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            socket.emit("typing");
          }}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          placeholder="Type a message..."
        />
        <button onClick={sendMessage}>Send</button>
        <button className="btn-secondary" onClick={handleNext}>Next</button>
      </div>
    </div>
  );
}