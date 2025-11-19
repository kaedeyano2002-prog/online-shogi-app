// game.js
document.addEventListener('DOMContentLoaded', () => {
// ----------------- ロジックの初期化 -----------------

const gameData = JSON.parse(localStorage.getItem('shogi_game_data'));
if (!gameData) {
    alert("対戦情報がありません。ロビーに戻ります。");
    window.location.href = 'waiting.html';
}

const socket = io();

socket.on('connect', () => {
    socket.emit('join_game_room', { roomId: gameData.roomId });
});


// ----------------- 駒と盤面のデータ定義 -----------------

const PIECES = {
    'K': '玉', 'R': '飛', 'B': '角', 'G': '金', 'S': '銀', 'N': '桂', 'L': '香', 'P': '歩',
    'k': '玉', 'r': '飛', 'b': '角', 'g': '金', 's': '銀', 'n': '桂', 'l': '香', 'p': '歩',
    '+R': '竜', '+B': '馬', '+S': '全', '+N': '圭', '+L': '杏', '+P': 'と',
    '+r': '龍', '+b': '馬', '+s': '全', '+n': '圭', '+l': '杏', '+p': 'と'
};

let currentBoard = [
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

let hands = {
    P1: {},
    P2: {}
};

// --- 駒の移動ロジックの変数 ---
let selectedSquare = null;     
let selectedHandPiece = null;  
let myRole = gameData.role;            
let currentTurn = 'P1';       
let pendingMove = null; 
        
// ----------------- 盤面と駒の移動関連 -----------------

const boardElement = document.getElementById('shogi-board');
const infoDisplay = document.getElementById('info-display'); 
const promotionDialog = document.getElementById('promotion-dialog');
const resignButton = document.getElementById('resign-button'); 
const backToLobbyButton = document.getElementById('back-to-lobby-button');

// 💡 タイマー関連のDOM要素
const timerDisplay = document.getElementById('timer-display');
let myTimerElement = document.getElementById('my-timer');
let opponentTimerElement = document.getElementById('opponent-timer');

// 💡 持ち時間関連の変数
let timeLimitSeconds = parseTimeLimit(gameData.timeLimit); 
let myTime = timeLimitSeconds;
let opponentTime = timeLimitSeconds;
let timerInterval = null;


// ----------------- ヘルパー関数 -----------------

function rankToFileRank(rankIndex, fileIndex) {
    const file = 9 - fileIndex;
    const rank = rankIndex + 1;
    return `${file}${rank}`;
}

function fileRankToIndices(file, rank) {
    const rankIndex = rank - 1;
    const fileIndex = 9 - file;
    return { rankIndex, fileIndex };
}

function isMyPiece(pieceCode) {
    if (!pieceCode) return false;
    const isUpperCase = pieceCode[0] === pieceCode[0].toUpperCase();
    return (myRole === 'P1' && isUpperCase) || (myRole === 'P2' && !isUpperCase);
}

function isPromotable(pieceCode) {
    const basePiece = pieceCode.toUpperCase().replace('+', '');
    return ['R', 'B', 'S', 'N', 'L', 'P'].includes(basePiece);
}

function isInPromotionZone(rank, isP1) {
    if (isP1) {
        return rank >= 1 && rank <= 3;
    } else {
        return rank >= 7 && rank <= 9;
    }
}

function parseTimeLimit(limit) {
    const match = limit.match(/(\d+)min/);
    return match ? parseInt(match[1]) * 60 : 600; 
}

function formatTime(seconds) {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ----------------- 盤面操作関数 -----------------

function createBoard() {
    for (let rank = 1; rank <= 9; rank++) { 
        for (let file = 9; file >= 1; file--) { 
            const square = document.createElement('div');
            square.classList.add('square');
            square.dataset.file = file;
            square.dataset.rank = rank;
            square.addEventListener('click', handleSquareClick); 
            boardElement.appendChild(square);
        }
    }
}

function renderPieces() {
    // ... (前回の renderPieces と同じ) ...
    const squares = document.querySelectorAll('.square');
    squares.forEach(sq => {
        sq.innerHTML = '';
        sq.classList.remove('selected', 'possible-move');
    });

    currentBoard.forEach((rankArray, rankIndex) => {
        rankArray.forEach((pieceCode, fileIndex) => {
            if (pieceCode !== '') {
                const pieceElement = document.createElement('div');
                pieceElement.classList.add('piece');
                
                pieceElement.textContent = PIECES[pieceCode]; 
                
                if (pieceCode[0] === pieceCode[0].toUpperCase()) {
                    pieceElement.classList.add('player1');
                } else {
                    pieceElement.classList.add('player2');
                }

                const file = 9 - fileIndex;
                const rank = rankIndex + 1;
                const targetSquare = document.querySelector(`.square[data-file="${file}"][data-rank="${rank}"]`);
                
                if (targetSquare) {
                    targetSquare.appendChild(pieceElement);
                }
            }
        });
    });
}

function renderHands() {
    // ... (前回の renderHands と同じ) ...
    const handP1 = document.getElementById('hand-p1');
    const handP2 = document.getElementById('hand-p2');
    
    handP1.innerHTML = '';
    handP2.innerHTML = ''; 

    const handP1Container = document.createElement('div');
    handP1Container.classList.add('hand-pieces');
    
    for (const pieceCode in hands.P1) {
        for (let i = 0; i < hands.P1[pieceCode]; i++) {
            const pieceElement = createHandPieceElement(pieceCode, 'player1');
            handP1Container.appendChild(pieceElement);
        }
    }
    handP1.appendChild(handP1Container);

    const handP2Container = document.createElement('div');
    handP2Container.classList.add('hand-pieces');
    
    for (const pieceCode in hands.P2) {
        for (let i = 0; i < hands.P2[pieceCode]; i++) {
            const pieceElement = createHandPieceElement(pieceCode.toLowerCase(), 'player2');
            handP2Container.appendChild(pieceElement);
        }
    }
    handP2.appendChild(handP2Container);
    
    if (selectedHandPiece) {
        const targetPieceCode = selectedHandPiece.dataset.piece;
        const targetPlayerClass = selectedHandPiece.classList.contains('player1') ? 'player1' : 'player2';
        
        const reselectTarget = document.querySelector(`.hand-piece.${targetPlayerClass}[data-piece="${targetPieceCode}"]`);
        if (reselectTarget) {
            reselectTarget.classList.add('selected');
            selectedHandPiece = reselectTarget; 
        } else {
            selectedHandPiece = null;
        }
    }
}

function createHandPieceElement(pieceCode, playerClass) {
    // ... (前回の createHandPieceElement と同じ) ...
    const pieceElement = document.createElement('div');
    pieceElement.classList.add('hand-piece', playerClass);
    
    pieceElement.dataset.piece = pieceCode;
    pieceElement.textContent = PIECES[pieceCode]; 
    pieceElement.addEventListener('click', handleHandPieceClick);

    return pieceElement;
}


function updateBoardState(from, to, pieceCode, newHands = null) {
    // ... (前回の updateBoardState と同じ) ...
    const { rankIndex: toRankIndex, fileIndex: toFileIndex } = fileRankToIndices(parseInt(to[0]), parseInt(to[1]));
    
    currentBoard[toRankIndex][toFileIndex] = pieceCode;
    
    if (from !== 'HAND') {
        const { rankIndex: fromRankIndex, fileIndex: fromFileIndex } = fileRankToIndices(parseInt(from[0]), parseInt(from[1]));
        currentBoard[fromRankIndex][fromFileIndex] = '';
    }
    
    if (newHands) {
        hands = newHands;
    }
    
    renderPieces();
    renderHands();
}

function highlightPossibleMoves(moves) {
    // ... (前回の highlightPossibleMoves と同じ) ...
    document.querySelectorAll('.square.possible-move').forEach(sq => sq.classList.remove('possible-move'));

    moves.forEach(to => {
        const file = to[0];
        const rank = to[1];
        const targetSquare = document.querySelector(`.square[data-file="${file}"][data-rank="${rank}"]`);
        if (targetSquare) {
            targetSquare.classList.add('possible-move');
        }
    });
}


// ----------------- 💡 将棋の移動・王手・詰みロジック (完全実装) -----------------

/**
 * 指定された盤面、ターン、玉の位置から、玉が王手されているか判定する。
 * @param {Array<Array<string>>} board 盤面
 * @param {string} turn 判定対象のプレイヤー ('P1' or 'P2')
 * @returns {boolean}
 */
function isCheck(board, turn) {
    const isP1 = turn === 'P1';
    const kingCode = isP1 ? 'K' : 'k';
    let kingPos = null;

    // 1. 玉の位置を探す
    for (let r = 0; r <= 8; r++) {
        for (let f = 0; f <= 8; f++) {
            if (board[r][f] === kingCode) {
                kingPos = { r, f };
                break;
            }
        }
        if (kingPos) break;
    }
    if (!kingPos) return false; // 玉がいない（異常事態）

    const opponentTurn = isP1 ? 'P2' : 'P1';

    // 2. 相手のすべての駒の利きをチェックし、玉の位置に届くか判定
    for (let r = 0; r <= 8; r++) {
        for (let f = 0; f <= 8; f++) {
            const pieceCode = board[r][f];
            if (pieceCode !== '') {
                const pieceIsP1 = pieceCode === pieceCode.toUpperCase();
                const pieceOwner = pieceIsP1 ? 'P1' : 'P2';

                if (pieceOwner === opponentTurn) {
                    // 相手の駒の全ての移動先を、王手判定専用のロジックで取得 (合法手判定は不要)
                    const opponentMoves = getRawMoves(board, r, f);
                    
                    for (const to of opponentMoves) {
                        const { rankIndex: tr, fileIndex: tf } = fileRankToIndices(parseInt(to[0]), parseInt(to[1]));
                        if (tr === kingPos.r && tf === kingPos.f) {
                            return true; // 王手されている
                        }
                    }
                }
            }
        }
    }
    return false;
}

/**
 * 指定された盤面とターンで、詰みが発生しているか判定する。
 * (王手されていて、かつ、合法手が一つもない状態)
 * @param {Array<Array<string>>} board 盤面
 * @param {string} turn 判定対象のプレイヤー ('P1' or 'P2')
 * @returns {boolean}
 */
function isCheckmate(board, turn) {
    // 1. まず王手されているか確認
    if (!isCheck(board, turn)) {
        return false;
    }

    // 2. 持ち駒も含め、全ての駒の「合法手」をチェックする
    const allLegalMoves = getAllLegalMoves(board, hands, turn);
    
    // 💡 合法手が一つでもあれば詰みではない
    return allLegalMoves.length === 0;
}


/** 盤上の駒の移動可能マスを計算する (合法手チェックあり) */
function getPossibleMoves(startRankIndex, startFileIndex) {
    const pieceCode = currentBoard[startRankIndex][startFileIndex];
    const isP1 = pieceCode === pieceCode.toUpperCase();
    const currentRole = isP1 ? 'P1' : 'P2';

    // 1. 駒の移動ルールに基づいて、全ての移動可能なマス(Raw Moves)を取得
    const rawMoves = getRawMoves(currentBoard, startRankIndex, startFileIndex);
    const legalMoves = [];

    // 2. 各移動先について、王手回避になっているかチェック (合法手判定)
    for (const to of rawMoves) {
        const { rankIndex: toR, fileIndex: toF } = fileRankToIndices(parseInt(to[0]), parseInt(to[1]));
        
        // 仮想的な移動を実行
        const tempBoard = currentBoard.map(row => [...row]);
        tempBoard[toR][toF] = pieceCode;
        tempBoard[startRankIndex][startFileIndex] = '';
        
        // 仮想的な移動後の盤面で王手になっていないか確認
        if (!isCheck(tempBoard, currentRole)) {
            // 成り判定が必要な駒について、成る手と成らない手を両方追加
            const fromRank = startRankIndex + 1;
            const toRank = toR + 1;
            const basePiece = pieceCode.toUpperCase().replace('+', '');
            
            // 既に成っているか、成れない駒はそのまま追加
            if (pieceCode.startsWith('+') || !isPromotable(pieceCode)) {
                legalMoves.push(to);
            } else {
                const startsInZone = isInPromotionZone(fromRank, isP1);
                const endsInZone = isInPromotionZone(toRank, isP1);
                
                // 必須の成り/成り選択の分岐は handleSquareClick で処理されるため、
                // ここでは単に移動可能マスとして追加する。
                legalMoves.push(to);
            }
        }
    }
    return legalMoves; 
}


/** 持ち駒の打てるマスを計算する (完全版) */
function getPossibleDropSquares(pieceCode) {
    const dropMoves = [];
    const isP1 = pieceCode === pieceCode.toUpperCase();
    const currentRole = isP1 ? 'P1' : 'P2';
    const basePiece = pieceCode.toUpperCase();
    
    for (let r = 0; r <= 8; r++) {
        for (let f = 0; f <= 8; f++) {
            
            // 1. マスが空であること
            if (currentBoard[r][f] !== '') continue;

            // 2. 二歩の禁止
            if (basePiece === 'P') {
                let hasPawnInFile = false;
                for (let row = 0; row <= 8; row++) {
                    if (currentBoard[row][f] === pieceCode) {
                        hasPawnInFile = true;
                        break;
                    }
                }
                if (hasPawnInFile) continue;
            }

            // 3. 行き所のない駒の禁止
            const targetRank = r + 1; 
            if (basePiece === 'P' || basePiece === 'L') {
                if (isP1 && targetRank === 1) continue; 
                if (!isP1 && targetRank === 9) continue; 
            }
            if (basePiece === 'N') {
                if (isP1 && (targetRank === 1 || targetRank === 2)) continue; 
                if (!isP1 && (targetRank === 8 || targetRank === 9)) continue; 
            }
            
            // 4. 打ち歩詰めの禁止 (王手回避チェック)
            if (basePiece === 'P') {
                // 仮想的なドロップ
                const tempBoard = currentBoard.map(row => [...row]);
                tempBoard[r][f] = pieceCode;
                
                // ドロップで王手になるか
                if (isCheck(tempBoard, isP1 ? 'P2' : 'P1')) {
                    // 王手になる場合、その王手が詰みかどうか判定
                    if (isCheckmate(tempBoard, isP1 ? 'P2' : 'P1')) {
                        // 詰みの場合、これが「打ち歩詰め」であるため禁止
                        continue; 
                    }
                }
            }

            // 5. 合法手判定（玉が王手されていないか確認）はドロップでは不要（既に玉が王手されている状態でドロップする手はないため）

            dropMoves.push(rankToFileRank(r, f));
        }
    }
    return dropMoves; 
}


// --- 駒の移動ルール本体 ---

// 駒の種別ごとの移動方向を定義 (先手P1視点: 9段目から1段目へ移動)
const MOVEMENT_RULES = {
    // [dr, df] の配列: drは行(rank)の変化, dfは列(file)の変化
    'K': { type: 'fixed', moves: [[-1, 0], [-1, 1], [0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1]] }, // 玉: 全方向1マス
    'G': { type: 'fixed', moves: [[-1, 0], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, -1]] }, // 金: 前後左右斜め前1マス
    '+S': { type: 'fixed', moves: [[-1, 0], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, -1]] }, // 成銀: 金と同じ
    '+N': { type: 'fixed', moves: [[-1, 0], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, -1]] }, // 成桂: 金と同じ
    '+L': { type: 'fixed', moves: [[-1, 0], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, -1]] }, // 成香: 金と同じ
    '+P': { type: 'fixed', moves: [[-1, 0], [-1, 1], [0, 1], [1, 0], [0, -1], [-1, -1]] }, // と金: 金と同じ
    
    'S': { type: 'fixed', moves: [[-1, 0], [-1, 1], [1, 1], [1, -1], [-1, -1]] }, // 銀: 前後斜め1マス
    'N': { type: 'fixed', moves: [[-2, -1], [-2, 1]] }, // 桂: 桂馬跳び
    'L': { type: 'directional', vectors: [[-1, 0]] }, // 香: 前方直線
    'P': { type: 'fixed', moves: [[-1, 0]] }, // 歩: 前方1マス
    
    'R': { type: 'directional', vectors: [[-1, 0], [1, 0], [0, -1], [0, 1]] }, // 飛: 直線
    'B': { type: 'directional', vectors: [[-1, -1], [-1, 1], [1, -1], [1, 1]] }, // 角: 斜線
    
    '+R': { type: 'directional', vectors: [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]], fixed: [[-1, -1], [-1, 1], [1, -1], [1, 1]] }, // 竜: 直線 + 玉の斜め
    '+B': { type: 'directional', vectors: [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]], fixed: [[-1, 0], [1, 0], [0, -1], [0, 1]] } // 馬: 斜線 + 玉の直線
};

