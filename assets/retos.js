    var anexoActual = 0;
    var pasoActual = 0;
    var manosVisibles = true;

    var anexos = [
        {
            titulo: "Anexo I · Dominada capturando 129 tantos",
            manos: [
                { nombre: "J1 (Sale)", pareja: "Pareja 1-3", gana: true, fichas: ["0-0", "0-1", "0-2", "0-3", "0-4", "0-5", "0-6"] },
                { nombre: "J2", pareja: "Pareja 2-4", gana: false, fichas: ["1-1", "1-2", "1-3", "1-4", "1-6", "5-6", "6-6"] },
                { nombre: "J3", pareja: "Pareja 1-3", gana: true, fichas: ["2-3", "2-4", "2-5", "2-6", "3-5", "3-3", "4-3"] },
                { nombre: "J4", pareja: "Pareja 2-4", gana: false, fichas: ["1-5", "2-2", "3-6", "4-6", "4-4", "4-5", "5-5"] }
            ],
            vueltas: [
                "Inicio de la mano",
                "Vuelta 1",
                "Vuelta 2",
                "Vuelta 3",
                "Vuelta 4",
                "Vuelta 5",
                "Vuelta 6",
                "Vuelta 7 - ¡Dominada!"
            ],
            textos: [
                "El Jugador 1 tiene todas las blancas (7 fichas) y lleva la salida. Pulsa <strong>Siguiente</strong> para ver el desarrollo.",
                "<strong>Jugador 1:</strong> Sale con 0:0.<br><strong>Jugador 2:</strong> Pasa. <strong>Jugador 3:</strong> Pasa. <strong>Jugador 4:</strong> Pasa.",
                "<strong>Jugador 1:</strong> Juega 0:3.<br><strong>Jugador 2:</strong> Juega 3:1 obligado.<br><strong>Jugador 3:</strong> Pasa.<br><strong>Jugador 4:</strong> Juega 1:5 obligado.",
                "<strong>Jugador 1:</strong> Golpea a blancas con 5:0.<br><strong>Jugador 2:</strong> Pasa. <strong>Jugador 3:</strong> Pasa. <strong>Jugador 4:</strong> Pasa.",
                "<strong>Jugador 1:</strong> Juega 0:2.<br><strong>Jugador 2:</strong> Juega obligado 2:1.<br><strong>Jugador 3:</strong> Pasa. <strong>Jugador 4:</strong> Pasa.",
                "<strong>Jugador 1:</strong> Golpea a blancas con 1:0.<br><strong>Jugador 2:</strong> Pasa. <strong>Jugador 3:</strong> Pasa. <strong>Jugador 4:</strong> Pasa.",
                "<strong>Jugador 1:</strong> Juega 0:4.<br><strong>Jugador 2:</strong> Juega obligado 4:1.<br><strong>Jugador 3:</strong> Pasa. <strong>Jugador 4:</strong> Pasa.",
                "<strong>Jugador 1:</strong> Juega 6:0 por la punta blanca y domina la partida dejando a los rivales cargados."
            ],
            jugadasMesa: [
                [],
                ["0-0"],
                ["0-0", "0-3", "3-1", "1-5"],
                ["0-0", "0-3", "3-1", "1-5", "5-0"],
                ["0-0", "0-3", "3-1", "1-5", "5-0", "0-2", "2-1"],
                ["0-0", "0-3", "3-1", "1-5", "5-0", "0-2", "2-1", "1-0"],
                ["0-0", "0-3", "3-1", "1-5", "5-0", "0-2", "2-1", "1-0", "0-4", "4-1"],
                ["6-0", "0-0", "0-3", "3-1", "1-5", "5-0", "0-2", "2-1", "1-0", "0-4", "4-1"]
            ],
            resumen: "<strong>Resultado final:</strong> Se juegan en total 11 fichas. Han salido 39 tantos.<br>🏆 <strong>La pareja 1-3 captura 129 tantos.</strong>"
        },
        {
            titulo: "Anexo II · Cierre capturando 126 tantos",
            manos: [
                { nombre: "J1 (Sale)", pareja: "Pareja 1-3", gana: true, fichas: ["0-0", "0-2", "2-3", "2-4", "0-4", "0-6", "3-5"] },
                { nombre: "J2", pareja: "Pareja 2-4", gana: false, fichas: ["3-1", "1-4", "1-5", "1-6", "5-4", "5-5", "2-6"] },
                { nombre: "J3", pareja: "Pareja 1-3", gana: true, fichas: ["0-1", "1-1", "0-3", "3-6", "0-5", "2-5", "3-3"] },
                { nombre: "J4", pareja: "Pareja 2-4", gana: false, fichas: ["1-2", "3-4", "4-4", "2-2", "4-6", "6-5", "6-6"] }
            ],
            vueltas: [
                "Inicio de la mano",
                "Vuelta 1",
                "Vuelta 2",
                "Vuelta 3",
                "Vuelta 4 - ¡Cierre!"
            ],
            textos: [
                "El Jugador 1 tiene cuatro blancas (0:0, 0:2, 0:4, 0:6) y lleva la salida. Pulsa <strong>Siguiente</strong> para ver el cierre.",
                "<strong>Jugador 1:</strong> Sale con 0:0.<br><strong>Jugador 2:</strong> Pasa.<br><strong>Jugador 3:</strong> Juega 0:1.<br><strong>Jugador 4:</strong> Juega obligado 1:2.",
                "<strong>Jugador 1:</strong> Golpea a blancas con 2:0.<br><strong>Jugador 2:</strong> Pasa.<br><strong>Jugador 3:</strong> Juega 0:3.<br><strong>Jugador 4:</strong> Juega 3:4 obligado.",
                "<strong>Jugador 1:</strong> Golpea a blancas con 4:0.<br><strong>Jugador 2:</strong> Pasa.<br><strong>Jugador 3:</strong> Juega 0:5 obligado.<br><strong>Jugador 4:</strong> Juega 5:6 obligado.",
                "<strong>Jugador 1:</strong> Juega 6:0 y cierra la partida a blancas."
            ],
            jugadasMesa: [
                [],
                ["0-0", "0-1", "1-2"],
                ["0-0", "0-1", "1-2", "2-0", "0-3", "3-4"],
                ["0-0", "0-1", "1-2", "2-0", "0-3", "3-4", "4-0", "0-5", "5-6"],
                ["0-0", "0-1", "1-2", "2-0", "0-3", "3-4", "4-0", "0-5", "5-6", "6-0"]
            ],
            resumen: "<strong>Resultado final:</strong> Se juegan en total 10 fichas. Han salido 42 tantos.<br>🏆 <strong>La pareja 1-3 captura 126 tantos.</strong>"
        }
    ];
    function obtenerPatron(num, esHorizontal) {
        if (num === "1") return "000010000";
        if (num === "2") return esHorizontal ? "001000100" : "100000001";
        if (num === "3") return esHorizontal ? "001010100" : "100010001";
        if (num === "4") return "101000101";
        if (num === "5") return "101010101";
        if (num === "6") return esHorizontal ? "111000111" : "101101101";
        return "000000000";
    }

    function crearMitadHTML(num, esHorizontal) {
        var html = '<div class="mitad">';
        var dibujo = obtenerPatron(num, esHorizontal);
        for (var i = 0; i < 9; i++) {
            if (dibujo.charAt(i) === "1") {
                html += '<div class="punto"></div>';
            } else {
                html += '<div></div>';
            }
        }
        html += '</div>';
        return html;
    }

    function normalizarFicha(str) {
        var a = str.charAt(0);
        var b = str.charAt(2);
        return (a < b) ? (a + "-" + b) : (b + "-" + a);
    }

    function renderizarManos(jugadasActuales) {
        var datos = anexos.at(anexoActual);
        var jugadasNorm = {};
        for (var k = 0; k < jugadasActuales.length; k++) {
            jugadasNorm[normalizarFicha(jugadasActuales.at(k))] = true;
        }
        var html = "";
        for (var j = 0; j < datos.manos.length; j++) {
            var jug = datos.manos.at(j);
            var clasePar = jug.gana ? "etiq-jugador pareja-gana" : "etiq-jugador";
            html += '<div class="fila-jugador">';
            html += '<div class="' + clasePar + '">' + jug.nombre + '<small>' + jug.pareja + '</small></div>';
            html += '<div class="mano-fichas">';
            for (var f = 0; f < jug.fichas.length; f++) {
                var fichaStr = jug.fichas.at(f);
                var izq = fichaStr.charAt(0);
                var der = fichaStr.charAt(2);
                var usada = jugadasNorm[normalizarFicha(fichaStr)] ? " jugada" : "";
                html += '<div class="ficha-mini' + usada + '">' + crearMitadHTML(izq, false) + crearMitadHTML(der, false) + '</div>';
            }
            html += '</div></div>';
        }
        document.getElementById("panel-manos").innerHTML = html;
    }

    function construirCarroContinuoHTML(jugadas, jugadasAnteriores, anchoDisponible) {
        var W = 56;
        var H = 28;
        var GAP = 1;
        var prevSet = {};
        for (var p = 0; p < jugadasAnteriores.length; p++) {
            prevSet[normalizarFicha(jugadasAnteriores.at(p))] = true;
        }

        var idxSalida = jugadas.indexOf("0-0");
        if (idxSalida === -1) idxSalida = 0;

        var izqFichas = jugadas.slice(0, idxSalida).reverse();
        var derFichas = jugadas.slice(idxSalida + 1);

        var colocadas = [];
        var salidaItem = {
            a: "0",
            b: "0",
            cx: 0,
            cy: 0,
            w: H,
            h: W,
            orient: "vertical",
            nueva: !prevSet["0-0"]
        };
        colocadas.push(salidaItem);

        var lastL = salidaItem;
        for (var li = 0; li < izqFichas.length; li++) {
            var fL = izqFichas.at(li);
            var lp1 = fL.charAt(0);
            var lp2 = fL.charAt(2);
            var lDbl = (lp1 === lp2);
            var lfw = lDbl ? H : W;
            var lfh = lDbl ? W : H;
            var itemL = {
                a: lp1,
                b: lp2,
                cx: lastL.cx - lastL.w / 2 - GAP - lfw / 2,
                cy: lastL.cy,
                w: lfw,
                h: lfh,
                orient: lDbl ? "vertical" : "horizontal",
                nueva: !prevSet[normalizarFicha(fL)]
            };
            colocadas.push(itemL);
            lastL = itemL;
        }

        var margenMesa = 24;
        var anchoUtil = Math.max(260, anchoDisponible - margenMesa);
        var minX = lastL.cx - lastL.w / 2;
        var maxX = minX + anchoUtil;

        var lastR = salidaItem;
        var dir = "R";
        var filaY = 0;
        var recienGirado = false;

        for (var ri = 0; ri < derFichas.length; ri++) {
            var fR = derFichas.at(ri);
            var p1 = fR.charAt(0);
            var p2 = fR.charAt(2);
            var esDbl = (p1 === p2);
            var itemR = null;

            if (dir === "R") {
                var fw = esDbl ? H : W;
                var fh = esDbl ? W : H;
                var nextCx = lastR.cx + lastR.w / 2 + GAP + fw / 2;

                if (!esDbl && !recienGirado && (nextCx + fw / 2 > maxX) && ri >= 2) {
                    var turnCx = lastR.cx + lastR.w / 2 - H / 2;
                    var turnCy = filaY + H / 2 + GAP + W / 2;
                    itemR = {
                        a: p1,
                        b: p2,
                        cx: turnCx,
                        cy: turnCy,
                        w: H,
                        h: W,
                        orient: "vertical",
                        nueva: !prevSet[normalizarFicha(fR)]
                    };
                    filaY = turnCy + W / 2 - H / 2;
                    dir = "L";
                    recienGirado = true;
                } else {
                    itemR = {
                        a: p1,
                        b: p2,
                        cx: nextCx,
                        cy: filaY,
                        w: fw,
                        h: fh,
                        orient: esDbl ? "vertical" : "horizontal",
                        nueva: !prevSet[normalizarFicha(fR)]
                    };
                    recienGirado = false;
                }
            } else {
                var fw2 = esDbl ? H : W;
                var fh2 = esDbl ? W : H;
                var nextCx2 = lastR.cx - lastR.w / 2 - GAP - fw2 / 2;

                if (!esDbl && !recienGirado && (nextCx2 - fw2 / 2 < minX)) {
                    var turnCx2 = lastR.cx - lastR.w / 2 + H / 2;
                    var turnCy2 = filaY + H / 2 + GAP + W / 2;
                    itemR = {
                        a: p1,
                        b: p2,
                        cx: turnCx2,
                        cy: turnCy2,
                        w: H,
                        h: W,
                        orient: "vertical",
                        nueva: !prevSet[normalizarFicha(fR)]
                    };
                    filaY = turnCy2 + W / 2 - H / 2;
                    dir = "R";
                    recienGirado = true;
                } else {
                    itemR = {
                        a: p2,
                        b: p1,
                        cx: nextCx2,
                        cy: filaY,
                        w: fw2,
                        h: fh2,
                        orient: esDbl ? "vertical" : "horizontal",
                        nueva: !prevSet[normalizarFicha(fR)]
                    };
                    recienGirado = false;
                }
            }

            colocadas.push(itemR);
            lastR = itemR;
        }
        var boxMinX = Infinity, boxMaxX = -Infinity, boxMinY = Infinity, boxMaxY = -Infinity;
        for (var c = 0; c < colocadas.length; c++) {
            var it = colocadas.at(c);
            boxMinX = Math.min(boxMinX, it.cx - it.w / 2);
            boxMaxX = Math.max(boxMaxX, it.cx + it.w / 2);
            boxMinY = Math.min(boxMinY, it.cy - it.h / 2);
            boxMaxY = Math.max(boxMaxY, it.cy + it.h / 2);
        }

        var totalW = Math.ceil(boxMaxX - boxMinX);
        var totalH = Math.ceil(boxMaxY - boxMinY);
        var html = '<div class="carro-continuo" data-w="' + totalW + '" data-h="' + totalH + '">';

        for (var m = 0; m < colocadas.length; m++) {
            var f = colocadas.at(m);
            var leftPx = Math.round(f.cx - f.w / 2 - boxMinX);
            var topPx = Math.round(f.cy - f.h / 2 - boxMinY);
            var esHoriz = (f.orient === "horizontal");
            var clsNueva = (jugadasAnteriores.length > 0 && f.nueva) ? " ultima-jugada" : "";
            html += '<div class="ficha ' + f.orient + clsNueva + '" data-l="' + leftPx + '" data-t="' + topPx + '">'
                 + crearMitadHTML(f.a, esHoriz) + crearMitadHTML(f.b, esHoriz)
                 + '</div>';
        }
        html += '</div>';
        return html;
    }

    // La CSP no admite estilos en línea en el HTML: las medidas viajan en data-* y se aplican por CSSOM.
    function aplicarMedidas(raiz) {
        raiz.querySelectorAll('[data-w]').forEach(function (e) { e.style.width = e.getAttribute('data-w') + 'px'; e.style.height = e.getAttribute('data-h') + 'px'; });
        raiz.querySelectorAll('[data-l]').forEach(function (e) { e.style.left = e.getAttribute('data-l') + 'px'; e.style.top = e.getAttribute('data-t') + 'px'; });
    }

    function renderizarPantalla() {
        var datos = anexos.at(anexoActual);
        document.getElementById("titulo-ejemplo").textContent = datos.titulo;
        document.getElementById("etiqueta-vuelta").textContent = datos.vueltas.at(pasoActual);
        document.getElementById("descripcion-paso").innerHTML = datos.textos.at(pasoActual);

        var jugadas = datos.jugadasMesa.at(pasoActual);
        var jugadasPrev = (pasoActual > 0) ? datos.jugadasMesa.at(pasoActual - 1) : [];
        var mesa = document.getElementById("mesa-juego");

        if (jugadas.length === 0) {
            mesa.innerHTML = '<div class="mesa-vacia">Mesa vacía · Pulsa «Siguiente ➡» para iniciar la salida</div>';
        } else {
            var anchoMesa = mesa.clientWidth || 340;
            mesa.innerHTML = construirCarroContinuoHTML(jugadas, jugadasPrev, anchoMesa);
            aplicarMedidas(mesa);
        }

        renderizarManos(jugadas);

        var maxPaso = datos.vueltas.length - 1;
        document.getElementById("btn-anterior").disabled = (pasoActual === 0);
        document.getElementById("btn-siguiente").disabled = (pasoActual === maxPaso);

        var cajaResumen = document.getElementById("caja-resumen");
        if (pasoActual === maxPaso) {
            cajaResumen.innerHTML = datos.resumen;
            cajaResumen.style.display = "block";
        } else {
            cajaResumen.style.display = "none";
        }
    }

    function cambiarPaso(delta) {
        var maxPaso = anexos.at(anexoActual).vueltas.length - 1;
        pasoActual += delta;
        if (pasoActual < 0) pasoActual = 0;
        if (pasoActual > maxPaso) pasoActual = maxPaso;
        renderizarPantalla();
    }

    function seleccionarAnexo(indice) {
        anexoActual = indice;
        pasoActual = 0;
        document.getElementById("tab-0").className = (indice === 0) ? "btn-anexo activo" : "btn-anexo";
        document.getElementById("tab-1").className = (indice === 1) ? "btn-anexo activo" : "btn-anexo";
        renderizarPantalla();
    }

    function alternarManos() {
        manosVisibles = !manosVisibles;
        var panel = document.getElementById("panel-manos");
        var btn = document.getElementById("btn-distribucion");
        if (manosVisibles) {
            panel.className = "panel-manos visible";
            btn.className = "btn-dist abierto";
            btn.textContent = "🙈 Ocultar distribución de fichas (J1 - J4)";
        } else {
            panel.className = "panel-manos";
            btn.className = "btn-dist";
            btn.textContent = "👁️ Ver distribución de fichas (J1 - J4)";
        }
    }

    window.addEventListener("resize", renderizarPantalla);
    renderizarPantalla();

document.getElementById('tab-0').addEventListener('click', function () { seleccionarAnexo(0); });
document.getElementById('tab-1').addEventListener('click', function () { seleccionarAnexo(1); });
document.getElementById('btn-distribucion').addEventListener('click', function () { alternarManos(); });
document.getElementById('btn-anterior').addEventListener('click', function () { cambiarPaso(-1); });
document.getElementById('btn-siguiente').addEventListener('click', function () { cambiarPaso(1); });
