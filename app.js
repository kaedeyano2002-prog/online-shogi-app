// ----------------- 駒と盤面のデータ定義 -----------------
        
// 駒の種類と表示文字の定義
const PIECES = {
    // プレイヤー1 (先手)
    'K': '玉', 'R': '飛', 'B': '角', 'G': '金', 'S': '銀', 'N': '桂', 'L': '香', 'P': '歩',
    // プレイヤー2 (後手)
    'k': '玉', 'r': '飛', 'b': '角', 'g': '金', 's': '銀', 'n': '桂', 'l': '香', 'p': '歩',
    // 成駒 
    '+R': '竜', '+B': '馬', '+S': '全', '+N': '圭', '+L': '杏', '+P': 'と',
    '+r': '龍', '+b': '馬', '+s': '全', '+n': '圭', '+l': '杏', '+p': 'と'
};

// 将棋の初期配置 (配列: [段][筋])
let currentBoard = [
    ['l', 'n', 's', 'g', 'k', 'g', 's', 'n', 'l'], // 1段目 (index 0)
    ['', 'r', '', '', '', '', '', 'b', ''],         // 2段目 (index 1)
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'], // 3段目 (index 2)
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'], // 7段目 (index 6)
    ['', 'B', '', '', '', '', '', 'R', ''],         // 8段目 (index 7)
    ['L', 'N', 'S', 'G', 'K', 'G', 'S', 'N', 'L']  // 9段目 (index 8)
];

// 持ち駒のデータ定義
let hands = {
    P1: {}, // 先手(P1)の持ち駒: {'P': 1} の形式 (大文字)
    P2: {}  // 後手(P2)の持ち駒 (小文字)
};

// --- 駒の移動ロジックの変数 ---
let selectedSquare = null;     
let selectedHandPiece = null;  
let myRole = null;            
let currentTurn = 'P1';       
let pendingMove = null; 
        
// ----------------- 盤面と駒の移動関連 -----------------

const boardElement = document.getElementById('shogi-board');
const infoDisplay = document.getElementById('info-display'); 
const promotionDialog = document.getElementById('promotion-dialog');

// --- マッチング選択画面関連の変数 ---
const selectionScreen = document.getElementById('selection-screen');
const selectP1Button = document.getElementById('select-p1');
const selectP2Button = document.getElementById('select-p2');
const selectRandomButton = document.getElementById('select-random');
const selectionStatus = document.getElementById('selection-status');

// 配列インデックスと盤面座標の相互変換ヘルパー関数
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

/** 指定された駒のコードが自分の駒かどうかを判定 */
function isMyPiece(pieceCode) {
    if (!pieceCode) return false;
    // 大文字/小文字を問わず、最初の文字をチェック
    const isUpperCase = pieceCode[0] === pieceCode[0].toUpperCase();
    return (myRole === 'P1' && isUpperCase) || (myRole === 'P2' && !isUpperCase);
}

/** 💡 成り可能な駒かどうかを判定 */
function isPromotable(pieceCode) {
    const basePiece = pieceCode.toUpperCase().replace('+', '');
    // 玉(K)と金(G)は成れない
    return ['R', 'B', 'S', 'N', 'L', 'P'].includes(basePiece);
}

/** 💡 成るエリアにいるか判定 */
function isInPromotionZone(rank, isP1) {
    if (isP1) {
        return rank >= 1 && rank <= 3;
    } else {
        return rank >= 7 && rank <= 9;
    }
}

/** 移動可能マスをハイライトする */
function highlightPossibleMoves(moves) {
    document.querySelectorAll('.square.possible-move').forEach(sq => sq.classList.remove('possible-move'));

    moves.forEach(to => {
        const targetSquare = document.querySelector(`.square[data-file="${to[0]}"][data-rank="${to[1]}"]`);
        if (targetSquare) {
            targetSquare.classList.add('possible-move');
        }
    });
}

// ----------------- 駒の動きの定義と判定 -----------------

/**
 * 盤上の駒の移動可能マスを計算する
 * 💡 金の動きのP2対応を修正済み
 */
