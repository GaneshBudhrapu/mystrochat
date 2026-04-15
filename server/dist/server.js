"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const PORT = process.env.PORT || 3000;
// ✅ Create HTTP server
const httpServer = (0, http_1.createServer)();
// ✅ Attach socket.io
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
    },
});
httpServer.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
// 🧠 Store waiting users for different modes
let waitingChat = null;
let waitingAudio = null;
let waitingVideo = null;
// 🧠 Online users count
let onlineUsers = 0;
// 🎮 Pokémon names
const names = [
    "Pikachu", "Charizard", "Bulbasaur", "Squirtle",
    "Eevee", "Snorlax", "Gengar", "Lucario",
    "Greninja", "Mewtwo", "Dragonite", "Blaziken"
];
// 🎲 Random username generator
function getRandomName() {
    return names[Math.floor(Math.random() * names.length)];
}
// 🧹 Helper Function: Safely disconnect user from current match or queue
function leaveCurrentMatch(socket) {
    if (waitingChat === socket)
        waitingChat = null;
    if (waitingAudio === socket)
        waitingAudio = null;
    if (waitingVideo === socket)
        waitingVideo = null;
    if (socket.data.partner) {
        socket.data.partner.emit("partner disconnected");
        socket.data.partner.data.partner = null;
        socket.data.partner = null;
    }
}
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    // ✅ Increase online users & assign name
    onlineUsers++;
    const username = getRandomName() + "#" + Math.floor(Math.random() * 1000);
    socket.data.username = username;
    socket.emit("your name", username);
    io.emit("online users", onlineUsers);
    // 🎯 MULTI-MODE MATCHMAKING (Chat, Audio, Video)
    socket.on("join-mode", (mode) => {
        leaveCurrentMatch(socket);
        socket.leave("global_room"); // Ensure they aren't in the global room
        let partner = null;
        if (mode === "chat") {
            if (waitingChat && waitingChat !== socket) {
                partner = waitingChat;
                waitingChat = null;
            }
            else {
                waitingChat = socket;
            }
        }
        else if (mode === "audio") {
            if (waitingAudio && waitingAudio !== socket) {
                partner = waitingAudio;
                waitingAudio = null;
            }
            else {
                waitingAudio = socket;
            }
        }
        else if (mode === "video") {
            if (waitingVideo && waitingVideo !== socket) {
                partner = waitingVideo;
                waitingVideo = null;
            }
            else {
                waitingVideo = socket;
            }
        }
        if (partner) {
            socket.data.partner = partner;
            partner.data.partner = socket;
            // Send partners their respective names
            socket.emit("chat start", partner.data.username);
            partner.emit("chat start", socket.data.username);
        }
        else {
            socket.emit("waiting");
        }
    });
    // 🌍 GLOBAL CHAT ROOM
    socket.on("join-global-room", () => {
        leaveCurrentMatch(socket);
        socket.join("global_room");
    });
    socket.on("send-global-msg", (msg) => {
        // Broadcast message to everyone in the global room
        io.to("global_room").emit("receive-global-msg", {
            text: msg,
            sender: socket.data.username
        });
    });
    // 💬 COMMON ACTIONS (1-on-1 Messages & Typing)
    socket.on("message", (msg) => {
        socket.data.partner?.emit("message", msg);
    });
    socket.on("typing", () => {
        socket.data.partner?.emit("typing");
    });
    // 🔁 NEXT USER
    socket.on("next", () => {
        leaveCurrentMatch(socket);
        // Frontend will handle automatically re-emitting "join-mode"
    });
    // 📡 WEBRTC SIGNALING (For Audio/Video)
    socket.on("signal", (data) => {
        socket.data.partner?.emit("signal", data);
    });
    // ❌ DISCONNECT
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        onlineUsers--;
        io.emit("online users", onlineUsers);
        leaveCurrentMatch(socket);
    });
});
