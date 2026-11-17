"""Crea un .xlsx de parejas de prueba con la hoja WEB de una partida (la seleccionada) y las hojas _WEBC, _R1…_Rn y P.1…P.n como las de un Excel real
(mismas columnas que 17_Campeonato_TORREFIEL…), a partir de los jornada_NN.json de una carpeta de pruebas/datos. Con ellos publicar.html tiene que sacar
de las hojas de datos las demás partidas y dar otra vez esos mismos JSON. Solo sirve para probar: el .xlsx no se sube al repo.
Uso: python3 hacer_xlsx_partidas.py datos/parejas-ejemplo-2026-11-14 <partida en WEB> salida.xlsx [partida_sin_datos ...] [--sin-fijar-1]"""
import json, os, subprocess, sys
from openpyxl import load_workbook

carpeta, k0, salida = sys.argv[1], int(sys.argv[2]), sys.argv[3]
aqui = os.path.dirname(os.path.abspath(__file__))
js = {}
for f in sorted(os.listdir(carpeta)):
    if f.startswith('jornada_') and f.endswith('.json'):
        j = json.load(open(os.path.join(carpeta, f), encoding='utf-8'))
        js[j['jornada']['numero']] = j
subprocess.run([sys.executable, os.path.join(aqui, 'hacer_xlsx.py'), os.path.join(carpeta, 'jornada_%02d.json' % k0), salida], check=True)
wb = load_workbook(salida)
# En la hoja WEB real, la mesa de descanso lleva vacío el lado derecho (no 0): hacer_xlsx.py lo escribe con 0
for fila in wb['WEB'].iter_rows(min_row=4, min_col=29, max_col=41):
    if fila[7].value == 'descanso':
        fila[10].value = None; fila[12].value = None
n = js[k0]['torneo']['n_jornadas']
puntos = js[k0]['torneo']['puntos_ausencia']
base = js[k0]

# _WEBC: cabeceras (fila 1) y fórmulas de la fila 2, como en el Excel real
w = wb.create_sheet('_WEBC')
CHOOSE = {'G': ('grp', 'K'), 'H': ('crank', 'BA'), 'I': ('ckey', 'BB'), 'J': ('done', 'AQ'), 'K': ('pf', 'AO'), 'L': ('win', 'AR'), 'M': ('PG', 'AS'), 'N': ('TF', 'AT'),
          'O': ('TC', 'AU'), 'P': ('pend', 'BG'), 'Q': ('fret', 'L'), 'R': ('faus', 'L'), 'S': ('tie', 'BF'), 'AA': ('t_tex', 'BO'), 'AB': ('t_tgrp', 'BP'), 'AC': ('t_tph', 'BQ'),
          'AD': ('t_tauto', 'BR'), 'AE': ('t_tdone', 'BS'), 'AF': ('t_lpf', 'BX'), 'AG': ('t_rpf', 'BY'), 'AH': ('t_i1', 'BM'), 'AJ': ('t_d1', 'BN')}
rs = lambda col, fila='2': ','.join("'_R%d'!%s%s" % (k, col, fila) for k in range(1, 15))
for c, (h, col) in CHOOSE.items():
    w[c + '1'] = h
    w[c + '2'] = '=CHOOSE(J_WEB,' + rs(col) + ')'
for c, h in {'D': 's', 'E': 'real', 'F': 'ret_desde', 'T': 'jug', 'U': 'nom1', 'V': 'ap1', 'W': 'nom2', 'X': 'ap2', 'Y': 'zone', 'BA': 'jr'}.items():
    w[c + '1'] = h
w['T2'] = '=' + '+'.join("IF(AND(%d<=J_WEB,%d>=IF(G2=\"B\",PARTIDA_B,1)),'_R%d'!AQ2,0)" % (k, k, k) for k in range(1, 15))
w['BA2'] = '=IFERROR(MATCH(1,$AT$2:$AT$101,0),0)'
ESC = [('JW', None), ('idbad', None), ('nA', None), ('nB', None), ('tA', '$CD$5'), ('pendT', '$CD$9'), ('complete', '$CD$10'), ('fixOK', '$CD$28'), ('errs', '$CD$25')]
for i, (e, cel) in enumerate(ESC, 2):
    w['A%d' % i] = e
    if cel:
        w['B%d' % i] = '=CHOOSE(J_WEB,' + ','.join("'_R%d'!%s" % (k, cel) for k in range(1, 15)) + ')'