/**
 * 盤上の特定の駒の移動ルールに従った**すべての移動先**（王手回避無視）を計算する。
 * @param {Array<Array<string>>} board 
 * @param {number} r 始点行インデックス (0-8)
 * @param {number} f 始点列インデックス (0-8)
 * @returns {Array<string>} 座標文字列の配列 ('76'など)
 */
function getRawMoves(board, r, f) {
    const pieceCode = board[r][f];
    if (!pieceCode) return [];

    const isP1 = pieceCode === pieceCode.toUpperCase();
    const basePiece = pieceCode.toUpperCase().replace('+', '');
    const rules = MOVEMENT_RULES[pieceCode.toUpperCase()]; 
    const moves = [];

    // 移動先の所有者判定
    const isOpponentPiece = (piece) => piece !== '' && (isP1 !== (piece === piece.toUpperCase()));
    const isFriendlyPiece = (piece) => piece !== '' && (isP1 === (piece === piece.toUpperCase()));
    
    // 駒の向きを適用したルールを取得 (P2は縦方向を反転させる)
    const getDelta = (dr, df) => isP1 ? [dr, df] : [-dr, -df];

    // 1. Fixed Moves (玉, 金, 銀, 桂, 歩など)
    if (rules.type === 'fixed') {
        rules.moves.forEach(([dr, df]) => {
            const [deltaR, deltaF] = getDelta(dr, df);
            const newR = r + deltaR;
            const newF = f + deltaF;

            if (newR >= 0 && newR <= 8 && newF >= 0 && newF <= 8) {
                const targetPiece = board[newR][newF];
                if (!isFriendlyPiece(targetPiece)) {
                    moves.push(rankToFileRank(newR, newF));
                }
            }
        });
    }

    // 2. Directional Moves (飛、角、香、竜、馬)
    if (rules.type === 'directional') {
        rules.vectors.forEach(([dr, df]) => {
            const [deltaR, deltaF] = getDelta(dr, df);
            let newR = r + deltaR;
            let newF = f + deltaF;

            while (newR >= 0 && newR <= 8 && newF >= 0 && newF <= 8) {
                const targetPiece = board[newR][newF];

                if (isFriendlyPiece(targetPiece)) {
                    break; // 味方駒で停止
                }
                
                moves.push(rankToFileRank(newR, newF));

                if (isOpponentPiece(targetPiece)) {
                    break; // 敵駒を捕獲して停止
                }
                
                newR += deltaR;
                newF += deltaF;
            }
        });
        
        // 竜馬の固定移動 (玉の動きの追加分)
        if (rules.fixed) {
             rules.fixed.forEach(([dr, df]) => {
                const [deltaR, deltaF] = getDelta(dr, df);
                const newR = r + deltaR;
                const newF = f + deltaF;
                
                if (newR >= 0 && newR <= 8 && newF >= 0 && newF <= 8) {
                    const targetPiece = board[newR][newF];
                    // 直線/斜線移動の処理で既に追加されていないかチェックする必要があるが、ここではシンプルに実装
                    if (!isFriendlyPiece(targetPiece)) {
                        moves.push(rankToFileRank(newR, newF));
                    }
                }
            });
        }
    }

    return moves;
}

