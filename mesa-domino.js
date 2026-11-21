// === INICIO BLOQUE 1 DE 4 ===
document.addEventListener('DOMContentLoaded', () => {
    let TARGET_SCORE = 300;
    const TURN_TIME_LIMIT = 20;
    const STORAGE_RANKING_KEY = 'domino_fed_ranking_v2';
    const STORAGE_MUTE_KEY = 'domino_fed_muted_v1';

    const PIP_MAP = {
        0: new Array(),
        1: Array.of(4),
        2: Array.of(2, 6),
        3: Array.of(2, 4, 6),
        4: Array.of(0, 2, 6, 8),
        5: Array.of(0, 2, 4, 6, 8),
        6: Array.of(0, 2, 3, 5, 6, 8)
    };

    const BOT_POOL = Array.of('Jesús', 'Eduardo', 'Gaby');
    let PLAYER_NAMES = Array.of('Tú', 'Jesús (Der)', 'Eduardo (Compañero)', 'Gaby (Izq)');

    let state = {
        userName: 'Tú',
        userClub: '',
        botSeats: Array.of(null, 'Jesús', 'Eduardo', 'Gaby'),
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
        botTimeout: null,
        isMuted: localStorage.getItem(STORAGE_MUTE_KEY) === 'true'
    };

    const dom = {
        loginModal: document.getElementById('login-modal'),
        playerAlias: document.getElementById('player-alias'),
        playerClub: document.getElementById('player-club'),
        targetSelector: document.getElementById('target-selector'),
        lblTargetScore: document.getElementById('lbl-target-score'),
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
        lblPartnerName: document.getElementById('lbl-partner-name'),
        lblRivalsNames: document.getElementById('lbl-rivals-names'),
        badgeUserName: document.getElementById('badge-user-name'),
        scoreUs: document.getElementById('score-us'),
        scoreThem: document.getElementById('score-them'),
        timerBox: document.getElementById('timer-box'),
        timerVal: document.getElementById('timer-val'),
        btnToggleSound: document.getElementById('btn-toggle-sound'),
        btnNewMatch: document.getElementById('btn-new-match'),

        gameLog: document.getElementById('game-log'),
        carroContainer: document.getElementById('carro-container'),
        sideSelector: document.getElementById('side-selector'),
        btnPlayLeft: document.getElementById('btn-play-left'),
        btnPlayRight: document.getElementById('btn-play-right'),
        valLeft: document.getElementById('val-left'),
        valRight: document.getElementById('val-right'),
        btnPass: document.getElementById('btn-pass'),

        nameLabels: Array.of(
            null,
            document.getElementById('name-p1'),
            document.getElementById('name-p2'),
            document.getElementById('name-p3')
        ),
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

// === SISTEMA DE AUDIO Y VOZ EN ESPAÑOL ===

    let audioCtx = null;

    function getAudioCtx() {
        if (!audioCtx) {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
                audioCtx = new AudioContextClass();
            }
        }
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume().catch(() => {});
        }
        return audioCtx;
    }

    function speakSpanish(text) {
        if (state.isMuted || !('speechSynthesis' in window)) return;
        try {
            if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
                window.speechSynthesis.cancel();
            }
            const utter = new SpeechSynthesisUtterance(text);
            utter.lang = 'es-ES';
            utter.rate = 1.03;
            utter.pitch = 1.0;
            const voices = window.speechSynthesis.getVoices();
            const esVoice = voices.find(v => v.lang && v.lang.toLowerCase().startsWith('es'));
            if (esVoice) utter.voice = esVoice;
            window.speechSynthesis.speak(utter);
        } catch (e) {}
    }

    const sound = {
        announce(text, delayMs = 0) {
            if (state.isMuted || !text) return;
            if (delayMs > 0) {
                setTimeout(() => speakSpanish(text), delayMs);
            } else {
                speakSpanish(text);
            }
        },
        clack() {
            if (state.isMuted) return;
            const ctx = getAudioCtx();
            if (!ctx) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(520, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.055);
            gain.gain.setValueAtTime(0.45, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.065);
        },
        pass() {
            if (state.isMuted) return;
            const ctx = getAudioCtx();
            if (ctx) {
                const now = ctx.currentTime;
                Array.of(0, 0.14).forEach((offset, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(idx === 0 ? 260 : 210, now + offset);
                    gain.gain.setValueAtTime(0.28, now + offset);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.11);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + offset);
                    osc.stop(now + offset + 0.12);
                });
            }
            setTimeout(() => speakSpanish('Paso'), 180);
        },
        yourTurn() {
            if (state.isMuted) return;
            const ctx = getAudioCtx();
            if (ctx) {
                const now = ctx.currentTime;
                Array.of(0, 0.11).forEach((offset, idx) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    osc.frequency.setValueAtTime(idx === 0 ? 587.33 : 880, now + offset);
                    gain.gain.setValueAtTime(0.18, now + offset);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.14);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(now + offset);
                    osc.stop(now + offset + 0.16);
                });
            }
            setTimeout(() => speakSpanish('Tu turno'), 160);
        },
        tick() {
            if (state.isMuted) return;
            const ctx = getAudioCtx();
            if (!ctx) return;
            const now = ctx.currentTime;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(880, now);
            gain.gain.setValueAtTime(0.16, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now);
            osc.stop(now + 0.04);
        },
        handEnd() {
            if (state.isMuted) return;
            const ctx = getAudioCtx();
            if (!ctx) return;
            const now = ctx.currentTime;
            const notes = Array.of(523.25, 659.25);
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.12);
                gain.gain.setValueAtTime(0.22, now + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.32);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + i * 0.12);
                osc.stop(now + i * 0.12 + 0.35);
            });
        },
        win() {
            if (state.isMuted) return;
            const ctx = getAudioCtx();
            if (ctx) {
                const now = ctx.currentTime;
                const notes = Array.of(523.25, 659.25, 783.99, 1046.5, 1318.5);
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'triangle';
                    const start = now + i * 0.12;
                    const dur = i === notes.length - 1 ? 0.65 : 0.28;
                    osc.frequency.setValueAtTime(freq, start);
                    gain.gain.setValueAtTime(0.28, start);
                    gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(start);
                    osc.stop(start + dur + 0.04);
                });
            }
            setTimeout(() => speakSpanish('¡Enhorabuena! Fin de la partida, victoria de nuestra pareja'), 720);
        },
        lose() {
            if (state.isMuted) return;
            const ctx = getAudioCtx();
            if (ctx) {
                const now = ctx.currentTime;
                const notes = Array.of(440, 392, 349.23, 293.66);
                notes.forEach((freq, i) => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.type = 'sine';
                    const start = now + i * 0.15;
                    osc.frequency.setValueAtTime(freq, start);
                    gain.gain.setValueAtTime(0.22, start);
                    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.start(start);
                    osc.stop(start + 0.38);
                });
            }
            setTimeout(() => speakSpanish('Fin de la partida, ganan los rivales'), 680);
        }
    };

    function updateSoundButtonUI() {
        if (!dom.btnToggleSound) return;
        dom.btnToggleSound.textContent = state.isMuted ? '🔇' : '🔊';
        dom.btnToggleSound.title = state.isMuted ? 'Sonido silenciado (clic para activar)' : 'Sonido activado (clic para silenciar)';
    }

    if (dom.btnToggleSound) {
        updateSoundButtonUI();
        dom.btnToggleSound.addEventListener('click', () => {
            state.isMuted = !state.isMuted;
            localStorage.setItem(STORAGE_MUTE_KEY, String(state.isMuted));
            updateSoundButtonUI();
            if (!state.isMuted) {
                getAudioCtx();
                sound.clack();
            } else if ('speechSynthesis' in window) {
                window.speechSynthesis.cancel();
            }
        });
    }
 
    // === ROTACIÓN ALEATORIA DE ASIENTOS DE BOTS ===
    function assignRandomBots() {
        const shuffled = shuffleDeck(BOT_POOL);
        const p1 = shuffled.at(0);
        const p2 = shuffled.at(1);
        const p3 = shuffled.at(2);

        state.botSeats = Array.of(null, p1, p2, p3);
        PLAYER_NAMES = Array.of(
            state.userName || 'Tú',
            `${p1} (Der)`,
            `${p2} (Compañero)`,
            `${p3} (Izq)`
        );

        if (dom.lblPartnerName) dom.lblPartnerName.textContent = p2;
        if (dom.lblRivalsNames) dom.lblRivalsNames.textContent = `${p1} & ${p3}`;
        if (dom.nameLabels.at(1)) dom.nameLabels.at(1).textContent = `${p1} (Der)`;
        if (dom.nameLabels.at(2)) dom.nameLabels.at(2).textContent = `${p2} (Compañero)`;
        if (dom.nameLabels.at(3)) dom.nameLabels.at(3).textContent = `${p3} (Izq)`;
    }

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
            return true;
        }
        return (
            tile.a === state.leftEnd ||
            tile.b === state.leftEnd ||
            tile.a === state.rightEnd ||
            tile.b === state.rightEnd
        );
    }

        function getValidSides(tile, playerIdx = state.currentTurn) {
        if (state.board.length === 0) return Array.of('center');

               // Regla FED: Solo cuando ambos extremos del carro son del mismo palo (a la derecha del jugador)
        if (state.leftEnd === state.rightEnd) {
            if (tile.a === state.rightEnd || tile.b === state.rightEnd) {
                // Jugadores 0 (Abajo) y 3 (Izquierda) -> su derecha es 'right' (Abajo/Derecha)
                // Jugadores 1 (Derecha) y 2 (Arriba) -> su derecha es 'left' (Arriba/Izquierda)
                const forcedSide = (playerIdx === 0 || playerIdx === 3) ? 'right' : 'left';
                return Array.of(forcedSide);
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

    function createHalfElement(value, isHorizontal = false) {
        const half = document.createElement('div');
        half.className = 'half';
        let activeIndices = PIP_MAP[value] || new Array();
        // En horizontal, el 6 tiene 2 filas de 3 puntos (índices 0,1,2 y 6,7,8)
        if (value === 6 && isHorizontal) {
            activeIndices = Array.of(0, 1, 2, 6, 7, 8);
        }
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

        const half1 = createHalfElement(val1, isHorizontal);
        const divider = document.createElement('div');
        divider.className = 'divider';
        const half2 = createHalfElement(val2, isHorizontal);

        tileEl.appendChild(half1);
        tileEl.appendChild(divider);
        tileEl.appendChild(half2);

        return tileEl;
    }
      // === INICIO RENDERBOARD - PARTE A (CONFIGURACIÓN Y BRAZO DERECHO) ===
    function renderBoard() {
        dom.carroContainer.innerHTML = '';
        if (state.board.length === 0) return;

        let centerIdx = state.board.findIndex(t => t.isCenter);
        if (centerIdx === -1) centerIdx = 0;

        const isMobile = window.innerWidth <= 900;
        // Solo en móvil: vertical cuando sale el Jugador (0) o su compañero (2); en Laptop siempre horizontal
        const isVerticalStart = isMobile && (state.startingPlayer === 0 || state.startingPlayer === 2);

        const S = isMobile ? 24 : 42;
        const L = S * 2;
        const GAP = 2;

        // Límites reales disponibles desde el centro (0,0) del tablero
        const halfW = Math.max(100, (dom.carroContainer.clientWidth - 20) / 2);
        const halfH = Math.max(100, (dom.carroContainer.clientHeight - 20) / 2);

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
            const box = { cx, cy, w, h };
            placed.push(box);
            return box;
        }

        function computeTurnedCoords(last, nextDir, w, h, prevDir = null) {
            if (nextDir === 'U') {
                return {
                    cx: last.cx + last.w / 2 - w / 2,
                    cy: last.cy - last.h / 2 - GAP - h / 2
                };
            }
            if (nextDir === 'L') {
                const alignBottom = (prevDir === 'D');
                return {
                    cx: last.cx - last.w / 2 - GAP - w / 2,
                    cy: alignBottom ? (last.cy + last.h / 2 - h / 2) : (last.cy - last.h / 2 + h / 2)
                };
            }
            if (nextDir === 'D') {
                return {
                    cx: last.cx - last.w / 2 + w / 2,
                    cy: last.cy + last.h / 2 + GAP + h / 2
                };
            }
            const alignTop = (prevDir === 'U');
            return {
                cx: last.cx + last.w / 2 + GAP + w / 2,
                cy: alignTop ? (last.cy - last.h / 2 + h / 2) : (last.cy + last.h / 2 - h / 2)
            };
        }

        function computeStraightCoords(last, dir, w, h) {
            if (dir === 'R') {
                return { cx: last.cx + last.w / 2 + GAP + w / 2, cy: last.cy };
            }
            if (dir === 'U') {
                return { cx: last.cx, cy: last.cy - last.h / 2 - GAP - h / 2 };
            }
            if (dir === 'L') {
                return { cx: last.cx - last.w / 2 - GAP - w / 2, cy: last.cy };
            }
            return { cx: last.cx, cy: last.cy + last.h / 2 + GAP + h / 2 };
        }

        // Ficha de salida clavada en el centro exacto (0,0)
        // En vertical: 'left' sube ('U') y dobla a Izquierda ('L'); 'right' baja ('D') y dobla a Derecha ('R')
        const centerItem = state.board.at(centerIdx);
        const initialLeftDir = isVerticalStart ? 'U' : 'L';
        const initialRightDir = isVerticalStart ? 'D' : 'R';

        // En vertical: centerItem.left queda arriba (hacia 'U') y centerItem.right queda abajo (hacia 'D')
        const cBox = addPlacedTile(centerItem.left, centerItem.right, centerItem.isDouble, 0, 0, initialRightDir);

        // BRAZO DERECHO LÓGICO (rightEnd -> Derecha en horizontal / Abajo-Derecha en vertical)
        let rLast = cBox;
        let rDir = initialRightDir;
        let rLegTiles = 0;
        let rNormalSinceDouble = centerItem.isDouble ? 0 : 2;

        for (let i = centerIdx + 1; i < state.board.length; i++) {
            const item = state.board.at(i);
            if (item.isDouble) {
                rNormalSinceDouble = 0;
            } else {
                rNormalSinceDouble++;
            }

            const nextIsHoriz = item.isDouble ? (rDir === 'U' || rDir === 'D') : (rDir === 'R' || rDir === 'L');
            const nextW = nextIsHoriz ? L : S;
            const nextH = nextIsHoriz ? S : L;
            const straightPos = computeStraightCoords(rLast, rDir, nextW, nextH);

            let justTurned = false;
            const prevrDir = rDir;
            if (!item.isDouble) {
                if (isMobile && isVerticalStart) {
                    if (rDir === 'D' && rNormalSinceDouble >= 2 && (straightPos.cy + nextH / 2 > halfH - 6)) {
                        rDir = 'R'; justTurned = true; rLegTiles = 0;
                    } else if (rDir === 'R' && rLegTiles >= 2) {
                        rDir = 'U'; justTurned = true; rLegTiles = 0;
                    } else if (rDir === 'U' && rNormalSinceDouble >= 2 && (straightPos.cy - nextH / 2 < -halfH - 28)) {
                        rDir = 'R'; justTurned = true; rLegTiles = 0;
                    }
                } else if (isMobile && !isVerticalStart) {
                    if (rDir === 'R' && rLegTiles >= 2) {
                        rDir = 'U'; justTurned = true; rLegTiles = 0;
                    } else if (rDir === 'U' && rNormalSinceDouble >= 2 && (straightPos.cy - nextH / 2 < -halfH + 6)) {
                        rDir = 'L'; justTurned = true; rLegTiles = 0;
                    } else if (rDir === 'L' && rNormalSinceDouble >= 2 && (straightPos.cx - nextW / 2 < -halfW + 6)) {
                        rDir = 'D'; justTurned = true; rLegTiles = 0;
                    }
                } else {
                    if (rDir === 'R' && rNormalSinceDouble >= 2 && (straightPos.cx + nextW / 2 > halfW - 6)) {
                        rDir = 'U'; justTurned = true; rLegTiles = 0;
                    } else if (rDir === 'U' && rLegTiles >= 2) {
                        rDir = 'L'; justTurned = true; rLegTiles = 0;
                    } else if (rDir === 'L' && rNormalSinceDouble >= 2 && (straightPos.cx - nextW / 2 < -halfW + 6)) {
                        rDir = 'D'; justTurned = true; rLegTiles = 0;
                    }
                }
            }

            const isHoriz = item.isDouble ? (rDir === 'U' || rDir === 'D') : (rDir === 'R' || rDir === 'L');
            const w = isHoriz ? L : S;
            const h = isHoriz ? S : L;

            const pos = justTurned
                ? computeTurnedCoords(rLast, rDir, w, h, prevrDir)
                : computeStraightCoords(rLast, rDir, w, h);

            rLast = addPlacedTile(item.left, item.right, item.isDouble, pos.cx, pos.cy, rDir);
            rLegTiles++;
        }
    // === FIN RENDERBOARD - PARTE A ===

    // === INICIO RENDERBOARD - PARTE B (BRAZO IZQUIERDO Y ESCALADO) ===
        // BRAZO IZQUIERDO LÓGICO (leftEnd -> Izquierda en horizontal / Arriba-Izquierda en vertical)
        let lLast = cBox;
        let lDir = initialLeftDir;
        let lLegTiles = 0;
        let lNormalSinceDouble = centerItem.isDouble ? 0 : 2;

        for (let i = centerIdx - 1; i >= 0; i--) {
            const item = state.board.at(i);
            if (item.isDouble) {
                lNormalSinceDouble = 0;
            } else {
                lNormalSinceDouble++;
            }

            const nextIsHoriz = item.isDouble ? (lDir === 'U' || lDir === 'D') : (lDir === 'R' || lDir === 'L');
            const nextW = nextIsHoriz ? L : S;
            const nextH = nextIsHoriz ? S : L;
            const straightPos = computeStraightCoords(lLast, lDir, nextW, nextH);

                                 let justTurned = false;
            const prevlDir = lDir;
            if (!item.isDouble) {

                              if (isMobile && isVerticalStart) {
                    if (lDir === 'U' && lNormalSinceDouble >= 2 && (straightPos.cy - nextH / 2 < -halfH + 6)) {
                        lDir = 'L'; justTurned = true; lLegTiles = 0;
                    } else if (lDir === 'L' && lLegTiles >= 2) {
                        lDir = 'D'; justTurned = true; lLegTiles = 0;
                    } else if (lDir === 'D' && lNormalSinceDouble >= 2 && (straightPos.cy + nextH / 2 > halfH + 28)) {
                        lDir = 'L'; justTurned = true; lLegTiles = 0;
                    }
 
                } else if (isMobile && !isVerticalStart) {
                    if (lDir === 'L' && lLegTiles >= 2) {
                        lDir = 'D'; justTurned = true; lLegTiles = 0;
                    } else if (lDir === 'D' && lNormalSinceDouble >= 2 && (straightPos.cy + nextH / 2 > halfH - 6)) {
                        lDir = 'R'; justTurned = true; lLegTiles = 0;
                    } else if (lDir === 'R' && lNormalSinceDouble >= 2 && (straightPos.cx + nextW / 2 > halfW - 6)) {
                        lDir = 'U'; justTurned = true; lLegTiles = 0;
                    }
                } else {
                    if (lDir === 'L' && lNormalSinceDouble >= 2 && (straightPos.cx - nextW / 2 < -halfW + 6)) {
                        lDir = 'D'; justTurned = true; lLegTiles = 0;
                    } else if (lDir === 'D' && lLegTiles >= 2) {
                        lDir = 'R'; justTurned = true; lLegTiles = 0;
                    } else if (lDir === 'R' && lNormalSinceDouble >= 2 && (straightPos.cx + nextW / 2 > halfW - 6)) {
                        lDir = 'U'; justTurned = true; lLegTiles = 0;
                    }
                }
            }
 
            const isHoriz = item.isDouble ? (lDir === 'U' || lDir === 'D') : (lDir === 'R' || lDir === 'L');
            const w = isHoriz ? L : S;
            const h = isHoriz ? S : L;

                       const pos = justTurned
                ? computeTurnedCoords(lLast, lDir, w, h, prevlDir)
                : computeStraightCoords(lLast, lDir, w, h);

            lLast = addPlacedTile(item.right, item.left, item.isDouble, pos.cx, pos.cy, lDir);
            lLegTiles++;
        }

        // Escalado centrado en (0,0) sin mover nunca la ficha de salida
        let maxAbsX = 0, maxAbsY = 0;
        placed.forEach(p => {
            maxAbsX = Math.max(maxAbsX, Math.abs(p.cx) + p.w / 2);
            maxAbsY = Math.max(maxAbsY, Math.abs(p.cy) + p.h / 2);
        });

        const reqW = maxAbsX * 2;
        const reqH = maxAbsY * 2;

        dom.carroContainer.appendChild(stage);

        const availW = dom.carroContainer.clientWidth - 16;
        const availH = dom.carroContainer.clientHeight - 16;
        if (availW > 0 && availH > 0 && (reqW > availW || reqH > availH)) {
            const scale = Math.min(availW / reqW, availH / reqH, 1);
            stage.style.transform = `scale(${scale.toFixed(3)})`;
        }
    }
    // === FIN RENDERBOARD - PARTE B ===

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
            const botHand = state.hands.at(p);
            const count = botHand.length;
            dom.countLabels.at(p).textContent = count;

            if (state.revealHands) {
                const isSideBot = (p === 1 || p === 3);
                botHand.forEach(tile => {
                    const revealedTile = createTileElement(tile.a, tile.b, isSideBot);
                    revealedTile.classList.add('revealed-tile');
                    botContainer.appendChild(revealedTile);
                });
            } else {
                for (let i = 0; i < count; i++) {
                    const back = document.createElement('div');
                    back.className = 'tile-back';
                    botContainer.appendChild(back);
                }
            }
        }
    }
