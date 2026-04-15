import { useEffect, useState, useRef } from "react";
import { socket } from "../socket";

interface ChatProps {
  setMode: (mode: string) => void;
  username: string;
}

type ChatMessage = {
  sender: "you" | "stranger";
  kind: "text" | "image" | "gif";
  content: string;
};

type IncomingMessage = string | {
  kind?: "text" | "image" | "gif";
  content?: string;
};

export default function ChatMode({ setMode, username }: ChatProps) {
  const [status, setStatus] = useState("Connecting...");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // 1. Join the queue on load
    socket.emit("join-mode", "chat");

    socket.on("waiting", () => setStatus("Waiting for partner..."));
    
    socket.on("chat start", (partnerName) => {
      setStatus(`Connected to ${partnerName}`);
      setMessages([]); 
    });

    socket.on("message", (msg: IncomingMessage) => {
      const incoming =
        typeof msg === "string"
          ? { kind: "text" as const, content: msg }
          : { kind: msg.kind ?? "text", content: msg.content ?? "" };

      if (!incoming.content.trim()) return;
      setMessages((prev) => [...prev, { sender: "stranger", ...incoming }]);
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
    const message: ChatMessage = { sender: "you", kind: "text", content: input.trim() };
    setMessages((prev) => [...prev, message]);
    socket.emit("message", { kind: message.kind, content: message.content });
    setInput("");
  };

  const sendMediaMessage = (kind: "image" | "gif", content: string) => {
    const cleanContent = content.trim();
    if (!cleanContent) return;

    const message: ChatMessage = { sender: "you", kind, content: cleanContent };
    setMessages((prev) => [...prev, message]);
    socket.emit("message", { kind, content: cleanContent });
  };

  const handleImagePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setStatus("Please choose an image file.");
      event.target.value = "";
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      setStatus("Image is too large. Pick one under 2 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        sendMediaMessage("image", reader.result);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleGif = () => {
    const gifUrl = window.prompt("Paste a GIF link");
    if (!gifUrl) return;
    sendMediaMessage("gif", gifUrl);
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
          return (
            <div key={i} className={msg.sender === "you" ? "msg you" : "msg stranger"}>
              {msg.kind === "text" ? (
                msg.content
              ) : (
                <img
                  className="chat-media"
                  src={msg.content}
                  alt={msg.kind === "gif" ? "Shared GIF" : "Shared image"}
                  loading="lazy"
                />
              )}
            </div>
          );
        })}
        {isTyping && <div className="msg stranger typing">Typing...</div>}
      </div>

      <div className="input-area chat-input-area">
        <div className="media-actions" aria-label="Message extras">
          <button className="icon-btn" onClick={() => imageInputRef.current?.click()} aria-label="Send image">
            IMG
          </button>
          <button className="icon-btn" onClick={handleGif} aria-label="Send GIF">
            GIF
          </button>
          <input
            ref={imageInputRef}
            className="hidden-file-input"
            type="file"
            accept="image/*"
            onChange={handleImagePick}
          />
        </div>
        <div className="message-composer">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              socket.emit("typing");
            }}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            placeholder="Type a message..."
          />
          <button className="send-btn" onClick={sendMessage}>Send</button>
          <button className="btn-secondary next-btn" onClick={handleNext}>Next</button>
        </div>
      </div>
    </div>
  );
}