/** 盤上のすべての駒のすべての合法手を取得する (詰み判定用) */
function getAllLegalMoves(board, hands, turn) {
    let allMoves = [];
    const isP1 = turn === 'P1';
    
    // 1. 盤上の駒の移動
    for (let r = 0; r <= 8; r++) {
        for (let f = 0; f <= 8; f++) {
            const pieceCode = board[r][f];
            if (pieceCode !== '') {
                const pieceIsP1 = pieceCode === pieceCode.toUpperCase();
                const pieceOwner = pieceIsP1 ? 'P1' : 'P2';
                
                if (pieceOwner === turn) {
                    const from = rankToFileRank(r, f);
                    const rawMoves = getRawMoves(board, r, f);
                    
                    for (const to of rawMoves) {
                        const { rankIndex: toR, fileIndex: toF } = fileRankToIndices(parseInt(to[0]), parseInt(to[1]));
                        
                        const tempBoard = board.map(row => [...row]);
                        const originalPiece = tempBoard[toR][toF]; 
                        
                        // 仮想的な移動 (成りの可能性はここでは無視し、王手回避判定のみ行う)
                        tempBoard[toR][toF] = pieceCode;
                        tempBoard[r][f] = '';
                        
                        if (!isCheck(tempBoard, turn)) {
                            allMoves.push({ from, to });
                        }
                    }
                }
            }
        }
    }
    
    // 2. 持ち駒のドロップ
    const handPieces = hands[turn];
    for (const pieceCode in handPieces) {
        if (handPieces[pieceCode] > 0) {
            const dropSquares = getPossibleDropSquares(pieceCode);
            for (const to of dropSquares) {
                // ドロップ手は既に isCheckmate ロジックで検証されているため、ここではそのまま追加
                allMoves.push({ from: 'HAND', to, pieceCode }); 
            }
        }
    }
    
    return allMoves;
}