function getPossibleMoves(startRankIndex, startFileIndex) {
    const pieceCode = currentBoard[startRankIndex][startFileIndex];
    if (!pieceCode) return [];
    
    const piece = pieceCode.toUpperCase().replace('+', '');
    const isPromoted = pieceCode.startsWith('+');
    const isP1 = pieceCode[0] === pieceCode[0].toUpperCase(); 

    const moves = [];

    // 移動方向の定義: [段の差(dr), 筋の差(df)]。 dr=-1が前進。
    const directions = {
        K: [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]], 
        // 金の動き: 前、斜め前、横、後ろ
        G: [[-1, 0], [-1, -1], [0, -1], [1, 0], [0, 1], [-1, 1]], 
        S: [[-1, 0], [-1, -1], [1, -1], [1, 1], [-1, 1]], 
        N: [[-2, -1], [-2, 1]], 
        L: [[-1, 0]], 
        P: [[-1, 0]], 
        R_LONG: [[-1, 0], [1, 0], [0, -1], [0, 1]], 
        B_LONG: [[-1, -1], [1, -1], [1, 1], [-1, 1]], 
        R_BONUS: [[-1, -1], [1, -1], [1, 1], [-1, 1]], 
        B_BONUS: [[-1, 0], [1, 0], [0, -1], [0, 1]] 
    };
    
    let moveSet = [];
    let isLongRange = false;
    let longRangeDirs = [];

    if (isPromoted) {
        if (piece === 'R') { 
            isLongRange = true;
            longRangeDirs = directions.R_LONG;
            moveSet = directions.R_BONUS;
        } else if (piece === 'B') { 
            isLongRange = true;
            longRangeDirs = directions.B_LONG;
            moveSet = directions.B_BONUS;
        } else {
            // 成銀、成桂、成香、と金は金と同じ動き。
            moveSet = directions.G; 
        }
    } else {
        switch (piece) {
            case 'K': moveSet = directions.K; break;
            case 'R': isLongRange = true; longRangeDirs = directions.R_LONG; break;
            case 'B': isLongRange = true; longRangeDirs = directions.B_LONG; break;
            case 'G': moveSet = directions.G; break; 
            case 'S': moveSet = directions.S; break;
            case 'N': moveSet = directions.N; break;
            // P2の香は長距離方向を[1, 0]に設定
            case 'L': isLongRange = true; longRangeDirs = isP1 ? directions.L : [[1, 0]]; break;
            case 'P': moveSet = directions.P; break;
        }
    }
    
    // P2 (後手) の駒で、**非対称**の動きをする駒（金、銀、桂、歩）の動きを反転
    if (!isP1 && (piece === 'P' || piece === 'N' || piece === 'S' || piece === 'G')) {
         // G, S, N, P のみ反転
         moveSet = moveSet.map(([dr, df]) => [dr * -1, df * -1]);
    }


    // 1. 射程無限の駒の処理
    if (isLongRange) {
        const allLongRangeDirs = (piece === 'R' || piece === 'B' || piece === 'L') ? [...longRangeDirs] : [...longRangeDirs, ...moveSet];
        const uniqueLongRangeDirs = allLongRangeDirs.filter((v, i, a) => a.findIndex(t => t[0] === v[0] && t[1] === v[1]) === i);

        uniqueLongRangeDirs.forEach(([dr, df]) => {
            for (let step = 1; step <= 8; step++) {
                const nextRankIndex = startRankIndex + dr * step;
                const nextFileIndex = startFileIndex + df * step;
                
                if (nextRankIndex < 0 || nextRankIndex > 8 || nextFileIndex < 0 || nextFileIndex > 8) break;
                
                const targetPieceCode = currentBoard[nextRankIndex][nextFileIndex];
                const targetFileRank = rankToFileRank(nextRankIndex, nextFileIndex);

                if (targetPieceCode === '') {
                    moves.push(targetFileRank);
                } else if (isMyPiece(targetPieceCode)) {
                    break;
                } else {
                    moves.push(targetFileRank);
                    break;
                }
            }
        });
    }


    // 2. 1マス移動の駒の処理
    moveSet.forEach(([dr, df]) => {
        if (isLongRange && (piece === 'R' || piece === 'B') && !isPromoted) return;

        const nextRankIndex = startRankIndex + dr;
        const nextFileIndex = startFileIndex + df;

        if (nextRankIndex < 0 || nextRankIndex > 8 || nextFileIndex < 0 || nextFileIndex > 8) return;

        const targetPieceCode = currentBoard[nextRankIndex][nextFileIndex];
        const targetFileRank = rankToFileRank(nextRankIndex, nextFileIndex);

        if (!isMyPiece(targetPieceCode)) {
            moves.push(targetFileRank);
        }
    });

    return moves;
}

