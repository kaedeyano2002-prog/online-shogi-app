// lobby.js (完全版 - ロビー機能の全てを含む)

document.addEventListener('DOMContentLoaded', () => {
    
    // --- 1. DOM要素の取得 ---
    const myNameDisplay = document.getElementById('my-name');
    const myNameInput = document.getElementById('player-name-input');
    const timeLimitSelect = document.getElementById('time-limit-select');
    const setNameButton = document.getElementById('set-name-button');
    const setTimeButton = document.getElementById('set-time-button');
    const lobbyList = document.getElementById('lobby-list');
    const inviteDialog = document.getElementById('invite-dialog');
    const acceptInviteButton = document.getElementById('accept-invite');
    const rejectInviteButton = document.getElementById('reject-invite');
    const inviteMessage = document.getElementById('invite-message');

    // 必須要素の存在チェック (lobby.jsのエラーを避けるため)
    if (!myNameInput || !timeLimitSelect || !myNameDisplay || !setNameButton || !setTimeButton || !lobbyList || !inviteDialog || !acceptInviteButton || !rejectInviteButton || !inviteMessage) {
        console.error("必要なDOM要素の一部が見つかりません。index.htmlのIDを確認してください。");
        return; 
    }
    
    // --- 2. 状態変数と永続データの初期化 ---
    const socket = io();
    
    // 💡 LocalStorageを利用してIDと名前を永続化する
    let myPersistentId = localStorage.getItem('persistentId') || `pId-${Math.random().toString(36).substring(2)}`;
    let myName = localStorage.getItem('playerName') || 'Player' + Math.floor(Math.random() * 1000);
    let myTimeLimit = localStorage.getItem('timeLimit') || '10min';
    let currentInvite = null; // 現在受けている招待データ
    
    // UIへの初期値設定とLocalStorageへの保存
    myNameInput.value = myName; 
    myNameDisplay.textContent = myName;
    timeLimitSelect.value = myTimeLimit;
    localStorage.setItem('persistentId', myPersistentId);


    // --- 3. Socket.IOイベントリスナー ---

    socket.on('connect', () => {
        console.log(`Socket connected with ID: ${socket.id}. Name: ${myName}`);
        
        // 💡 サーバーに自分の全情報を通知 (ロビーリスト登録のトリガー)
        socket.emit('reconnect_identity', { 
            currentSocketId: socket.id, 
            persistentId: myPersistentId,
            name: myName,
            timeLimit: myTimeLimit
        });
        
        // ロビーリストの初期表示を要求
        socket.emit('enter_lobby');
    });

    socket.on('update_lobby', (players) => {
        // ロビーリストをクリア
        lobbyList.innerHTML = ''; 
        
        if (!players || players.length === 0) {
            const li = document.createElement('li');
            li.textContent = '対戦可能なプレイヤーがいません。';
            lobbyList.appendChild(li);
            return;
        }

        // 💡 プレイヤーリストを描画 (自分以外のプレイヤー)
        players.forEach(player => {
            if (player.id !== socket.id) {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span>${player.name}</span>
                    <span class="time-limit">(${player.timeLimit})</span>
                    <button class="invite-button" data-invitee-id="${player.id}" data-invitee-name="${player.name}">招待</button>
                `;
                lobbyList.appendChild(li);
            }
        });
    });

    socket.on('receive_invite', (data) => {
        currentInvite = data;
        inviteMessage.textContent = `${data.inviterName} (${data.timeLimit}) からの対戦招待です。`;
        inviteDialog.style.display = 'block';
    });
    
    socket.on('invite_rejected', (data) => {
        alert(`${data.rejecteeName} は招待を拒否しました。`);
    });

    socket.on('match_found', (data) => {
        // 対局に必要な情報をセッションストレージに保存
        sessionStorage.setItem('shogiRoomId', data.roomId);
        sessionStorage.setItem('shogiRole', data.role);
        sessionStorage.setItem('shogiTimeLimit', data.timeLimit);
        
        // game.htmlへ遷移
        window.location.href = 'game.html'; 
    });

    socket.on('disconnect', (reason) => {
        console.log(`Disconnected: ${reason}`);
    });


    // --- 4. DOMイベントリスナーの設定 ---

    // 名前設定ボタン
    setNameButton.addEventListener('click', () => {
        const newName = myNameInput.value.trim();
        if (newName && newName !== myName) {
            myName = newName;
            localStorage.setItem('playerName', myName);
            myNameDisplay.textContent = myName;
            
            // サーバーに新しい名前を通知し、ロビーリストを更新させる
            socket.emit('update_identity', { name: myName });
        }
    });

    // 持ち時間設定ボタン
    setTimeButton.addEventListener('click', () => {
        const newTimeLimit = timeLimitSelect.value;
        if (newTimeLimit !== myTimeLimit) {
            myTimeLimit = newTimeLimit;
            localStorage.setItem('timeLimit', myTimeLimit);
            
            // サーバーに持ち時間を通知し、ロビーリストを更新させる
            socket.emit('update_identity', { timeLimit: myTimeLimit });
        }
    });
    
    // 招待ボタンのクリックイベント (動的要素のため親要素でリスナーを設定)
    lobbyList.addEventListener('click', (e) => {
        const button = e.target.closest('.invite-button');
        if (button) {
            const inviteeId = button.dataset.inviteeId;
            const inviteeName = button.dataset.inviteeName;
            
            socket.emit('send_invite', { 
                inviteeId: inviteeId,
                inviterName: myName,
                inviterId: socket.id,
                timeLimit: myTimeLimit
            });
            alert(`${inviteeName} に招待を送りました。返答をお待ちください。`);
        }
    });
    
    // 招待承諾ボタン
    acceptInviteButton.addEventListener('click', () => {
        if (currentInvite) {
            // 承諾をサーバーに通知。マッチング成立の処理はサーバー側で行う
            socket.emit('invite_response', { 
                inviterId: currentInvite.inviterId, 
                accepted: true,
                invitedTimeLimit: currentInvite.timeLimit
            });
            inviteDialog.style.display = 'none';
        }
    });

    // 招待拒否ボタン
    rejectInviteButton.addEventListener('click', () => {
        if (currentInvite) {
            // 拒否をサーバーに通知
            socket.emit('invite_response', { 
                inviterId: currentInvite.inviterId, 
                accepted: false,
                rejecteeName: myName
            });
            inviteDialog.style.display = 'none';
        }
    });
});