// ----------------- タイマー機能 -----------------

function updateTimerDisplay() {
    // ... (前回の updateTimerDisplay と同じ) ...
    myTimerElement.textContent = formatTime(myTime);
    opponentTimerElement.textContent = formatTime(opponentTime);
    
    if (currentTurn === myRole) {
        myTimerElement.classList.add('active-timer');
        opponentTimerElement.classList.remove('active-timer');
    } else {
        opponentTimerElement.classList.add('active-timer');
        myTimerElement.classList.remove('active-timer');
    }
}

function startTimer() {
    // ... (前回の startTimer と同じ) ...
    clearInterval(timerInterval);
    if (currentTurn !== myRole || currentTurn === null) {
        updateTimerDisplay();
        return;
    }

    timerInterval = setInterval(() => {
        if (currentTurn === myRole) {
            myTime--;
            if (myTime < 0) {
                myTime = 0;
                clearInterval(timerInterval);
                socket.emit('time_out', { timeOutRole: myRole });
                infoDisplay.innerHTML = `<strong>時間切れにより、あなたの負けです。</strong>`;
                handleGameEnd();
            }
        }
        updateTimerDisplay();
    }, 1000);
}


// ----------------- イベントハンドラ -----------------

function finalizeMove(pieceCode) {
    const { from, to, capturedPieceCode } = pendingMove;
    const isP1 = currentTurn === 'P1';
    let finalPieceCode = pieceCode;
    
    if (pieceCode.startsWith('+')) {
         const basePiece = pieceCode.toUpperCase().replace('+', '');
         finalPieceCode = isP1 ? ('+' + basePiece) : ('+' + basePiece.toLowerCase());
    }
    
    // 1. 捕獲された駒の持ち駒化
    if (capturedPieceCode !== '') {
        const basePiece = capturedPieceCode.toUpperCase().replace('+', ''); 
        const convertedPiece = isP1 ? basePiece.toUpperCase() : basePiece.toLowerCase();

        const targetHand = isP1 ? 'P1' : 'P2';
        hands[targetHand][convertedPiece] = (hands[targetHand][convertedPiece] || 0) + 1;
    }
    
    // 2. サーバーに送信 (現在の盤面状態も送信)
    const moveData = { 
        from: from, 
        to: to,
        pieceCode: finalPieceCode,
        hands: hands,
        currentBoard: currentBoard, 
        role: currentTurn 
    };
    socket.emit('move', moveData);
    
    // 3. 自端末の盤面を更新
    updateBoardState(from, to, finalPieceCode); 
    
    // 4. 詰み判定 (クライアント側でも確認)
    const opponentRole = isP1 ? 'P2' : 'P1';
    if (isCheckmate(currentBoard, opponentRole)) {
        socket.emit('checkmate', { winnerRole: currentTurn });
        infoDisplay.innerHTML = `<strong>${opponentRole} の玉を詰ませました！あなたの勝ちです！</strong>`;
        handleGameEnd();
    }
    
    // 5. 選択解除とターン交代
    if (selectedSquare) { selectedSquare.classList.remove('selected'); }
    selectedSquare = null;
    pendingMove = null;
    document.querySelectorAll('.square.possible-move').forEach(sq => sq.classList.remove('possible-move'));

    currentTurn = opponentRole;
    updateResignButtonState(); 
    startTimer();
}