// === FIN BLOQUE 2 DE 4 ===

    function updateScoreboard() {
        dom.scoreUs.textContent = state.scores.us;
        dom.scoreThem.textContent = state.scores.them;
    }

    function setLog(msg, reset = false) {
        if (!dom.gameLog) return;
        if (reset) dom.gameLog.innerHTML = '';
        const line = document.createElement('div');
        line.textContent = msg;
        dom.gameLog.appendChild(line);
        dom.gameLog.scrollTop = dom.gameLog.scrollHeight;
    }

    function showThought(playerIdx, text, durationMs = 0) {
        const bubble = dom.thoughtBubbles.at(playerIdx);
        if (!bubble) return;
        bubble.textContent = text;
        if (durationMs > 0) {
            setTimeout(() => {
                if (bubble.textContent === text) bubble.textContent = '';
            }, durationMs);
        }
    }

    function clearAllThoughts() {
        dom.thoughtBubbles.forEach(b => {
            if (b) b.textContent = '';
        });
    }

    function highlightActivePlayer(playerIdx) {
        for (let i = 0; i < 4; i++) {
            const badge = document.getElementById(`badge-p${i}`);
            if (badge) {
                if (i === playerIdx) {
                    badge.classList.add('active-turn');
                } else {
                    badge.classList.remove('active-turn');
                }
            }
        }
    }
