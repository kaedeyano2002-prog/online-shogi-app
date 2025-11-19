// server.js (ロビー機能の核となる部分の完全版)

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
// ⚠️ CORS設定は開発環境に合わせて調整してください
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } }); 

// 静的ファイルの提供設定（例: publicディレクトリのファイルを公開）
// app.use(express.static('public')); 

// --- サーバー側のグローバル状態 ---
let players = {}; // { socketId: { id, name, timeLimit, persistentId } }
let rooms = {};   // { roomId: { P1: socketId, P2: socketId, board, hands, timeLimit, ... } }

// --- ヘルパー関数 ---

// 💡 プレイヤーリストを全クライアントにブロードキャストする関数
function sendLobbyUpdate(targetSocket = io) {
    // 公開可能なプレイヤーデータのみを抽出
    const publicPlayers = Object.values(players).map(p => ({
        id: p.id,
        name: p.name,
        timeLimit: p.timeLimit
    }));
    
    // targetSocketがioの場合は全員に、socketの場合はそのクライアントのみに送信
    targetSocket.emit('update_lobby', publicPlayers);
}

// 💡 サーバー側の初期盤面生成関数 (簡易版)
function initializeBoard() {
    return [
        ['l', 'n', 's', 'g', 'k', 'g', 's', 'n', 'l'], 
        ['', 'r', '', '', '', '', '', 'b', ''],
        ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
        ['', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', ''],
        ['', '', '', '', '', '', '', '', ''],
        ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
        ['', 'B', '', '', '', '', '', 'R', ''],
        ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']
    ];
}

// --- Socket.IO接続処理 ---
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // 1. 接続・再接続時にクライアント情報を受信し、プレイヤーリストに登録
    socket.on('reconnect_identity', (data) => {
        players[socket.id] = {
            id: socket.id,
            name: data.name || 'Guest',
            timeLimit: data.timeLimit || '10min',
            persistentId: data.persistentId
        };
        console.log(`Player identified: ${players[socket.id].name} (${socket.id})`);
        
        // リスト更新を全体に通知
        sendLobbyUpdate();
    });

    // 2. 名前や持ち時間の更新を受信
    socket.on('update_identity', (data) => {
        if (players[socket.id]) {
            if (data.name) players[socket.id].name = data.name;
            if (data.timeLimit) players[socket.id].timeLimit = data.timeLimit;
            // 変更後、全員に更新を通知
            sendLobbyUpdate();
        }
    });

    // 3. ロビーリストの初期要求を受信
    socket.on('enter_lobby', () => {
        sendLobbyUpdate(socket); // 要求元にのみ送信
    });
    
    // 4. 対戦招待の送信
    socket.on('send_invite', (data) => {
        const inviteeSocket = io.sockets.sockets.get(data.inviteeId);
        if (inviteeSocket) {
            inviteeSocket.emit('receive_invite', {
                inviterId: data.inviterId,
                inviterName: data.inviterName,
                timeLimit: data.timeLimit
            });
        }
    });

    // 5. 招待への返答 (承諾/拒否)
    socket.on('invite_response', (data) => {
        const inviterSocket = io.sockets.sockets.get(data.inviterId);
        
        if (data.accepted) {
            // 承諾された場合、ルームを作成しマッチング成立
            const roomId = `room_${Math.random().toString(36).substring(2)}`;
            const timeLimit = data.invitedTimeLimit;

            rooms[roomId] = {
                P1: data.inviterId, // 招待者がP1 (先手)
                P2: socket.id,       // 承諾者がP2 (後手)
                timeLimit: timeLimit,
                turn: 'P1',
                board: initializeBoard(),
                hands: { P1: {}, P2: {} }
            };
            
            // 招待者と承諾者に対してマッチング完了を通知
            inviterSocket.emit('match_found', { roomId, role: 'P1', timeLimit });
            socket.emit('match_found', { roomId, role: 'P2', timeLimit });

            // プレイヤーリストから削除（ロビーリストに表示させないため）
            delete players[data.inviterId];
            delete players[socket.id];
            
            // ロビー更新を通知
            sendLobbyUpdate();
            
        } else if (inviterSocket) {
            // 拒否された場合、招待者に通知
            inviterSocket.emit('invite_rejected', { rejecteeName: data.rejecteeName || 'Opponent' });
        }
    });

    // 6. 切断時の処理
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        
        // プレイヤーリストから削除
        delete players[socket.id];
        
        // ロビーリスト更新を全体に通知
        sendLobbyUpdate(); 

        // ⚠️ 進行中のゲームルームからの削除処理（ここでは省略）
    });
    
    // 7. ゲームルームへの参加 (game.jsからの呼び出しに対応)
    socket.on('join_game_room', (data) => {
        socket.join(data.roomId);
        console.log(`Socket ${socket.id} joined room ${data.roomId}`);
    });
    
    // 8. 駒の移動処理（対局中）
    socket.on('move', (data) => {
        // ... ゲームロジック、合法手判定、状態更新、時間計算などを実行 ...
        // その後、io.to(data.roomId).emit('move', { ... }); でブロードキャスト
    });
    
    // 9. 投了処理
    socket.on('resign', (data) => {
        // ... 投了処理 ...
    });

});

// --- サーバー起動 ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});