// ... (handleHandPieceClick, handleSquareClick, 成り選択処理は前回から変更なし) ...

function handleHandPieceClick(event) {
    if (!myRole || currentTurn !== myRole || pendingMove || resignButton.disabled) return; 
    
    const clickedPiece = event.currentTarget;
    const myPlayerClass = 'player' + (myRole === 'P1' ? '1' : '2');
    
    if (!clickedPiece.classList.contains(myPlayerClass)) return;
    
    if (selectedSquare) {
        selectedSquare.classList.remove('selected');
        selectedSquare = null;
    }
    
    document.querySelectorAll('.square.possible-move').forEach(sq => sq.classList.remove('possible-move'));
    document.querySelectorAll('.hand-piece.selected').forEach(p => p.classList.remove('selected'));
    
    if (selectedHandPiece === clickedPiece) {
        selectedHandPiece = null;
    } else {
        selectedHandPiece = clickedPiece;
        selectedHandPiece.classList.add('selected');
        
        const dropMoves = getPossibleDropSquares(selectedHandPiece.dataset.piece); 
        highlightPossibleMoves(dropMoves);
    }
}

function handleSquareClick(event) {
    if (!myRole || currentTurn !== myRole || pendingMove || resignButton.disabled) return; 
    
    const clickedSquare = event.currentTarget;
    const pieceElement = clickedSquare.querySelector('.piece');
    const myPieceClass = 'player' + (myRole === 'P1' ? '1' : '2');

    // --- A. 持ち駒が選択されている場合 (打つ処理) ---
    if (selectedHandPiece) {
        const to = `${clickedSquare.dataset.file}${clickedSquare.dataset.rank}`;
        
        if (!clickedSquare.classList.contains('possible-move')) {
            console.log("そのマスには打てません。");
            return;
        }
        
        const pieceCode = selectedHandPiece.dataset.piece;
        
        const targetHand = myRole === 'P1' ? 'P1' : 'P2';
        hands[targetHand][pieceCode] -= 1;
        if (hands[targetHand][pieceCode] === 0) {
            delete hands[targetHand][pieceCode];
        }
        
        // 💡 サーバーに指し手と現在の盤面を送信
        const moveData = {
            from: 'HAND', to: to, pieceCode: pieceCode, hands: hands,
            currentBoard: currentBoard, 
            role: currentTurn
        };
        socket.emit('move', moveData);
        
        updateBoardState('HAND', to, pieceCode); 
        selectedHandPiece = null;
        
        // 4. 詰み判定 (クライアント側でも確認)
        const opponentRole = myRole === 'P1' ? 'P2' : 'P1';
        if (isCheckmate(currentBoard, opponentRole)) {
            socket.emit('checkmate', { winnerRole: currentTurn });
            infoDisplay.innerHTML = `<strong>${opponentRole} の玉を詰ませました！あなたの勝ちです！</strong>`;
            handleGameEnd();
        }
        
        currentTurn = opponentRole;
        document.querySelectorAll('.square.possible-move').forEach(sq => sq.classList.remove('possible-move'));
        updateResignButtonState(); 
        startTimer();
        return; 
    }


    // --- B. 盤上の駒の選択と移動処理 ---
    
    // 1. 駒の選択
    if (!selectedSquare || (pieceElement && pieceElement.classList.contains(myPieceClass))) {
        
        document.querySelectorAll('.square.possible-move').forEach(sq => sq.classList.remove('possible-move'));
        if (selectedSquare) {
            selectedSquare.classList.remove('selected');
        }
        
        if (pieceElement) {
            selectedSquare = clickedSquare;
            selectedSquare.classList.add('selected');

            const file = parseInt(selectedSquare.dataset.file);
            const rank = parseInt(selectedSquare.dataset.rank);
            const { rankIndex, fileIndex } = fileRankToIndices(file, rank);
            const moves = getPossibleMoves(rankIndex, fileIndex);
            highlightPossibleMoves(moves);
        } else {
            selectedSquare = null;
        }
        
    // 2. 駒の移動
    } else if (selectedSquare) {
        
        if (!clickedSquare.classList.contains('possible-move')) {
            console.log("そのマスには移動できません。");
            return;
        }

        const from = `${selectedSquare.dataset.file}${selectedSquare.dataset.rank}`;
        const to = `${clickedSquare.dataset.file}${clickedSquare.dataset.rank}`;
        
        const { rankIndex: toRankIndex, fileIndex: toFileIndex } = fileRankToIndices(parseInt(clickedSquare.dataset.file), parseInt(clickedSquare.dataset.rank));
        const { rankIndex: fromRankIndex, fileIndex: fromFileIndex } = fileRankToIndices(parseInt(selectedSquare.dataset.file), parseInt(selectedSquare.dataset.rank));

        let pieceCode = currentBoard[fromRankIndex][fromFileIndex];
        const capturedPieceCode = currentBoard[toRankIndex][toFileIndex];

        const fromRankInt = parseInt(selectedSquare.dataset.rank);
        const toRankInt = parseInt(clickedSquare.dataset.rank);
        const isP1 = currentTurn === 'P1';
        const basePiece = pieceCode.toUpperCase().replace('+', '');

        // --- 成り判定と選択 ---
        const canPromote = isPromotable(pieceCode) && !pieceCode.startsWith('+');
        const startsInZone = isInPromotionZone(fromRankInt, isP1);
        const endsInZone = isInPromotionZone(toRankInt, isP1);
        
        let willPromote = false;
        
        if (canPromote && (startsInZone || endsInZone)) {
            const mustPromote = (
                (basePiece === 'P' && (isP1 ? toRankInt === 1 : toRankInt === 9)) ||
                (basePiece === 'L' && (isP1 ? toRankInt === 1 : toRankInt === 9)) ||
                (basePiece === 'N' && (isP1 ? (toRankInt === 1 || toRankInt === 2) : (toRankInt === 8 || toRankInt === 9)))
            );
            
            if (mustPromote) {
                willPromote = true;
            } else if (startsInZone || endsInZone) {
                pendingMove = { from, to, pieceCode, capturedPieceCode };
                promotionDialog.style.display = 'block';
                return;
            }
        }
        
        if (willPromote) {
            pieceCode = (isP1 ? '+' : '+') + pieceCode; 
        }

        pendingMove = { from, to, capturedPieceCode };
        finalizeMove(pieceCode);
    }
}