w['A11'] = 'avisos'
w['B11'] = '=CHOOSE(J_WEB,' + ','.join("COUNTIF('P.%d'!$I$7:$I$116,\"⚠*\")" % k for k in range(1, 15)) + ')'
for p in base['participantes']:
    f = p['id'] + 1
    w['E%d' % f] = 1
    w['F%d' % f] = p['ret_desde']
    for c, k in zip('UVWXY', ['j1_nombre', 'j1_apellido1', 'j2_nombre', 'j2_apellido1', 'zona']):
        w['%s%d' % (c, f)] = p[k]

# _R1…_Rn: una hoja por partida con sus columnas; P.1…P.n vacías de avisos. Las partidas sin datos quedan con las hojas vacías.
sin_fijar_1 = '--sin-fijar-1' in sys.argv  # la partida 1 con el sorteo sin fijar (y, como no hay celdas de semilla, sin poder saber si se hizo)
sin_datos = {int(x) for x in sys.argv[4:] if not x.startswith('--')}
for k in range(1, 15):
    r = wb.create_sheet('_R%d' % k)
    wb.create_sheet('P.%d' % k)
    j = js.get(k)
    if not j or k in sin_datos or k > n:
        continue
    cl = {c['id']: c for c in j['clasificacion']}
    r['CD5'] = sum(1 for c in j['clasificacion'] if c['grupo'] == 'A')
    r['CD9'] = j['jornada']['mesas_pendientes']; r['CD10'] = 1 if j['jornada']['completa'] else 0; r['CD25'] = 0
    r['CD28'] = 0 if (k == 1 and sin_fijar_1) else 1 if j['jornada']['emparejamiento'] == 'fijado' else 0
    pf, win = {}, {}
    cerradas = {i for m in j['emparejamientos'] if m['estado'] != 'pendiente' for i in m['izq'] + m['dcha']}
    for m in j['emparejamientos']:
        for lado, tl, pl in ((m['izq'], 't_izq', 'p_izq'), (m['dcha'], 't_dcha', 'p_dcha')):
            for i in lado:
                if m[tl] is not None and m['estado'] not in ('pendiente', 'no_cuenta'):
                    pf[i] = m[tl]; win[i] = m[pl]
    for p in j['participantes']:
        s = p['id']; f = s + 1; c = cl[s]
        r['K%d' % f] = c['grupo']; r['L%d' % f] = 1 if p['ret'] else 0
        r['BA%d' % f] = c['puesto']; r['BB%d' % f] = '%s|%d' % (c['grupo'], c['puesto'])
        r['AQ%d' % f] = 1 if s in cerradas else 0
        r['AO%d' % f] = pf.get(s); r['AR%d' % f] = win.get(s)
        r['AS%d' % f] = c['gan']; r['AT%d' % f] = c['tf']; r['AU%d' % f] = c['tc']
        r['BG%d' % f] = 1 if c['pendiente'] else 0; r['BF%d' % f] = c['desempate']
    for i, m in enumerate(j['emparejamientos'], 2):
        r['BO%d' % i] = 1; r['BP%d' % i] = m['grupo']; r['BQ%d' % i] = m['mesa'] or 0; r['BR%d' % i] = 0
        r['BS%d' % i] = 0 if m['estado'] == 'pendiente' else 1
        if m['estado'] == 'descanso':
            r['BM%d' % i] = m['izq'][0]; r['BN%d' % i] = 1001; r['BX%d' % i] = m['t_izq']; r['BY%d' % i] = 0
        else:
            r['BM%d' % i] = m['izq'][0]; r['BN%d' % i] = m['dcha'][0]; r['BX%d' % i] = m['t_izq']; r['BY%d' % i] = m['t_dcha']
wb.save(salida)
