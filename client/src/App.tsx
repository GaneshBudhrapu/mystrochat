import { useEffect, useState, useRef } from "react";
import { socket } from "./socket";
import "./App.css";

function App() {
  const [status, setStatus] = useState("Connecting...");
  const [messages, setMessages] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(0);
  const [username, setUsername] = useState("");

  const chatRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.on("waiting", () => setStatus("Waiting for partner..."));

    socket.on("chat start", () => {
      setStatus("Connected");
      setMessages([]);
    });

    socket.on("message", (msg: string) => {
      setMessages((prev) => [...prev, "Stranger: " + msg]);
      setIsTyping(false);
    });

    socket.on("partner disconnected", () => {
      setStatus("Stranger disconnected...");
    });

    socket.on("typing", () => {
      setIsTyping(true);
      setTimeout(() => setIsTyping(false), 1200);
    });

    // 🆕 Online users
    socket.on("online users", (count: number) => {
      setOnlineUsers(count);
    });

    // 🆕 Username
    socket.on("your name", (name: string) => {
      setUsername(name);
    });

    return () => {
      socket.off();
    };
  }, []);

  useEffect(() => {
    chatRef.current?.scrollTo({
      top: chatRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isTyping]);

  const sendMessage = () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, "You: " + input]);
    socket.emit("message", input);
    setInput("");
  };

  const nextUser = () => {
    socket.emit("next");
    setMessages([]);
    setStatus("Finding new user...");
  };

  return (
    <div className="app">
      <div className="chat-container">
        {/* Header */}
        <div className="header">
          <div>
            <h2>MystroChat</h2>
            <p className="sub">{username}</p>
          </div>

          <div className="right">
            <span>{status}</span>
            <span className="online">{onlineUsers} online</span>
          </div>
        </div>

        {/* Chat */}
        <div className="chat-box" ref={chatRef}>
          {messages.map((msg, i) => {
            const isYou = msg.startsWith("You:");
            return (
              <div key={i} className={isYou ? "msg you" : "msg stranger"}>
                {msg.replace("You: ", "").replace("Stranger: ", "")}
              </div>
            );
          })}

          {isTyping && (
            <div className="msg stranger typing">Typing...</div>
          )}
        </div>

        {/* Input */}
        <div className="input-area">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              socket.emit("typing");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Type a message..."
          />

          <button onClick={sendMessage}>Send</button>
          <button onClick={nextUser}>Next</button>
        </div>
      </div>
    </div>
  );
}

export default App;