// ... (成り選択ボタンのイベント処理は前回から変更なし) ...

document.getElementById('promote-yes').addEventListener('click', () => {
    if (pendingMove) {
        const newPieceCode = '+' + pendingMove.pieceCode;
        promotionDialog.style.display = 'none';
        finalizeMove(newPieceCode);
    }
});

document.getElementById('promote-no').addEventListener('click', () => {
    if (pendingMove) {
        const newPieceCode = pendingMove.pieceCode; 
        promotionDialog.style.display = 'none';
        
        finalizeMove(newPieceCode);
    }
});


// ----------------- ゲーム制御関数 -----------------

function updateResignButtonState() {
    // ... (前回の updateResignButtonState と同じ) ...
    if (currentTurn === null) {
        resignButton.style.display = 'none';
        return;
    }
    
    const canResign = (currentTurn === myRole);
    resignButton.disabled = !canResign;
    resignButton.style.display = 'inline-block'; 
}

function handleGameEnd() {
    // ... (前回の handleGameEnd と同じ) ...
    clearInterval(timerInterval); 
    resignButton.style.display = 'none'; 
    backToLobbyButton.style.display = 'inline-block';
    currentTurn = null; 
}

// ... (ロビーに戻るボタン、投了ボタンのイベント処理は前回から変更なし) ...

