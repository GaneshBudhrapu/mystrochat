"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const PORT = process.env.PORT || 3000;
const httpServer = (0, http_1.createServer)();
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
    },
});
httpServer.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
const waitingQueues = {
    chat: [],
    audio: [],
    video: [],
};
const reports = new Map();
let onlineUsers = 0;
const names = [
    "Pikachu", "Charizard", "Bulbasaur", "Squirtle",
    "Eevee", "Snorlax", "Gengar", "Lucario",
    "Greninja", "Mewtwo", "Dragonite", "Blaziken"
];
const abusiveWords = [
    "abuse",
    "badword",
    "bastard",
    "bitch",
    "damn",
    "fuck",
    "idiot",
    "moron",
    "stupid",
    "shit",
];
function getRandomName() {
    return names[Math.floor(Math.random() * names.length)];
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function filterProfanity(text) {
    let filtered = text;
    let changed = false;
    for (const word of abusiveWords) {
        const pattern = new RegExp(`\\b${escapeRegExp(word)}\\b`, "gi");
        filtered = filtered.replace(pattern, (match) => {
            changed = true;
            return "*".repeat(Math.max(match.length, 3));
        });
    }
    return { filtered, changed };
}
function filterMessagePayload(payload) {
    if (typeof payload === "string") {
        const result = filterProfanity(payload);
        return { payload: result.filtered, changed: result.changed };
    }
    if (payload.kind === "text" && typeof payload.content === "string") {
        const result = filterProfanity(payload.content);
        return {
            payload: { ...payload, content: result.filtered },
            changed: result.changed,
        };
    }
    return { payload, changed: false };
}
function removeFromQueues(socket) {
    for (const mode of Object.keys(waitingQueues)) {
        waitingQueues[mode] = waitingQueues[mode].filter((waitingSocket) => waitingSocket !== socket);
    }
}
function getBlockedUsers(socket) {
    return socket.data.blockedUsers;
}
function usersCanMatch(first, second) {
    const firstUserId = first.data.userId;
    const secondUserId = second.data.userId;
    return (!getBlockedUsers(first).has(secondUserId) &&
        !getBlockedUsers(second).has(firstUserId));
}
function findPartner(socket, mode) {
    const queue = waitingQueues[mode];
    for (let index = 0; index < queue.length; index++) {
        const candidate = queue[index];
        if (!candidate.connected || candidate === socket || candidate.data.partner) {
            queue.splice(index, 1);
            index--;
            continue;
        }
        if (!usersCanMatch(socket, candidate)) {
            continue;
        }
        queue.splice(index, 1);
        return candidate;
    }
    return null;
}
function addToQueue(socket, mode) {
    const queue = waitingQueues[mode];
    if (!queue.includes(socket)) {
        queue.push(socket);
    }
}
function leaveCurrentMatch(socket) {
    removeFromQueues(socket);
    const partner = socket.data.partner;
    if (partner) {
        partner.emit("partner disconnected");
        partner.data.partner = null;
        socket.data.partner = null;
    }
}
function applyModerationMiddleware(socket) {
    socket.use((packet, next) => {
        const [eventName] = packet;
        if (eventName === "message") {
            const result = filterMessagePayload(packet[1]);
            packet[1] = result.payload;
            if (result.changed) {
                socket.emit("moderation notice", "Abusive words were filtered.");
            }
        }
        if (eventName === "send-global-msg" && typeof packet[1] === "string") {
            const result = filterProfanity(packet[1]);
            packet[1] = result.filtered;
            if (result.changed) {
                socket.emit("moderation notice", "Abusive words were filtered.");
            }
        }
        next();
    });
}
io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    onlineUsers++;
    const username = getRandomName() + "#" + Math.floor(Math.random() * 1000);
    socket.data.userId = socket.id;
    socket.data.username = username;
    socket.data.blockedUsers = new Set();
    socket.data.partner = null;
    applyModerationMiddleware(socket);
    socket.emit("your name", username);
    io.emit("online users", onlineUsers);
    socket.on("join-mode", (mode) => {
        leaveCurrentMatch(socket);
        socket.leave("global_room");
        const partner = findPartner(socket, mode);
        if (partner) {
            socket.data.partner = partner;
            partner.data.partner = socket;
            socket.emit("chat start", partner.data.username);
            partner.emit("chat start", socket.data.username);
            return;
        }
        addToQueue(socket, mode);
        socket.emit("waiting");
    });
    socket.on("join-global-room", () => {
        leaveCurrentMatch(socket);
        socket.join("global_room");
    });
    socket.on("send-global-msg", (msg) => {
        io.to("global_room").emit("receive-global-msg", {
            text: msg,
            sender: socket.data.username
        });
    });
    socket.on("message", (msg) => {
        socket.data.partner?.emit("message", msg);
    });
    socket.on("typing", () => {
        socket.data.partner?.emit("typing");
    });
    socket.on("next", () => {
        leaveCurrentMatch(socket);
    });
    socket.on("report-user", (reason = "No reason provided") => {
        const partner = socket.data.partner;
        if (!partner) {
            socket.emit("moderation notice", "No active user to report.");
            return;
        }
        const targetId = partner.data.userId;
        const targetReports = reports.get(targetId) ?? [];
        targetReports.push({
            reporterId: socket.data.userId,
            reporterName: socket.data.username,
            reason: String(reason).slice(0, 200),
            createdAt: new Date().toISOString(),
        });
        reports.set(targetId, targetReports);
        console.log("User reported:", {
            target: partner.data.username,
            totalReports: targetReports.length,
            reason,
        });
        socket.emit("moderation notice", "Report submitted. Thanks for helping keep MystroChat safer.");
    });
    socket.on("block-user", () => {
        const partner = socket.data.partner;
        if (!partner) {
            socket.emit("moderation notice", "No active user to block.");
            return;
        }
        getBlockedUsers(socket).add(partner.data.userId);
        socket.emit("user blocked", partner.data.username);
        leaveCurrentMatch(socket);
    });
    socket.on("signal", (data) => {
        socket.data.partner?.emit("signal", data);
    });
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        onlineUsers--;
        io.emit("online users", onlineUsers);
        leaveCurrentMatch(socket);
    });
});
