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

const makeSticker = (label: string, bg: string, accent: string) => {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="220" height="220" viewBox="0 0 220 220">
      <rect width="220" height="220" rx="44" fill="${bg}"/>
      <path d="M166 20h18c8.8 0 16 7.2 16 16v18l-34-34Z" fill="${accent}" opacity=".9"/>
      <circle cx="68" cy="76" r="14" fill="white" opacity=".92"/>
      <circle cx="152" cy="76" r="14" fill="white" opacity=".92"/>
      <path d="M70 132c22 24 58 24 80 0" fill="none" stroke="white" stroke-width="13" stroke-linecap="round"/>
      <text x="110" y="190" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800" fill="white">${label}</text>
    </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const stickers = [
  { label: "LOL", src: makeSticker("LOL", "#14b8a6", "#f43f5e") },
  { label: "HI", src: makeSticker("HI", "#0f172a", "#22c55e") },
  { label: "WOW", src: makeSticker("WOW", "#7c2d12", "#f59e0b") },
  { label: "GG", src: makeSticker("GG", "#312e81", "#38bdf8") },
];

function GalleryIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
      <circle cx="8.5" cy="9" r="1.6" />
      <path d="M5.5 17l4.4-4.4 3.1 3.1 2.1-2.1 3.4 3.4" />
    </svg>
  );
}

function StickerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="action-icon">
      <path d="M6.5 3.8h8.7L20.2 9v8.5a2.7 2.7 0 0 1-2.7 2.7h-11a2.7 2.7 0 0 1-2.7-2.7v-11a2.7 2.7 0 0 1 2.7-2.7Z" />
      <path d="M15 4v3.2A1.8 1.8 0 0 0 16.8 9H20" />
      <path d="M8 13.5c1.9 2.1 5.9 2.1 8 0" />
      <circle cx="9" cy="10" r=".8" />
      <circle cx="15" cy="10" r=".8" />
    </svg>
  );
}

export default function ChatMode({ setMode, username }: ChatProps) {
  const [status, setStatus] = useState("Connecting...");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [showStickerTray, setShowStickerTray] = useState(false);
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

    socket.on("moderation notice", (notice: string) => {
      setStatus(notice);
    });

    socket.on("user blocked", (blockedName: string) => {
      setMessages([]);
      setStatus(`Blocked ${blockedName}. Finding new user...`);
      socket.emit("join-mode", "chat");
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
      socket.off("moderation notice");
      socket.off("user blocked");
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
    const gifUrl = window.prompt("Paste a GIF link or pick a sticker below");
    if (!gifUrl) return;
    sendMediaMessage("gif", gifUrl);
  };

  const sendSticker = (src: string) => {
    sendMediaMessage("gif", src);
    setShowStickerTray(false);
  };

  const handleNext = () => {
    socket.emit("next");              // Tell server to drop partner
    socket.emit("join-mode", "chat"); // 🐛 BUG 1 FIX: Re-join the queue!
    setMessages([]);
    setStatus("Finding new user...");
  };

  const handleReport = () => {
    socket.emit("report-user", "Reported from 1-on-1 chat");
    setStatus("Report submitted.");
  };

  const handleBlock = () => {
    socket.emit("block-user");
    setMessages([]);
    setStatus("Blocking user...");
  };

  return (
    <div className="chat-container">
      <div className="header">
        <div>
          <h2>💬 1-on-1 Chat</h2>
          <p className="sub">{username}</p>
          {isTyping && <p className="typing-status">Typing...</p>}
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

      <div className="chat-box" ref={chatRef}>
        {messages.map((msg, i) => {
          const messageClass = [
            "msg",
            msg.sender === "you" ? "you" : "stranger",
            msg.kind !== "text" ? "media-msg" : "",
          ].filter(Boolean).join(" ");

          return (
            <div key={i} className={messageClass}>
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
      </div>

      <div className="input-area chat-input-area">
        <div className="media-actions" aria-label="Message extras">
          <button className="icon-btn" onClick={() => imageInputRef.current?.click()} aria-label="Send image">
            <GalleryIcon />
          </button>
          <button
            className="icon-btn"
            onClick={() => setShowStickerTray((isOpen) => !isOpen)}
            onDoubleClick={handleGif}
            aria-label="Open stickers"
            aria-expanded={showStickerTray}
          >
            <StickerIcon />
          </button>
          {showStickerTray && (
            <div className="sticker-tray" aria-label="Sticker picker">
              <div className="sticker-tray-header">
                <span>Stickers</span>
                <button className="sticker-link-btn" onClick={handleGif}>GIF URL</button>
              </div>
              <div className="sticker-grid">
                {stickers.map((sticker) => (
                  <button
                    className="sticker-option"
                    key={sticker.label}
                    onClick={() => sendSticker(sticker.src)}
                    aria-label={`Send ${sticker.label} sticker`}
                  >
                    <img src={sticker.src} alt="" />
                  </button>
                ))}
              </div>
            </div>
          )}
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