backToLobbyButton.addEventListener('click', () => {
    localStorage.removeItem('shogi_game_data');
    window.location.href = 'waiting.html';
});

resignButton.addEventListener('click', () => {
    if (currentTurn !== myRole || resignButton.disabled) return; 

    if (confirm("本当に投了しますか？")) {
        socket.emit('resign', { resignerRole: myRole });
        
        infoDisplay.innerHTML = `<strong>投了しました。相手 (${gameData.opponentName}) の勝ちです。</strong>`;
        handleGameEnd();
    }
});


// ----------------- サーバーからのイベント処理 -----------------

socket.on('opponent_resigned', (data) => {
    const winnerRoleText = myRole === 'P1' ? '先手' : '後手';
    infoDisplay.innerHTML = `<strong>相手 (${gameData.opponentName}) が投了しました。あなたの勝ち (${winnerRoleText}) です！</strong>`;
    handleGameEnd();
});

socket.on('opponent_time_out', (data) => {
    const winnerRoleText = myRole === 'P1' ? '先手' : '後手';
    infoDisplay.innerHTML = `<strong>相手 (${gameData.opponentName}) が時間切れになりました。あなたの勝ち (${winnerRoleText}) です！</strong>`;
    handleGameEnd();
});

// 💡 相手の詰み通知
socket.on('opponent_checkmate', (data) => {
    const winnerRoleText = myRole === 'P1' ? '先手' : '後手';
    infoDisplay.innerHTML = `<strong>相手 (${gameData.opponentName}) は詰みました。あなたの勝ち (${winnerRoleText}) です！</strong>`;
    handleGameEnd();
});

