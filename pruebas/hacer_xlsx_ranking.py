"""Crea un .xlsx pequeño con la hoja WEB del ranking (contrato 1.4, Diseno_ranking.md §3.7 de programas-domino)
a partir de un actual.json de ranking de prueba. Solo sirve para probar publicar.html: el .xlsx no se sube al repo.
Uso: python3 hacer_xlsx_ranking.py pruebas/datos/ranking-ejemplo/actual.json salida.xlsx [--errores N]"""
import json, sys
from openpyxl import Workbook

META = ['id', 'nombre', 'tipo', 'temporada', 'estado', 'fecha', 'n_torneos', 'n_mejores', 'plazas_ce', 'plazas_ranking', 'sp_jugado', 'open_jugado',
        'plazas_provisionales', 'plazas_vacias', 'plazas_vacias_sp', 'plazas_vacias_open', 'n_jugadores', 'contacto', 'normativa_url', 'errores']
TOR = ['col', 'nombre', 'fecha', 'tipo', 'categoria', 'parejas', 'cargado']
RK = ['puesto', 'empate', 'nombre', 'apellido1', 'licencia', 'licencia_ant', 'asociacion', 'total', 'plaza_ce', 'plaza_sp', 'plaza_open', 'plaza_ranking', 'por_repartir', 'pareja_n'] + \
     ['t%02d' % k for k in range(1, 21)] + ['a%02d' % k for k in range(1, 21)]
num = lambda b: 1 if b is True else 0 if b is False else b

j = json.load(open(sys.argv[1], encoding='utf-8'))
errores = int(sys.argv[sys.argv.index('--errores') + 1]) if '--errores' in sys.argv else 0
wb = Workbook()
ws = wb.active
ws.title = 'WEB'
ws['A1'] = j['version']
ws['B1'] = 'WEB · datos para la página de publicación. No se edita.'
ws['A2'], ws['D2'], ws['L2'] = 'META', 'TORNEOS', 'RANKING'
ws['A3'], ws['B3'] = 'clave', 'valor'
for i, k in enumerate(META):
    ws.cell(4 + i, 1, k)
    ws.cell(4 + i, 2, errores if k == 'errores' else num(j['torneo'].get(k, 0 if k.startswith('plazas_vacias') else None)))
for i, k in enumerate(TOR):
    ws.cell(3, 4 + i, k)
for r, t in enumerate(j['torneos'], 4):
    for i, k in enumerate(TOR):
        ws.cell(r, 4 + i, num(t[k]))
for i, k in enumerate(RK):
    ws.cell(3, 12 + i, k)
for r, f in enumerate(j['ranking'], 4):
    for i, k in enumerate(RK[:14]):
        ws.cell(r, 12 + i, num(f.get(k)))
    for i, p in enumerate(f['puntos']):
        ws.cell(r, 26 + i, p)
    for k in f.get('abandonos', []):           # a01…a20 (AT…): 1 = no puntuó en ese torneo por abandono o expulsión
        ws.cell(r, 46 + k, 1)
# otras hojas del Excel del ranking, que publicar.html no debe leer
for h in ('INICIO', 'Jugadores', 'Licencias', 'Torneos', 'Resultados', 'Ranking'):
    wb.create_sheet(h)['A1'] = 'no se lee'
wb.save(sys.argv[2])