/** 持ち駒の打てるマスを計算する (変更なし) */
function getPossibleDropSquares(pieceCode) {
    const isP1 = pieceCode === pieceCode.toUpperCase();
    const piece = pieceCode.toUpperCase();
    const dropMoves = [];

    for (let rankIndex = 0; rankIndex <= 8; rankIndex++) {
        for (let fileIndex = 0; fileIndex <= 8; fileIndex++) {
            const targetPieceCode = currentBoard[rankIndex][fileIndex];
            if (targetPieceCode !== '') continue; 

            const targetRank = rankIndex + 1;

            // 行き所のない駒ではないこと 
            if (piece === 'P' || piece === 'L' || piece === 'N') {
                if (isP1 && targetRank === 1 && (piece === 'P' || piece === 'L')) continue;
                if (!isP1 && targetRank === 9 && (piece === 'P' || piece === 'L')) continue;
                
                if (piece === 'N') {
                    if (isP1 && (targetRank === 1 || targetRank === 2)) continue;
                    if (!isP1 && (targetRank === 8 || targetRank === 9)) continue;
                }
            }

            // 二歩ではないこと 
            if (piece === 'P') {
                let hasPawn = false;
                const targetFileIndex = fileIndex;
                for (let r = 0; r <= 8; r++) {
                    const p = currentBoard[r][targetFileIndex];
                    if (p === pieceCode) {
                        hasPawn = true;
                        break;
                    }
                }
                if (hasPawn) continue;
            }
            
            dropMoves.push(rankToFileRank(rankIndex, fileIndex));
        }
    }
    return dropMoves;
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

/** currentBoardのデータに基づいて盤面上の駒を更新する */
function renderPieces() {
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
                
                // 駒コードから表示文字を取得
                pieceElement.textContent = PIECES[pieceCode]; 
                
                // プレイヤーのクラス設定
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
            // 後手の持ち駒の表示用コードは小文字
            const pieceElement = createHandPieceElement(pieceCode.toLowerCase(), 'player2');
            handP2Container.appendChild(pieceElement);
        }
    }
    handP2.appendChild(handP2Container);
    
    // 選択状態の復元
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

/** 持ち駒のDOM要素を作成し、イベントリスナーを追加する */
function createHandPieceElement(pieceCode, playerClass) {
    const pieceElement = document.createElement('div');
    pieceElement.classList.add('hand-piece', playerClass);
    
    pieceElement.dataset.piece = pieceCode;
    
    // 持ち駒は非成駒なのでそのままPIECESから取得
    pieceElement.textContent = PIECES[pieceCode]; 
    
    pieceElement.addEventListener('click', handleHandPieceClick);

    return pieceElement;
}