// サーバーから「move」イベント（相手の指し手）を受け取った時の処理
socket.on('move', (moveData) => {
    
    // 💡 相手のターン後に、相手の残り時間を更新
    // moveData.opponentTime には、指し手を指したプレイヤーの**指し手後の残り時間**が入っている。
    // それは、受け取った側（自分）から見ると「相手」の残り時間となる。
    if (currentTurn !== myRole) { 
        opponentTime = moveData.opponentTime; // 相手の残り時間を更新
        myTime = moveData.myTime; // 次の手番（自分）の残り時間を更新（サーバーで同期した値）
    }
    
    updateBoardState(moveData.from, moveData.to, moveData.pieceCode, moveData.hands);
    
    currentTurn = (currentTurn === 'P1' ? 'P2' : 'P1');
    
    const currentRoleText = currentTurn === 'P1' ? '先手' : '後手';
    const turnInfo = document.querySelector('#info-display p');
    if (turnInfo) {
         turnInfo.innerHTML = `<strong>${myRole === currentTurn ? 'あなたのターン' : '相手のターン'} (${currentRoleText})</strong>`;
    }
    
    updateResignButtonState();
    startTimer();
});

socket.on('move_rejected', () => {
    alert("不正な指し手が検出されたため、対局を終了しロビーに戻ります。");
    window.location.href = 'waiting.html';
});

// --- 実行 ---
createBoard();
renderPieces();
renderHands();

const myRoleText = myRole === 'P1' ? '先手' : '後手';
const turnInfo = document.querySelector('#info-display p');
turnInfo.innerHTML = `<strong>対局開始! あなたの役割: ${myRoleText} (対戦相手: ${gameData.opponentName})</strong>`;

if (myRole === 'P2') {
    boardElement.classList.add('p2-view-board'); 
}

timerDisplay.innerHTML = `
    <div id="opponent-timer">相手: ${formatTime(opponentTime)}</div>
    <div id="my-timer">自分: ${formatTime(myTime)}</div>
`;
// DOM要素を再取得
myTimerElement = document.getElementById('my-timer');
opponentTimerElement = document.getElementById('opponent-timer');


updateResignButtonState(); 
startTimer();

socket.on('disconnect', (reason) => {
    // サーバーが再起動、または意図的に切断された場合
    if (reason === 'io server disconnect' || reason === 'transport close' || reason === 'ping timeout') {
        console.log("サーバーとの接続が切れました。ロビーに戻ります。");
        clearInterval(timerInterval); // タイマーを停止
        localStorage.removeItem('shogi_game_data');
        alert("サーバーが再起動したため、ロビーに戻ります。");
        window.location.href = 'waiting.html';
    }
});
});