// === INICIO BLOQUE 3A ===
    function drawStartingPlayerFED() {
        const drawDeck = shuffleDeck(createDeck());
        const drawn = Array.of(
            drawDeck.at(0),
            drawDeck.at(1),
            drawDeck.at(2),
            drawDeck.at(3)
        );

        let winner = 0;
        for (let p = 1; p < 4; p++) {
            const best = drawn.at(winner);
            const curr = drawn.at(p);
            const bestSum = best.a + best.b;
            const currSum = curr.a + curr.b;
            const bestMax = Math.max(best.a, best.b);
            const currMax = Math.max(curr.a, curr.b);

            if (currSum > bestSum || (currSum === bestSum && currMax > bestMax)) {
                winner = p;
            }
        }
        return {
            winner,
            logMsg: `Sorteo FED, sale ${getPlayerLabel(winner)} y tiene salida libre.`
        };

     }

    function startNewMatch() {
        clearTimers();
        assignRandomBots();
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
        state.revealHands = false;

        let startDelayMs = 0;
        if (state.isFirstHand) {
            const drawResult = drawStartingPlayerFED();
            state.startingPlayer = drawResult.winner;
            state.currentTurn = drawResult.winner;
            setLog(drawResult.logMsg, true);
            const starterLabel = state.currentTurn === 0 ? `sales tú, ${state.userName}` : `sale ${getPlayerLabel(state.currentTurn)}`;
            sound.announce(`Bienvenido a la mesa de Juguemos Dominó, ${state.userName}. Tras el sorteo, ${starterLabel}.`, 150);
            startDelayMs = 2900;
        } else {
            state.startingPlayer = (state.startingPlayer + 1) % 4;
            state.currentTurn = state.startingPlayer;
            setLog(`Nueva mano: sale ${getPlayerLabel(state.currentTurn)}.`, true);
            const starterLabel = state.currentTurn === 0 ? `sales tú, ${state.userName}` : `sale ${getPlayerLabel(state.currentTurn)}`;
            sound.announce(`Nueva mano, ${starterLabel}.`, 150);
            startDelayMs = 1700;
        }

        renderBoard();
        renderHands();
        highlightActivePlayer(state.currentTurn);

        state.botTimeout = setTimeout(() => {
            if (state.gameActive) {
                beginTurn();
            }
        }, startDelayMs);
    }

    function getPlayerLabel(idx) {
        return idx === 0 ? state.userName : PLAYER_NAMES.at(idx);
    }

    function isClosingPlay(tile, side) {
        if (state.board.length === 0 || side === 'center') return false;

        let newLeft = state.leftEnd;
        let newRight = state.rightEnd;

        if (side === 'left') {
            newLeft = (tile.b === state.leftEnd) ? tile.a : tile.b;
        } else if (side === 'right') {
            newRight = (tile.a === state.rightEnd) ? tile.b : tile.a;
        }

        if (newLeft !== newRight) return false;

        const targetSuit = newLeft;
        let playedOfSuit = 0;
        state.board.forEach(b => {
            if (b.left === targetSuit || b.right === targetSuit) {
                playedOfSuit++;
            }
        });
        if (tile.a === targetSuit || tile.b === targetSuit) {
            playedOfSuit++;
        }

        return playedOfSuit >= 7;
    }

    function hasClosingMove(playerIdx) {
        if (state.board.length < 6) return false;
        const hand = state.hands.at(playerIdx);
        // Si solo queda 1 ficha en la mano, jugarla es DOMINÓ, nunca cierre
        if (hand.length <= 1) return false;
        for (let i = 0; i < hand.length; i++) {
            const tile = hand.at(i);
            if (!canPlayTile(tile)) continue;
            const sides = getValidSides(tile);
            for (let s = 0; s < sides.length; s++) {
                if (isClosingPlay(tile, sides.at(s))) {
                    return true;
                }
            }
        }
        return false;
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

        const possibleClose = hasClosingMove(p);
        startTurnTimer(possibleClose ? 60 : TURN_TIME_LIMIT);

        if (p === 0) {
            if (playableIndices.length === 0) {
                dom.btnPass.classList.remove('hidden');
                showThought(0, 'Pasando...', 0);
                setLog('No llevas fichas que casen...');
                state.botTimeout = setTimeout(() => {
                    if (state.gameActive && state.currentTurn === 0) {
                        passTurn(0, false);
                    }
                }, 2800);
            } else if (playableIndices.length === 1 && !possibleClose) {
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
                    }, 2900);
                } else {
                    dom.btnPass.classList.add('hidden');
                    showThought(0, 'Elige extremo', 0);
                    setLog('Tu ficha entra por ambos lados: elige extremo.');
                    sound.yourTurn();
                }
            } else {
                dom.btnPass.classList.add('hidden');
                if (possibleClose) {
                    showThought(0, '⚠️ Posible cierre (60s)', 0);
                    setLog('⚠️ Jugada de posible cierre: dispones de 60s para contar tantos.');
                } else {
                    showThought(0, 'Tu turno', 0);
                    setLog('Tu turno: selecciona una ficha iluminada.');
                }
                sound.yourTurn();
            }
        } else {
            dom.btnPass.classList.add('hidden');
            planAndExecuteBotTurn(p, possibleClose);
        }
    }
    
    function startTurnTimer(customLimit) {
        clearInterval(state.timerInterval);
        state.timeLeft = (typeof customLimit === 'number') ? customLimit : TURN_TIME_LIMIT;
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
                sound.tick();
                return;
            }

            if (inExtraTime) {
                dom.timerVal.textContent = '+' + Math.max(0, state.timeLeft);
                if (state.timeLeft > 0) {
                    sound.tick();
                } else {
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

          // === INICIO SELECTOR DE EXTREMO (IZQ / DER EN VERTICAL Y HORIZONTAL) ===
    function handleUserTileClick(tileIndex) {
        if (!state.gameActive || state.currentTurn !== 0) return;
        const tile = state.hands.at(0).at(tileIndex);
        if (!canPlayTile(tile)) return;

        const sides = getValidSides(tile);
        if (sides.length > 1) {
            state.pendingTileIndex = tileIndex;
            const isMobile = window.innerWidth <= 900;
            const isVerticalStart = isMobile && (state.startingPlayer === 0 || state.startingPlayer === 2);
            dom.btnPlayLeft.innerHTML = isVerticalStart
                ? `⬆ Izq (<span id="val-left">${state.leftEnd}</span>)`
                : `⬅ Izq (<span id="val-left">${state.leftEnd}</span>)`;
            dom.btnPlayRight.innerHTML = isVerticalStart
                ? `⬇ Der (<span id="val-right">${state.rightEnd}</span>)`
                : `Der (<span id="val-right">${state.rightEnd}</span>) ➡`;
            dom.sideSelector.classList.remove('hidden');
        } else {
            playTile(0, tileIndex, sides.at(0));
        }
    }
    // === FIN SELECTOR DE EXTREMO ===
 
    function hideSideSelector() {
        dom.sideSelector.classList.add('hidden');
        state.pendingTileIndex = null;
    }

    function planAndExecuteBotTurn(botIdx, possibleClose = false) {
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

        // 1. Sin fichas que casen: pasa a 2,6s (2600 ms) para que se perciba con calma
        if (validMoves.length === 0) {
            showThought(botIdx, '', 0);
            state.botTimeout = setTimeout(() => {
                passTurn(botIdx, false);
            }, 2600);
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

        // Estimación de puntos restantes en la mesa si hay posible cierre
        let boardPoints = 0;
        state.board.forEach(b => {
            boardPoints += (b.left + b.right);
        });
        const myPoints = handPoints(hand);

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

                       // Valoración táctica si la jugada cierra la mano (solo si no es su última ficha, pues sería dominó)
            if (hand.length > 1 && typeof isClosingPlay === 'function' && isClosingPlay(tile, side)) {

                const myRemainingAfter = myPoints - tileWeight(tile);
                const unplayedOthers = Math.max(0, 168 - boardPoints - myPoints);
                const avgOtherHand = unplayedOthers / 3;
                if (myRemainingAfter <= avgOtherHand * 0.85) {
                    score += 45;
                } else {
                    score -= 40;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestMove = move;
            }
        });

        // 2. Última ficha (dominó) a 1,9s; única jugada posible intermedia sin cierre a 2,9s (2900 ms)
        if ((validMoves.length === 1 || hand.length === 1) && !possibleClose) {
            const forcedDelay = (hand.length === 1) ? 1900 : 2900;
            showThought(botIdx, '', 0);
            state.botTimeout = setTimeout(() => {
                playTile(botIdx, bestMove.idx, bestMove.side);
            }, forcedDelay);
            return;
        }

        // 3. Sistema Combinado de la Pensada (con tiempo extendido si hay posible cierre)
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

        const thinkDelay = possibleClose ? 12000 : (isStrongSuit ? 5500 : 9500);
        const thinkLabel = possibleClose ? 'Contando cierre...' : 'Pensando...';

        showThought(botIdx, thinkLabel, 0);
        state.botTimeout = setTimeout(() => {
            playTile(botIdx, bestMove.idx, bestMove.side);
        }, thinkDelay);
    }
// === FIN BLOQUE 3B ===
// === INICIO BLOQUE 4A ===
        // === INICIO PLAYTILE (CON CIERRE INMEDIATO) ===
    function playTile(playerIdx, tileIndex, side) {
        clearTimers();
        hideSideSelector();
        dom.btnPass.classList.add('hidden');

        const removed = state.hands.at(playerIdx).splice(tileIndex, 1);
        const tile = removed.at(0);
        const dbl = isDouble(tile);

        if (state.board.length === 0 || side === 'center') {
            const minV = Math.min(tile.a, tile.b);
            const maxV = Math.max(tile.a, tile.b);
            // Jugador 0 (Abajo) y Rival 3 (Izquierda) -> punta menor en left (Abajo/Izquierda)
            // Rival 1 (Derecha) y Compañero 2 (Arriba) -> punta menor en right (Derecha/Arriba)
            const minorOnLeft = (playerIdx === 2 || playerIdx === 3);
            const cLeft = minorOnLeft ? minV : maxV;
            const cRight = minorOnLeft ? maxV : minV;
            state.board.push({ left: cLeft, right: cRight, isDouble: dbl, isCenter: true });
            state.leftEnd = cLeft;
            state.rightEnd = cRight;
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

        sound.clack();
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

        // Cierre inmediato: si ambos extremos tienen el mismo palo y ya están las 7 fichas en la mesa
        if (state.leftEnd === state.rightEnd) {
            const targetSuit = state.leftEnd;
            let playedOfSuit = 0;
            state.board.forEach(b => {
                if (b.left === targetSuit || b.right === targetSuit) {
                    playedOfSuit++;
                }
            });
            if (playedOfSuit >= 7) {
                handleHandClosed();
                return;
            }
        }

        state.currentTurn = (state.currentTurn + 1) % 4;
        beginTurn();
    }
    // === FIN PLAYTILE (CON CIERRE INMEDIATO) ===

    function passTurn(playerIdx, byTimeout) {
        clearTimers();
        hideSideSelector();
        dom.btnPass.classList.add('hidden');

        sound.pass();
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

       function formatHandRowHtml(label, hand) {
        const tilesStr = hand.length === 0
            ? 'Dominó (sin fichas)'
            : hand.map(t => `${t.a}|${t.b}`).join(' · ');
        const pts = handPoints(hand);
        return `
            <div class="summary-player-row">
                <div>
                    <strong>${escapeHtml(label)}</strong>
                    <div class="summary-tiles-list">${tilesStr}</div>
                </div>
                <span class="summary-pts-pill">${pts} pts</span>
            </div>`;
    }

    function buildSummaryHtml(headline) {
        const ptsUs = handPoints(state.hands.at(0)) + handPoints(state.hands.at(2));
        const ptsThem = handPoints(state.hands.at(1)) + handPoints(state.hands.at(3));
        return `
            <div class="summary-headline">${headline}</div>
            <div class="summary-pair-card us-card">
                <div class="summary-pair-title">Nosotros · ${ptsUs} pts en mano</div>
                ${formatHandRowHtml(state.userName, state.hands.at(0))}
                ${formatHandRowHtml(PLAYER_NAMES.at(2), state.hands.at(2))}
            </div>
            <div class="summary-pair-card them-card">
                <div class="summary-pair-title">Rivales · ${ptsThem} pts en mano</div>
                ${formatHandRowHtml(PLAYER_NAMES.at(1), state.hands.at(1))}
                ${formatHandRowHtml(PLAYER_NAMES.at(3), state.hands.at(3))}
            </div>`;
    }

    function handleHandWinByDomino(winnerIdx) {
        state.gameActive = false;
        highlightActivePlayer(-1);
        const usWon = winnerIdx === 0 || winnerIdx === 2;

        const pointsUsRemaining = handPoints(state.hands.at(0)) + handPoints(state.hands.at(2));
        const pointsThemRemaining = handPoints(state.hands.at(1)) + handPoints(state.hands.at(3));
        const totalGained = pointsUsRemaining + pointsThemRemaining;

        let title = '';
        let summaryHtml = '';

        if (usWon) {
            state.scores.us += totalGained;
            if (state.scores.us < TARGET_SCORE) sound.handEnd();
            title = `🎉 ¡DOMINÓ de ${getPlayerLabel(winnerIdx)}!`;
            summaryHtml = buildSummaryHtml(`Nosotros ganamos la mano y sumamos <strong>+${totalGained} tantos</strong>.`);
            setLog(`¡DOMINÓ de ${getPlayerLabel(winnerIdx)}! Nosotros sumamos +${totalGained} puntos.`);
        } else {
            state.scores.them += totalGained;
            if (state.scores.them < TARGET_SCORE) sound.handEnd();
            title = `😔 ¡DOMINÓ de ${getPlayerLabel(winnerIdx)}!`;
            summaryHtml = buildSummaryHtml(`Los rivales ganan la mano y suman <strong>+${totalGained} tantos</strong>.`);
            setLog(`¡DOMINÓ de ${getPlayerLabel(winnerIdx)}! Rivales suman +${totalGained} puntos.`);
        }

        updateScoreboard();
        showHandSummaryModal(title, summaryHtml);
    }

    function handleHandClosed() {
        state.gameActive = false;
        highlightActivePlayer(-1);
        const ptsUs = handPoints(state.hands.at(0)) + handPoints(state.hands.at(2));
        const ptsThem = handPoints(state.hands.at(1)) + handPoints(state.hands.at(3));
        const totalPoints = ptsUs + ptsThem;

        let title = '🔒 ¡MANO CERRADA (TRANCA)!';
        let summaryHtml = '';

        if (ptsUs < ptsThem) {
            state.scores.us += totalPoints;
            if (state.scores.us < TARGET_SCORE) sound.handEnd();
            summaryHtml = buildSummaryHtml(`¡Ganamos el cierre! Nosotros (<strong>${ptsUs} pts</strong>) tenemos menos puntos que Rivales (${ptsThem} pts) y sumamos <strong>+${totalPoints} tantos</strong>.`);
            setLog(`¡CIERRE! Nosotros (${ptsUs} pts) ganamos a Rivales (${ptsThem} pts). +${totalPoints} puntos.`);
        } else if (ptsThem < ptsUs) {
            state.scores.them += totalPoints;
            if (state.scores.them < TARGET_SCORE) sound.handEnd();
            summaryHtml = buildSummaryHtml(`Rivales ganan el cierre (<strong>${ptsThem} pts</strong> frente a ${ptsUs} pts nuestros) y suman <strong>+${totalPoints} tantos</strong>.`);
            setLog(`¡CIERRE! Rivales (${ptsThem} pts) ganan a Nosotros (${ptsUs} pts). +${totalPoints} puntos.`);
        } else {
            sound.handEnd();
            summaryHtml = buildSummaryHtml(`¡Cierre empatado a <strong>${ptsUs} puntos</strong>! Nadie suma tantos y corre el turno de salida.`);
            setLog(`¡CIERRE EMPATADO a ${ptsUs} puntos! Nadie suma y corre mano.`);
        }

        updateScoreboard();
        showHandSummaryModal(title, summaryHtml);
    }

    function showHandSummaryModal(title, summaryHtml) {
        const matchFinished = state.scores.us >= TARGET_SCORE || state.scores.them >= TARGET_SCORE;

        if (matchFinished) {
            const weWonMatch = state.scores.us >= TARGET_SCORE && state.scores.us > state.scores.them;
            if (weWonMatch) {
                sound.win();
            } else {
                sound.lose();
            }
            saveMatchResultToRanking(weWonMatch, state.scores.us, state.scores.them);
            dom.summaryTitle.textContent = weWonMatch
                ? '🏆 ¡VICTORIA EN LA PARTIDA!'
                : 'Fin de la Partida';
            dom.btnNextHand.textContent = '🔄 Jugar Nueva Partida';
        } else {
            dom.summaryTitle.textContent = title;
            dom.btnNextHand.textContent = '▶ Jugar Siguiente Mano';
        }

        dom.summaryDetail.innerHTML = summaryHtml;
        dom.summaryScores.textContent = `Marcador: Nosotros ${state.scores.us} — Rivales ${state.scores.them} (Meta: ${TARGET_SCORE})`;

        clearAllThoughts();
        state.revealHands = true;
        renderHands();

        setTimeout(() => {
            dom.handSummaryModal.classList.remove('hidden');
        }, 9500);
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
        return new Array();
    }

    function upsertRankingPlayer(ranking, playerName, won, matchPoints) {
        if (!playerName) return;
        let entry = ranking.find(r => r.name.toLowerCase() === playerName.toLowerCase());
        if (!entry) {
            entry = { name: playerName, wins: 0, points: 0 };
            ranking.push(entry);
        }
        if (won) entry.wins += 1;
        entry.points += matchPoints;
    }

    function saveMatchResultToRanking(weWonMatch, pointsUs, pointsThem) {
        const ranking = getRanking();
        const userDisplayName = state.userClub
            ? `${state.userName} (${state.userClub})`
            : state.userName;

        const partnerBot = state.botSeats.at(2);
        const rivalRightBot = state.botSeats.at(1);
        const rivalLeftBot = state.botSeats.at(3);
        const rivalsWonMatch = !weWonMatch && pointsThem >= TARGET_SCORE;

        upsertRankingPlayer(ranking, userDisplayName, weWonMatch, pointsUs);
        upsertRankingPlayer(ranking, partnerBot, weWonMatch, pointsUs);
        upsertRankingPlayer(ranking, rivalRightBot, rivalsWonMatch, pointsThem);
        upsertRankingPlayer(ranking, rivalLeftBot, rivalsWonMatch, pointsThem);

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

        if (ranking.length === 0) {
            const tr = document.createElement('tr');
            tr.innerHTML = `<td colspan="4" style="text-align:center; opacity:0.8;">Aún no hay partidas terminadas. ¡Sé el primero en puntuar!</td>`;
            dom.rankingBody.appendChild(tr);
            return;
        }

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
      function setSelectedTargetScore(val) {
        const parsed = (Number(val) === 200) ? 200 : 300;
        TARGET_SCORE = parsed;
        if (dom.lblTargetScore) {
            dom.lblTargetScore.textContent = `Meta: ${TARGET_SCORE}`;
        }
        if (dom.targetSelector) {
            dom.targetSelector.querySelectorAll('.target-opt').forEach(btn => {
                btn.classList.toggle('active', Number(btn.dataset.target) === TARGET_SCORE);
            });
        }
    }

    try {
        const savedAlias = localStorage.getItem('domino_player_alias');
        const savedClub = localStorage.getItem('domino_player_club');
        const savedTarget = localStorage.getItem('domino_target_score');
        if (savedAlias) dom.playerAlias.value = savedAlias;
        if (savedClub) dom.playerClub.value = savedClub;
        if (savedTarget) setSelectedTargetScore(savedTarget);
    } catch (e) {}

    if (dom.targetSelector) {
        dom.targetSelector.querySelectorAll('.target-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                setSelectedTargetScore(btn.dataset.target);
            });
        });
    }

    dom.playerAlias.addEventListener('input', () => {
        dom.playerAlias.setCustomValidity('');
    });

    dom.btnStartGame.addEventListener('click', () => {
        const alias = dom.playerAlias.value.trim();
        const club = dom.playerClub.value.trim();

        if (alias.length < 2) {
            dom.playerAlias.focus();
            dom.playerAlias.setCustomValidity('Introduce un nombre o alias de al menos 2 caracteres.');
            dom.playerAlias.reportValidity();
            return;
        }
        dom.playerAlias.setCustomValidity('');

        try {
            localStorage.setItem('domino_player_alias', alias);
            localStorage.setItem('domino_player_club', club);
            localStorage.setItem('domino_target_score', String(TARGET_SCORE));
        } catch (e) {}

        state.userName = alias;
        state.userClub = club;

        dom.lblUserName.textContent = state.userName;
        dom.badgeUserName.textContent = state.userClub
            ? `${state.userName} · ${state.userClub}`
            : `${state.userName} (Tú)`;

        if (!state.isMuted) {
            getAudioCtx();
        }

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
        state.revealHands = false;
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
