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
const ticTacToeGames = new Map();
let waitingTicTacToe = null;
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
function serializeTicTacToe(game) {
    return {
        id: game.id,
        board: game.board,
        turn: game.turn,
        status: game.status,
        winner: game.winner,
        players: game.players.filter((playerId) => Boolean(playerId)).map((playerId) => ({
            id: playerId,
            name: game.names[playerId],
            symbol: game.symbols[playerId],
        })),
    };
}
function getTicTacToeWinner(board) {
    const lines = [
        [0, 1, 2], [3, 4, 5], [6, 7, 8],
        [0, 3, 6], [1, 4, 7], [2, 5, 8],
        [0, 4, 8], [2, 4, 6],
    ];
    for (const [first, second, third] of lines) {
        const value = board[first];
        if (value && value === board[second] && value === board[third]) {
            return value;
        }
    }
    return board.every(Boolean) ? "draw" : null;
}
function emitTicTacToeState(game) {
    io.to(game.id).emit("tictactoe-state", serializeTicTacToe(game));
}
function leaveTicTacToe(socket) {
    if (waitingTicTacToe === socket) {
        waitingTicTacToe = null;
    }
    const gameId = socket.data.ticTacToeGameId;
    if (!gameId)
        return;
    const game = ticTacToeGames.get(gameId);
    socket.leave(gameId);
    socket.data.ticTacToeGameId = null;
    if (!game)
        return;
    const opponentId = game.players.find((playerId) => playerId && playerId !== socket.id);
    ticTacToeGames.delete(gameId);
    if (opponentId) {
        io.to(opponentId).emit("tictactoe-ended", "Opponent left the game.");
        const opponentSocket = io.sockets.sockets.get(opponentId);
        if (opponentSocket) {
            opponentSocket.leave(gameId);
            opponentSocket.data.ticTacToeGameId = null;
        }
    }
}
function startTicTacToeGame(first, second) {
    const gameId = `tictactoe:${first.id}:${second.id}:${Date.now()}`;
    const game = {
        id: gameId,
        players: [first.id, second.id],
        names: {
            [first.id]: first.data.username,
            [second.id]: second.data.username,
        },
        symbols: {
            [first.id]: "X",
            [second.id]: "O",
        },
        board: Array(9).fill(null),
        turn: "X",
        status: "playing",
        winner: null,
    };
    ticTacToeGames.set(gameId, game);
    first.data.ticTacToeGameId = gameId;
    second.data.ticTacToeGameId = gameId;
    first.join(gameId);
    second.join(gameId);
    emitTicTacToeState(game);
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
        leaveTicTacToe(socket);
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
        leaveTicTacToe(socket);
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
    socket.on("join-tictactoe", () => {
        leaveCurrentMatch(socket);
        leaveTicTacToe(socket);
        socket.leave("global_room");
        if (waitingTicTacToe && waitingTicTacToe.connected && waitingTicTacToe !== socket) {
            const opponent = waitingTicTacToe;
            waitingTicTacToe = null;
            startTicTacToeGame(opponent, socket);
            return;
        }
        waitingTicTacToe = socket;
        socket.emit("tictactoe-waiting");
    });
    socket.on("tictactoe-move", (cellIndex) => {
        const gameId = socket.data.ticTacToeGameId;
        if (!gameId)
            return;
        const game = ticTacToeGames.get(gameId);
        if (!game || game.status !== "playing")
            return;
        const symbol = game.symbols[socket.id];
        if (!symbol || game.turn !== symbol)
            return;
        if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8)
            return;
        if (game.board[cellIndex])
            return;
        game.board[cellIndex] = symbol;
        const winner = getTicTacToeWinner(game.board);
        if (winner) {
            game.winner = winner;
            game.status = "finished";
        }
        else {
            game.turn = symbol === "X" ? "O" : "X";
        }
        emitTicTacToeState(game);
    });
    socket.on("tictactoe-restart", () => {
        const gameId = socket.data.ticTacToeGameId;
        if (!gameId)
            return;
        const game = ticTacToeGames.get(gameId);
        if (!game)
            return;
        game.board = Array(9).fill(null);
        game.turn = "X";
        game.status = "playing";
        game.winner = null;
        emitTicTacToeState(game);
    });
    socket.on("leave-tictactoe", () => {
        leaveTicTacToe(socket);
    });
    socket.on("disconnect", () => {
        console.log("User disconnected:", socket.id);
        onlineUsers--;
        io.emit("online users", onlineUsers);
        leaveTicTacToe(socket);
        leaveCurrentMatch(socket);
    });
});