function updateBoardState(from, to, pieceCode, newHands = null) {
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


// ----------------- イベントハンドラ -----------------

/** 💡 成り選択後の最終処理 (駒コードを正規化) */
function finalizeMove(pieceCode) {
    const { from, to, capturedPieceCode } = pendingMove;
    const isP1 = currentTurn === 'P1';
    let finalPieceCode = pieceCode;
    
    // 💡 成った場合、P1は'+R'、P2は'+r'になるように正規化する
    if (pieceCode.startsWith('+')) {
         const basePiece = pieceCode.toUpperCase().replace('+', '');
         // P1は +R, +S など大文字の成駒コード
         // P2は +r, +s など小文字の成駒コード
         finalPieceCode = isP1 ? ('+' + basePiece) : ('+' + basePiece.toLowerCase());
    }
    
    // 1. 捕獲された駒の持ち駒化
    if (capturedPieceCode !== '') {
        const basePiece = capturedPieceCode.toUpperCase().replace('+', ''); 
        
        // 持ち駒は非成駒に戻す
        const convertedPiece = isP1 
            ? basePiece.toUpperCase() 
            : basePiece.toLowerCase();

        const targetHand = isP1 ? 'P1' : 'P2';
        hands[targetHand][convertedPiece] = (hands[targetHand][convertedPiece] || 0) + 1;
        console.log(`捕獲！持ち駒:${PIECES[convertedPiece]}を追加`);
    }
    
    // 2. サーバーに送信
    const moveData = { 
        from: from, 
        to: to,
        pieceCode: finalPieceCode, // 正規化された駒コード
        hands: hands 
    };
    socket.emit('move', moveData);
    
    // 3. 自端末の盤面を更新
    updateBoardState(from, to, finalPieceCode); 
    
    // 4. 選択解除とターン交代
    if (selectedSquare) {
        selectedSquare.classList.remove('selected');
    }
    selectedSquare = null;
    pendingMove = null;
    
    document.querySelectorAll('.square.possible-move').forEach(sq => sq.classList.remove('possible-move'));

    currentTurn = (currentTurn === 'P1' ? 'P2' : 'P1');
    console.log(`ターン交代: ${currentTurn}`);
}

/** 持ち駒がクリックされた時の処理 */
function handleHandPieceClick(event) {
    if (!myRole || currentTurn !== myRole || pendingMove) return; 
    
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


/** マス目がクリックされた時の処理 */
function handleSquareClick(event) {
    if (!myRole || currentTurn !== myRole || pendingMove) return; 
    
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
        
        const moveData = {
            from: 'HAND', to: to, pieceCode: pieceCode, hands: hands
        };
        socket.emit('move', moveData);
        updateBoardState('HAND', to, pieceCode); 
        selectedHandPiece = null;
        currentTurn = (currentTurn === 'P1' ? 'P2' : 'P1');
        document.querySelectorAll('.square.possible-move').forEach(sq => sq.classList.remove('possible-move'));
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

        // --- 💡 成り判定と選択 ---
        const canPromote = isPromotable(pieceCode) && !pieceCode.startsWith('+');
        const startsInZone = isInPromotionZone(fromRankInt, isP1);
        const endsInZone = isInPromotionZone(toRankInt, isP1);
        
        let willPromote = false;
        
        if (canPromote && (startsInZone || endsInZone)) {
            // A. 強制成り (行き所のない移動)
            const mustPromote = (
                (basePiece === 'P' && (isP1 ? toRankInt === 1 : toRankInt === 9)) ||
                (basePiece === 'L' && (isP1 ? toRankInt === 1 : toRankInt === 9)) ||
                (basePiece === 'N' && (isP1 ? (toRankInt === 1 || toRankInt === 2) : (toRankInt === 8 || toRankInt === 9)))
            );
            
            if (mustPromote) {
                willPromote = true; // 強制的に成る
                console.log(`${PIECES[pieceCode]} は強制成りします。`);
            } else if (startsInZone || endsInZone) {
                // B. 選択成り (成れるエリア内での移動)
                
                // 1. 選択用のデータを一時保存
                pendingMove = { from, to, pieceCode, capturedPieceCode };

                // 2. ダイアログを表示し、ユーザーの選択を待つ
                promotionDialog.style.display = 'block';
                return; // 処理を一時中断
            }
        }
        
        // 強制成りでの移動の場合
        if (willPromote) {
            pieceCode = (isP1 ? '+' : '+') + pieceCode; 
        }

        // 最終処理を実行
        pendingMove = { from, to, capturedPieceCode }; // 捕獲処理のために保存
        finalizeMove(pieceCode);
    }
}

// ----------------- 成り選択ボタンのイベント処理 -----------------

document.getElementById('promote-yes').addEventListener('click', () => {
    if (pendingMove) {
        // 成る場合は、元の駒コードに '+' をつけたものを渡す
        const newPieceCode = '+' + pendingMove.pieceCode;
        promotionDialog.style.display = 'none';
        finalizeMove(newPieceCode);
    }
});

document.getElementById('promote-no').addEventListener('click', () => {
    if (pendingMove) {
        // 成らない場合は、元の駒コードをそのまま渡す
        const newPieceCode = pendingMove.pieceCode; 
        promotionDialog.style.display = 'none';
        
        finalizeMove(newPieceCode);
    }
});

// ----------------- 役割選択ボタンのイベント処理 -----------------

selectP1Button.addEventListener('click', () => {
    selectRole('P1');
});
selectP2Button.addEventListener('click', () => {
    selectRole('P2');
});
selectRandomButton.addEventListener('click', () => {
    selectRole('RANDOM');
});

function selectRole(role) {
    // 選択肢を無効化
    selectP1Button.disabled = true;
    selectP2Button.disabled = true;
    selectRandomButton.disabled = true;
    
    selectionStatus.textContent = `${role === 'RANDOM' ? 'ランダム' : role}で相手を待っています...`;
    
    // サーバーに希望の役割を送信
    socket.emit('request_role', { requestedRole: role });
}

// --- 実行 ---
createBoard();
renderPieces();
renderHands();

// --- Socket.IOの処理 ---
const socket = io();

socket.on('match start', (data) => {
    myRole = data.role;
    const myRoleText = myRole === 'P1' ? '先手' : '後手';
    
    // 💡 選択画面を非表示にし、bodyにクラスを追加
    selectionScreen.style.display = 'none';
    document.body.classList.add('game-started');
    
    infoDisplay.innerHTML = `<p><strong>マッチング成功！あなたの役割: ${myRoleText}</strong></p>`;
    
    if (myRole === 'P2') {
        document.body.classList.add('p2-view');
    }
});

socket.on('waiting', (msg) => {
    // 待機メッセージの表示はそのまま
    infoDisplay.innerHTML = `<p><strong>${msg}</strong></p>`;
});

// サーバーから「move」イベント（相手の指し手）を受け取った時の処理
socket.on('move', (moveData) => {
    console.log("相手の指し手を受信:", moveData);
    
    // 相手の指し手を盤面と持ち駒に反映
    updateBoardState(moveData.from, moveData.to, moveData.pieceCode, moveData.hands);
    
    // ターン交代
    currentTurn = (currentTurn === 'P1' ? 'P2' : 'P1');
    
    const currentRoleText = currentTurn === 'P1' ? '先手' : '後手';
    const turnInfo = document.querySelector('#info-display p');
    if (turnInfo) {
         turnInfo.innerHTML = `<strong>${myRole === currentTurn ? 'あなたのターン' : '相手のターン'} (${currentRoleText})</strong>`;
    }
});