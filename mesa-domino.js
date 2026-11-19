// === INICIO BLOQUE 1 DE 4 ===
document.addEventListener('DOMContentLoaded', () => {
    const TARGET_SCORE = 300;
    const TURN_TIME_LIMIT = 20;
    const STORAGE_RANKING_KEY = 'domino_fed_ranking_v1';

    const PIP_MAP = {
        0: new Array(),
        1: Array.of(4),
        2: Array.of(2, 6),
        3: Array.of(2, 4, 6),
        4: Array.of(0, 2, 6, 8),
        5: Array.of(0, 2, 4, 6, 8),
        6: Array.of(0, 2, 3, 5, 6, 8)
    };

    const PLAYER_NAMES = Array.of('Tú', 'Bot 2 (Rival Der)', 'Bot 3 (Compañero)', 'Bot 4 (Rival Izq)');

    let state = {
        userName: 'Tú',
        userClub: '',
        scores: { us: 0, them: 0 },
        hands: Array.of(new Array(), new Array(), new Array(), new Array()),
        board: new Array(),
        leftEnd: null,
        rightEnd: null,
        currentTurn: 0,
        startingPlayer: null,
        isFirstHand: true,
        consecutivePasses: 0,
        gameActive: false,
        pendingTileIndex: null,
        timerInterval: null,
        timeLeft: TURN_TIME_LIMIT,
        botTimeout: null
    };

    const dom = {
        loginModal: document.getElementById('login-modal'),
        playerAlias: document.getElementById('player-alias'),
        playerClub: document.getElementById('player-club'),
        btnStartGame: document.getElementById('btn-start-game'),

        rankingModal: document.getElementById('ranking-modal'),
        rankingBody: document.getElementById('ranking-body'),
        btnShowRanking: document.getElementById('btn-show-ranking'),
        btnCloseRanking: document.getElementById('btn-close-ranking'),
     handSummaryModal: document.getElementById('hand-summary-modal'),
     summaryTitle: document.getElementById('summary-title'),
     summaryDetail: document.getElementById('summary-detail'),
     summaryScores: document.getElementById('summary-scores'),
     btnNextHand: document.getElementById('btn-next-hand'),

        lblUserName: document.getElementById('lbl-user-name'),
        badgeUserName: document.getElementById('badge-user-name'),
        scoreUs: document.getElementById('score-us'),
        scoreThem: document.getElementById('score-them'),
        timerBox: document.getElementById('timer-box'),
        timerVal: document.getElementById('timer-val'),
        btnNewMatch: document.getElementById('btn-new-match'),

        gameLog: document.getElementById('game-log'),
        carroContainer: document.getElementById('carro-container'),
        sideSelector: document.getElementById('side-selector'),
        btnPlayLeft: document.getElementById('btn-play-left'),
        btnPlayRight: document.getElementById('btn-play-right'),
        valLeft: document.getElementById('val-left'),
        valRight: document.getElementById('val-right'),
        btnPass: document.getElementById('btn-pass'),

        handContainers: Array.of(
            document.getElementById('hand-p0'),
            document.getElementById('hand-p1'),
            document.getElementById('hand-p2'),
            document.getElementById('hand-p3')
        ),
        countLabels: Array.of(
            null,
            document.getElementById('count-p1'),
            document.getElementById('count-p2'),
            document.getElementById('count-p3')
        ),
        thoughtBubbles: Array.of(
            document.getElementById('thought-p0'),
            document.getElementById('thought-p1'),
            document.getElementById('thought-p2'),
            document.getElementById('thought-p3')
        )
    };

    function createDeck() {
        const deck = new Array();
        for (let i = 0; i <= 6; i++) {
            for (let j = i; j <= 6; j++) {
                deck.push({ a: i, b: j });
            }
        }
        return deck;
    }

    function shuffleDeck(deck) {
        const arr = deck.slice();
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const temp = arr.at(i);
            arr.splice(i, 1, arr.at(j));
            arr.splice(j, 1, temp);
        }
        return arr;
    }
// === FIN BLOQUE 1 DE 4 ===
// === INICIO BLOQUE 2 DE 4 ===
    function isDouble(tile) {
        return tile.a === tile.b;
    }

    function tileWeight(tile) {
        return tile.a + tile.b;
    }

    function handPoints(hand) {
        return hand.reduce((acc, t) => acc + tileWeight(t), 0);
    }

    function canPlayTile(tile) {
        if (state.board.length === 0) {
            if (state.isFirstHand) {
                return tile.a === 6 && tile.b === 6;
            }
            return true;
        }
        return (
            tile.a === state.leftEnd ||
            tile.b === state.leftEnd ||
            tile.a === state.rightEnd ||
            tile.b === state.rightEnd
        );
    }
    function getValidSides(tile) {
        if (state.board.length === 0) return Array.of('center');

        // Regla FED: Si ambos extremos del carro son iguales, se juega obligatoriamente por la derecha
        if (state.leftEnd === state.rightEnd) {
            if (tile.a === state.rightEnd || tile.b === state.rightEnd) {
                return Array.of('right');
            }
            return new Array();
        }

        const sides = new Array();
        if (tile.a === state.leftEnd || tile.b === state.leftEnd) {
            sides.push('left');
        }
        if (tile.a === state.rightEnd || tile.b === state.rightEnd) {
            sides.push('right');
        }
        return sides;
    }

    function createHalfElement(value) {
        const half = document.createElement('div');
        half.className = 'half';
        const activeIndices = PIP_MAP[value] || new Array();
        for (let i = 0; i < 9; i++) {
            const cell = document.createElement('div');
            if (activeIndices.includes(i)) {
                cell.className = 'pip';
            }
            half.appendChild(cell);
        }
        return half;
    }

    function createTileElement(val1, val2, isHorizontal) {
        const tileEl = document.createElement('div');
        tileEl.className = 'domino-tile' + (isHorizontal ? ' horizontal' : '');

        const half1 = createHalfElement(val1);
        const divider = document.createElement('div');
        divider.className = 'divider';
        const half2 = createHalfElement(val2);

        tileEl.appendChild(half1);
        tileEl.appendChild(divider);
        tileEl.appendChild(half2);

        return tileEl;
    }

    function renderBoard() {
        dom.carroContainer.innerHTML = '';
        if (state.board.length === 0) return;

        let centerIdx = state.board.findIndex(t => t.isCenter);
        if (centerIdx === -1) centerIdx = 0;

        const isMobile = window.innerWidth <= 900;
        const S = isMobile ? 22 : 34;
        const L = S * 2;
        const GAP = 2;

        const stage = document.createElement('div');
        stage.className = 'carro-stage';

        const placed = new Array();

        function addPlacedTile(inVal, outVal, isDbl, cx, cy, dir) {
            const isHoriz = isDbl ? (dir === 'U' || dir === 'D') : (dir === 'R' || dir === 'L');
            const w = isHoriz ? L : S;
            const h = isHoriz ? S : L;

            let v1 = inVal;
            let v2 = outVal;

            if (!isDbl && (dir === 'L' || dir === 'U')) {
                v1 = outVal;
                v2 = inVal;
            }

            const el = createTileElement(v1, v2, isHoriz);
            el.style.width = w + 'px';
            el.style.height = h + 'px';
            el.style.left = (cx - w / 2) + 'px';
            el.style.top = (cy - h / 2) + 'px';
            stage.appendChild(el);
            placed.push({ cx, cy, w, h });
            return { w, h };
        }

        const centerItem = state.board.at(centerIdx);
        const cDims = addPlacedTile(centerItem.left, centerItem.right, centerItem.isDouble, 0, 0, 'R');

        let rX = cDims.w / 2;
        let rY = 0;
        let rDir = 'R';
        let rNonDoubles = 0;

        for (let i = centerIdx + 1; i < state.board.length; i++) {
            const item = state.board.at(i);
            if (!item.isDouble) rNonDoubles++;

            if (rDir === 'R' && rNonDoubles === 4) {
                rDir = 'U';
                rX -= S / 2;
                rY -= S / 2;
            } else if (rDir === 'U' && rNonDoubles === 6) {
                rDir = 'L';
                rX += S / 2;
                rY -= S / 2;
            }

            const isHoriz = item.isDouble ? (rDir === 'U' || rDir === 'D') : (rDir === 'R' || rDir === 'L');
            const w = isHoriz ? L : S;
            const h = isHoriz ? S : L;

            let cx = rX;
            let cy = rY;
            if (rDir === 'R') {
                cx = rX + GAP + w / 2;
                rX = cx + w / 2;
            } else if (rDir === 'U') {
                cy = rY - GAP - h / 2;
                rY = cy - h / 2;
            } else if (rDir === 'L') {
                cx = rX - GAP - w / 2;
                rX = cx - w / 2;
            }

            addPlacedTile(item.left, item.right, item.isDouble, cx, cy, rDir);
        }

        let lX = -cDims.w / 2;
        let lY = 0;
        let lDir = 'L';
        let lNonDoubles = 0;

        for (let i = centerIdx - 1; i >= 0; i--) {
            const item = state.board.at(i);
            if (!item.isDouble) lNonDoubles++;

            if (lDir === 'L' && lNonDoubles === 4) {
                lDir = 'D';
                lX += S / 2;
                lY += S / 2;
            } else if (lDir === 'D' && lNonDoubles === 6) {
                lDir = 'R';
                lX -= S / 2;
                lY += S / 2;
            }

            const isHoriz = item.isDouble ? (lDir === 'U' || lDir === 'D') : (lDir === 'R' || lDir === 'L');
            const w = isHoriz ? L : S;
            const h = isHoriz ? S : L;

            let cx = lX;
            let cy = lY;
            if (lDir === 'L') {
                cx = lX - GAP - w / 2;
                lX = cx - w / 2;
            } else if (lDir === 'D') {
                cy = lY + GAP + h / 2;
                lY = cy + h / 2;
            } else if (lDir === 'R') {
                cx = lX + GAP + w / 2;
                lX = cx + w / 2;
            }

            addPlacedTile(item.right, item.left, item.isDouble, cx, cy, lDir);
        }

        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        placed.forEach(p => {
            minX = Math.min(minX, p.cx - p.w / 2);
            maxX = Math.max(maxX, p.cx + p.w / 2);
            minY = Math.min(minY, p.cy - p.h / 2);
            maxY = Math.max(maxY, p.cy + p.h / 2);
        });

        const totalW = maxX - minX;
        const totalH = maxY - minY;
        const offsetX = -(minX + totalW / 2);
        const offsetY = -(minY + totalH / 2);

        Array.from(stage.children).forEach(el => {
            el.style.left = (parseFloat(el.style.left) + offsetX) + 'px';
            el.style.top = (parseFloat(el.style.top) + offsetY) + 'px';
        });

        dom.carroContainer.appendChild(stage);

        const availW = dom.carroContainer.clientWidth - 16;
        const availH = dom.carroContainer.clientHeight - 16;
        if (availW > 0 && availH > 0 && (totalW > availW || totalH > availH)) {
            const scale = Math.min(availW / totalW, availH / totalH, 1);
            stage.style.transform = `scale(${scale.toFixed(3)})`;
        }
    }

    function renderHands() {
        const userContainer = dom.handContainers.at(0);
        userContainer.innerHTML = '';
        const isUserTurn = state.gameActive && state.currentTurn === 0;
        const userHand = state.hands.at(0);

        userHand.forEach((tile, idx) => {
            const tileEl = createTileElement(tile.a, tile.b, false);
            const playable = isUserTurn && canPlayTile(tile);

            if (playable) {
                tileEl.classList.add('playable');
                tileEl.addEventListener('click', () => handleUserTileClick(idx));
            } else if (isUserTurn) {
                tileEl.classList.add('disabled');
            }

            userContainer.appendChild(tileEl);
        });

        for (let p = 1; p <= 3; p++) {
            const botContainer = dom.handContainers.at(p);
            botContainer.innerHTML = '';
            const count = state.hands.at(p).length;
            dom.countLabels.at(p).textContent = `${count} ${count === 1 ? 'ficha' : 'fichas'}`;
            for (let i = 0; i < count; i++) {
                const back = document.createElement('div');
                back.className = 'tile-back';
                botContainer.appendChild(back);
            }
        }
    }

    function updateScoreboard() {
        dom.scoreUs.textContent = state.scores.us;
        dom.scoreThem.textContent = state.scores.them;
    }

    function setLog(message, reset = false) {
        if (reset) {
            dom.gameLog.innerHTML = '';
        }
        const entry = document.createElement('div');
        entry.textContent = '• ' + message;
        dom.gameLog.appendChild(entry);
        dom.gameLog.scrollTop = dom.gameLog.scrollHeight;
    }

    function showThought(playerIdx, text, duration = 2200) {
        const el = dom.thoughtBubbles.at(playerIdx);
        if (!el) return;
        el.textContent = text;
        if (duration > 0) {
            setTimeout(() => {
                if (el.textContent === text) {
                    el.textContent = '';
                }
            }, duration);
        }
    }

    function clearAllThoughts() {
        dom.thoughtBubbles.forEach(el => {
            if (el) el.textContent = '';
        });
    }
     function highlightActivePlayer(playerIdx) {
     dom.thoughtBubbles.forEach((el, idx) => {
         if (!el) return;
         const badge = el.closest('.player-badge');
         if (!badge) return;
         if (idx === playerIdx && state.gameActive) {
             badge.classList.add('active-turn');
         } else {
             badge.classList.remove('active-turn');
         }
     });
 }

// === FIN BLOQUE 2 DE 4 ===

// === INICIO BLOQUE 3A ===
    function startNewMatch() {
        clearTimers();
        state.scores = { us: 0, them: 0 };
        state.isFirstHand = true;
        state.startingPlayer = null;
        updateScoreboard();
        startNewHand();
    }

    function startNewHand() {
        clearTimers();
        clearAllThoughts();
        hideSideSelector();
        dom.btnPass.classList.add('hidden');
        if (dom.handSummaryModal) {
            dom.handSummaryModal.classList.add('hidden');
        }

        const deck = shuffleDeck(createDeck());
        state.hands = Array.of(
            deck.slice(0, 7),
            deck.slice(7, 14),
            deck.slice(14, 21),
            deck.slice(21, 28)
        );

        state.hands.at(0).sort((x, y) => (x.a - y.a) || (x.b - y.b));

        state.board = new Array();
        state.leftEnd = null;
        state.rightEnd = null;
        state.consecutivePasses = 0;
        state.pendingTileIndex = null;
        state.gameActive = true;

        if (state.isFirstHand) {
            let starter = 0;
            for (let p = 0; p < 4; p++) {
                if (state.hands.at(p).some(t => t.a === 6 && t.b === 6)) {
                    starter = p;
                    break;
                }
            }
            state.startingPlayer = starter;
            state.currentTurn = starter;
            setLog(`Salida obligatoria con 6|6: empieza ${getPlayerLabel(starter)}.`, true);
        } else {
            state.startingPlayer = (state.startingPlayer + 1) % 4;
            state.currentTurn = state.startingPlayer;
            setLog(`Nueva mano: sale ${getPlayerLabel(state.currentTurn)}.`, true);
        }

        renderBoard();
        renderHands();
        beginTurn();
    }

    function getPlayerLabel(idx) {
        return idx === 0 ? state.userName : PLAYER_NAMES.at(idx);
    }

    function beginTurn() {
        if (!state.gameActive) return;
        hideSideSelector();
        renderHands();

        const p = state.currentTurn;
        highlightActivePlayer(p);
        const playableIndices = new Array();
        state.hands.at(p).forEach((t, idx) => {
            if (canPlayTile(t)) playableIndices.push(idx);
        });

        startTurnTimer();

        if (p === 0) {
            if (playableIndices.length === 0) {
                dom.btnPass.classList.remove('hidden');
                showThought(0, 'Paso', 0);
                setLog('No llevas fichas que casen: pasando...');
                state.botTimeout = setTimeout(() => {
                    if (state.gameActive && state.currentTurn === 0) {
                        passTurn(0, false);
                    }
                }, 900);
            } else if (playableIndices.length === 1) {
                const onlyIdx = playableIndices.at(0);
                const onlyTile = state.hands.at(0).at(onlyIdx);
                const validSides = getValidSides(onlyTile);

                if (validSides.length === 1) {
                    dom.btnPass.classList.add('hidden');
                    showThought(0, '', 0);
                    setLog(`Única jugada posible (${onlyTile.a}|${onlyTile.b})...`);
                    state.botTimeout = setTimeout(() => {
                        if (state.gameActive && state.currentTurn === 0) {
                            playTile(0, onlyIdx, validSides.at(0));
                        }
                    }, 900);
                } else {
                    dom.btnPass.classList.add('hidden');
                    showThought(0, 'Elige extremo', 0);
                    setLog('Tu ficha entra por ambos lados: elige extremo.');
                }
            } else {
                dom.btnPass.classList.add('hidden');
                showThought(0, 'Tu turno', 0);
                setLog('Tu turno: selecciona una ficha iluminada.');
            }
        } else {
            dom.btnPass.classList.add('hidden');
            planAndExecuteBotTurn(p);
        }
    }

    function startTurnTimer() {
        clearInterval(state.timerInterval);
        state.timeLeft = TURN_TIME_LIMIT;
        let inExtraTime = false;
        dom.timerVal.textContent = state.timeLeft;
        dom.timerBox.classList.remove('warning');

        state.timerInterval = setInterval(() => {
            if (!state.gameActive) {
                clearInterval(state.timerInterval);
                return;
            }
            state.timeLeft--;

            if (!inExtraTime && state.timeLeft <= 0) {
                inExtraTime = true;
                state.timeLeft = 5;
                dom.timerBox.classList.add('warning');
                dom.timerVal.textContent = '+' + state.timeLeft;
                return;
            }

            if (inExtraTime) {
                dom.timerVal.textContent = '+' + Math.max(0, state.timeLeft);
                if (state.timeLeft <= 0) {
                    clearInterval(state.timerInterval);
                    handleTimeoutAutoPlay();
                }
            } else {
                dom.timerVal.textContent = Math.max(0, state.timeLeft);
                if (state.timeLeft <= 5) {
                    dom.timerBox.classList.add('warning');
                }
            }
        }, 1000);
    }

    function clearTimers() {
        clearInterval(state.timerInterval);
        clearTimeout(state.botTimeout);
        dom.timerBox.classList.remove('warning');
    }
// === FIN BLOQUE 3A ===

// === INICIO BLOQUE 3B ===
    function handleTimeoutAutoPlay() {
        if (!state.gameActive) return;
        const p = state.currentTurn;
        const playableIndices = new Array();
        state.hands.at(p).forEach((t, idx) => {
            if (canPlayTile(t)) playableIndices.push(idx);
        });

        if (playableIndices.length === 0) {
            passTurn(p, true);
        } else {
            const chosenIdx = playableIndices.at(0);
            const tile = state.hands.at(p).at(chosenIdx);
            const sides = getValidSides(tile);
            playTile(p, chosenIdx, sides.at(0));
        }
    }

    function handleUserTileClick(tileIndex) {
        if (!state.gameActive || state.currentTurn !== 0) return;
        const tile = state.hands.at(0).at(tileIndex);
        if (!canPlayTile(tile)) return;

        const sides = getValidSides(tile);
        if (sides.length > 1) {
            state.pendingTileIndex = tileIndex;
            dom.valLeft.textContent = state.leftEnd;
            dom.valRight.textContent = state.rightEnd;
            dom.sideSelector.classList.remove('hidden');
        } else {
            playTile(0, tileIndex, sides.at(0));
        }
    }

    function hideSideSelector() {
        dom.sideSelector.classList.add('hidden');
        state.pendingTileIndex = null;
    }

    function planAndExecuteBotTurn(botIdx) {
        if (!state.gameActive || state.currentTurn !== botIdx) return;

        const hand = state.hands.at(botIdx);
        const validMoves = new Array();

        hand.forEach((tile, idx) => {
            if (canPlayTile(tile)) {
                const sides = getValidSides(tile);
                sides.forEach(side => {
                    validMoves.push({ idx, tile, side });
                });
            }
        });

        // 1. Sin fichas que casen: obligado por norma FED a pasar con prontitud (0,9s)
        if (validMoves.length === 0) {
            showThought(botIdx, '', 0);
            state.botTimeout = setTimeout(() => {
                passTurn(botIdx, false);
            }, 900);
            return;
        }

        // Contar frecuencia de palos en la mano del bot
        const suitCounts = new Array(7).fill(0);
        hand.forEach(t => {
            suitCounts.splice(t.a, 1, suitCounts.at(t.a) + 1);
            if (t.a !== t.b) {
                suitCounts.splice(t.b, 1, suitCounts.at(t.b) + 1);
            }
        });

        // Elegir la mejor jugada táctica
        let bestMove = validMoves.at(0);
        let bestScore = -999;

        validMoves.forEach(move => {
            let score = 0;
            const { tile, side } = move;

            if (isDouble(tile)) {
                score += 18 + tileWeight(tile);
            }

            score += tileWeight(tile) * 1.2;

            let newOpenEnd = null;
            if (side === 'center') {
                newOpenEnd = tile.a;
            } else if (side === 'left') {
                newOpenEnd = tile.a === state.leftEnd ? tile.b : tile.a;
            } else {
                newOpenEnd = tile.a === state.rightEnd ? tile.b : tile.a;
            }

            score += suitCounts.at(newOpenEnd) * 6;

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        });

        // 2. Una sola jugada posible (1 ficha y 1 solo lado): obligado por norma FED a jugar a 0,9s
        if (validMoves.length === 1) {
            showThought(botIdx, '', 0);
            state.botTimeout = setTimeout(() => {
                playTile(botIdx, bestMove.idx, bestMove.side);
            }, 900);
            return;
        }

        // 3. Sistema Combinado de la Pensada (tiene 2 o más opciones)
        let openedSuit = null;
        if (bestMove.side === 'center') {
            openedSuit = bestMove.tile.a;
        } else if (bestMove.side === 'left') {
            openedSuit = bestMove.tile.a === state.leftEnd ? bestMove.tile.b : bestMove.tile.a;
        } else {
            openedSuit = bestMove.tile.a === state.rightEnd ? bestMove.tile.b : bestMove.tile.a;
        }

        const remainingInOpenedSuit = suitCounts.at(openedSuit) - 1;
        const isStrongSuit = remainingInOpenedSuit >= 2 || (isDouble(bestMove.tile) && remainingInOpenedSuit >= 1);

        const thinkDelay = isStrongSuit ? 5500 : 9500;

        showThought(botIdx, 'Pensando...', 0);
        state.botTimeout = setTimeout(() => {
            playTile(botIdx, bestMove.idx, bestMove.side);
        }, thinkDelay);
    }
// === FIN BLOQUE 3B ===
// === INICIO BLOQUE 4A ===
    function playTile(playerIdx, tileIndex, side) {
        clearTimers();
        hideSideSelector();
        dom.btnPass.classList.add('hidden');

        const removed = state.hands.at(playerIdx).splice(tileIndex, 1);
        const tile = removed.at(0);
        const dbl = isDouble(tile);

        if (state.board.length === 0 || side === 'center') {
            state.board.push({ left: tile.a, right: tile.b, isDouble: dbl, isCenter: true });
            state.leftEnd = tile.a;
            state.rightEnd = tile.b;
        } else if (side === 'left') {
            if (tile.b === state.leftEnd) {
                state.board.unshift({ left: tile.a, right: tile.b, isDouble: dbl });
                state.leftEnd = tile.a;
            } else {
                state.board.unshift({ left: tile.b, right: tile.a, isDouble: dbl });
                state.leftEnd = tile.b;
            }
        } else if (side === 'right') {
            if (tile.a === state.rightEnd) {
                state.board.push({ left: tile.a, right: tile.b, isDouble: dbl });
                state.rightEnd = tile.b;
            } else {
                state.board.push({ left: tile.b, right: tile.a, isDouble: dbl });
                state.rightEnd = tile.a;
            }
        }

        state.consecutivePasses = 0;
        state.isFirstHand = false;

        showThought(playerIdx, `Juega ${tile.a}|${tile.b}`, 1800);
        setLog(`${getPlayerLabel(playerIdx)} jugó ${tile.a}|${tile.b}.`);

        renderBoard();
        renderHands();

        if (state.hands.at(playerIdx).length === 0) {
            handleHandWinByDomino(playerIdx);
            return;
        }

        state.currentTurn = (state.currentTurn + 1) % 4;
        beginTurn();
    }

    function passTurn(playerIdx, byTimeout) {
        clearTimers();
        hideSideSelector();
        dom.btnPass.classList.add('hidden');

        state.consecutivePasses++;
        const reason = byTimeout ? '¡Tiempo agotado! Paso' : '¡Paso!';
        showThought(playerIdx, reason, 2000);
               setLog(`${getPlayerLabel(playerIdx)} pasa.`);
                if (state.consecutivePasses >= 4) {
            handleHandClosed();
            return;
        }

        state.currentTurn = (state.currentTurn + 1) % 4;
        beginTurn();
    }

    function formatHandList(hand) {
        if (hand.length === 0) return 'Sin fichas (0 pts)';
        return hand.map(t => `${t.a}|${t.b}`).join(', ') + ` (${handPoints(hand)} pts)`;
    }

    function handleHandWinByDomino(winnerIdx) {
        state.gameActive = false;
        highlightActivePlayer(-1);
        const usWon = winnerIdx === 0 || winnerIdx === 2;

        const pointsUsRemaining = handPoints(state.hands.at(0)) + handPoints(state.hands.at(2));
        const pointsThemRemaining = handPoints(state.hands.at(1)) + handPoints(state.hands.at(3));

        let title = '';
        let summaryText = '';

        if (usWon) {
            const gained = pointsThemRemaining;
            state.scores.us += gained;
            title = `🎉 ¡DOMINÓ de ${getPlayerLabel(winnerIdx)}!`;
            summaryText = `Nosotros ganamos la mano y sumamos +${gained} tantos.\n` +
                `• ${state.userName}: ${formatHandList(state.hands.at(0))}\n` +
                `• Bot 3 (Compañero): ${formatHandList(state.hands.at(2))}\n` +
                `• Bot 2 (Rival Der): ${formatHandList(state.hands.at(1))}\n` +
                `• Bot 4 (Rival Izq): ${formatHandList(state.hands.at(3))}`;
            setLog(`¡DOMINÓ de ${getPlayerLabel(winnerIdx)}! Nosotros sumamos +${gained} puntos.`);
        } else {
            const gained = pointsUsRemaining;
            state.scores.them += gained;
            title = `😔 ¡DOMINÓ de ${getPlayerLabel(winnerIdx)}!`;
            summaryText = `Los rivales ganan la mano y suman +${gained} tantos.\n` +
                `• ${state.userName}: ${formatHandList(state.hands.at(0))}\n` +
                `• Bot 3 (Compañero): ${formatHandList(state.hands.at(2))}\n` +
                `• Bot 2 (Rival Der): ${formatHandList(state.hands.at(1))}\n` +
                `• Bot 4 (Rival Izq): ${formatHandList(state.hands.at(3))}`;
            setLog(`¡DOMINÓ de ${getPlayerLabel(winnerIdx)}! Rivales suman +${gained} puntos.`);
        }

        updateScoreboard();
        showHandSummaryModal(title, summaryText);
    }

    function handleHandClosed() {
        state.gameActive = false;
        highlightActivePlayer(-1);
        const ptsUs = handPoints(state.hands.at(0)) + handPoints(state.hands.at(2));
        const ptsThem = handPoints(state.hands.at(1)) + handPoints(state.hands.at(3));

        let title = '🔒 ¡MANO CERRADA (TRANCA)!';
        let summaryText = '';

        if (ptsUs < ptsThem) {
            state.scores.us += ptsThem;
            summaryText = `¡Ganamos el cierre! Nosotros (${ptsUs} pts) tenemos menos puntos que Rivales (${ptsThem} pts) y sumamos +${ptsThem} tantos.\n` +
                `• ${state.userName}: ${formatHandList(state.hands.at(0))}\n` +
                `• Bot 3 (Compañero): ${formatHandList(state.hands.at(2))}\n` +
                `• Bot 2 (Rival Der): ${formatHandList(state.hands.at(1))}\n` +
                `• Bot 4 (Rival Izq): ${formatHandList(state.hands.at(3))}`;
            setLog(`¡CIERRE! Nosotros (${ptsUs} pts) ganamos a Rivales (${ptsThem} pts). +${ptsThem} puntos.`);
        } else if (ptsThem < ptsUs) {
            state.scores.them += ptsUs;
            summaryText = `Rivales ganan el cierre (${ptsThem} pts frente a ${ptsUs} pts nuestros) y suman +${ptsUs} tantos.\n` +
                `• ${state.userName}: ${formatHandList(state.hands.at(0))}\n` +
                `• Bot 3 (Compañero): ${formatHandList(state.hands.at(2))}\n` +
                `• Bot 2 (Rival Der): ${formatHandList(state.hands.at(1))}\n` +
                `• Bot 4 (Rival Izq): ${formatHandList(state.hands.at(3))}`;
            setLog(`¡CIERRE! Rivales (${ptsThem} pts) ganan a Nosotros (${ptsUs} pts). +${ptsUs} puntos.`);
        } else {
            summaryText = `¡Cierre empatado a ${ptsUs} puntos! Nadie suma tantos y corre el turno de salida.\n` +
                `• ${state.userName}: ${formatHandList(state.hands.at(0))}\n` +
                `• Bot 3 (Compañero): ${formatHandList(state.hands.at(2))}\n` +
                `• Bot 2 (Rival Der): ${formatHandList(state.hands.at(1))}\n` +
                `• Bot 4 (Rival Izq): ${formatHandList(state.hands.at(3))}`;
            setLog(`¡CIERRE EMPATADO a ${ptsUs} puntos! Nadie suma y corre mano.`);
        }

        updateScoreboard();
        showHandSummaryModal(title, summaryText);
    }

    function showHandSummaryModal(title, detailText) {
        const matchFinished = state.scores.us >= TARGET_SCORE || state.scores.them >= TARGET_SCORE;

        if (matchFinished) {
            const weWonMatch = state.scores.us >= TARGET_SCORE && state.scores.us > state.scores.them;
            saveMatchResultToRanking(weWonMatch, state.scores.us);
            dom.summaryTitle.textContent = weWonMatch
                ? '🏆 ¡VICTORIA EN LA PARTIDA!'
                : 'Fin de la Partida';
            dom.btnNextHand.textContent = '🔄 Jugar Nueva Partida';
        } else {
            dom.summaryTitle.textContent = title;
            dom.btnNextHand.textContent = '▶ Jugar Siguiente Mano';
        }

        dom.summaryDetail.style.whiteSpace = 'pre-line';
        dom.summaryDetail.style.textAlign = 'left';
        dom.summaryDetail.textContent = detailText;
        dom.summaryScores.textContent = `Marcador: Nosotros ${state.scores.us} — Rivales ${state.scores.them} (Meta: ${TARGET_SCORE})`;

        setTimeout(() => {
            dom.handSummaryModal.classList.remove('hidden');
        }, 1200);
    }
// === FIN BLOQUE 4A ===

// === INICIO BLOQUE 4B ===
    function getRanking() {
        try {
            const raw = localStorage.getItem(STORAGE_RANKING_KEY);
            if (raw) return JSON.parse(raw);
        } catch (e) {
            console.error('Error leyendo ranking:', e);
        }
        return Array.of(
            { name: 'Maestro FED (Valencia)', wins: 12, points: 3680 },
            { name: 'Peña El 6 Doble', wins: 9, points: 2810 },
            { name: 'Chiva Dominó', wins: 7, points: 2150 },
            { name: 'La Tranca', wins: 5, points: 1620 },
            { name: 'As de Pitos', wins: 3, points: 980 }
        );
    }

    function saveMatchResultToRanking(won, matchPoints) {
        const ranking = getRanking();
        const displayName = state.userClub
            ? `${state.userName} (${state.userClub})`
            : state.userName;

        let entry = ranking.find(r => r.name.toLowerCase() === displayName.toLowerCase());
        if (!entry) {
            entry = { name: displayName, wins: 0, points: 0 };
            ranking.push(entry);
        }

        if (won) entry.wins += 1;
        entry.points += matchPoints;

        ranking.sort((a, b) => (b.wins - a.wins) || (b.points - a.points));
        const top10 = ranking.slice(0, 10);

        try {
            localStorage.setItem(STORAGE_RANKING_KEY, JSON.stringify(top10));
        } catch (e) {
            console.error('Error guardando ranking:', e);
        }
    }

    function renderRankingTable() {
        const ranking = getRanking();
        dom.rankingBody.innerHTML = '';
        ranking.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${index + 1}</td>
                <td>${escapeHtml(item.name)}</td>
                <td>${item.wins}</td>
                <td>${item.points}</td>
            `;
            dom.rankingBody.appendChild(tr);
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    dom.btnStartGame.addEventListener('click', () => {
        const alias = dom.playerAlias.value.trim();
        const club = dom.playerClub.value.trim();

        state.userName = alias || 'Jugador';
        state.userClub = club;

        dom.lblUserName.textContent = state.userName;
        dom.badgeUserName.textContent = state.userClub
            ? `${state.userName} · ${state.userClub}`
            : `${state.userName} (Tú)`;

        dom.loginModal.classList.add('hidden');
        startNewMatch();
    });

    dom.playerAlias.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            dom.btnStartGame.click();
        }
    });

    dom.btnPlayLeft.addEventListener('click', () => {
        if (state.pendingTileIndex !== null) {
            playTile(0, state.pendingTileIndex, 'left');
        }
    });

    dom.btnPlayRight.addEventListener('click', () => {
        if (state.pendingTileIndex !== null) {
            playTile(0, state.pendingTileIndex, 'right');
        }
    });

    dom.btnPass.addEventListener('click', () => {
        if (state.gameActive && state.currentTurn === 0) {
            passTurn(0, false);
        }
    });

    dom.btnNewMatch.addEventListener('click', () => {
        startNewMatch();
    });

    dom.btnNextHand.addEventListener('click', () => {
        dom.handSummaryModal.classList.add('hidden');
        if (state.scores.us >= TARGET_SCORE || state.scores.them >= TARGET_SCORE) {
            startNewMatch();
        } else {
            startNewHand();
        }
    });

    dom.btnShowRanking.addEventListener('click', () => {
        renderRankingTable();
        dom.rankingModal.classList.remove('hidden');
    });

       dom.btnCloseRanking.addEventListener('click', () => {
        dom.rankingModal.classList.add('hidden');
    });

    window.addEventListener('resize', () => {
        if (state.board.length > 0) renderBoard();
    });
});
// === FIN BLOQUE 4B ===

