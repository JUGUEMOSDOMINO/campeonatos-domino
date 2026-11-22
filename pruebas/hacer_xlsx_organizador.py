"""Crea un .xlsx con la forma de la Hoja de resumen de los organizadores (la que genera tools/ranking/b_hoja_resumen.py de
programas-domino), con un campeonato de parejas inventado. Solo sirve para probar assets/resumen.js y publicar.html:
el .xlsx no se sube al repositorio. Las licencias son inventadas (9xxx y 46/ 9xxx, que no existen).
Uso: python3 hacer_xlsx_organizador.py salida.xlsx [--sin-b] [--dif-mal]"""
import sys
from datetime import date
from openpyxl import Workbook

CAMPEONATO = ['1º CAMPEONATO DE EJEMPLO DE PAREJAS', date(2027, 2, 6), 'Sala de ejemplo', 'Asociación de ejemplo', 7]
EJEMPLO = [1, 7, 'Ana Roig - Pau Vidal', 'XXX', 7, 2100, 1300, 800, '46/ 9001', 'NO']
GRUPO_A = [
    [1, 7, 'Lola Soler - Toni Serra', 'AAA', 7, 2100, 1300, 800, 9001, '46/ 9002'],
    [2, 3, 'Rosa María Mas - Joan Ferrer', 'MIX', 6, 1900, 1400, 500, 9003, 'NO'],
    [3, 12, 'Marta Puig - Xavi Bosch', 'BBB', 4, 1600, 1500, 100, 9005, 9006],
    [4, 5, 'Nuria Pons - Pep Ribes', 'ZZZ', 0, 800, 1500, -700, 9008, 9009, 6, 10],
]
GRUPO_B = [
    [1, 9, 'Vicent Vila - Carla Camps', 'AAA', 2, 900, 600, 300, 'F201', 9010],
    [2, 14, 'Quique Torres - Alba Llorca', 'MIX', 1, 700, 900, -200, 9011, 9012],
]
SUSTITUCIONES = [
    ['A', 12, 'Elena Sala', 9007, 2, 3, 'E'],
    ['B', 14, 'Iker Climent', 9013, 1, 2, 10],
    ['B', 14, 'Sara Gil', 9014, 1, 1, 10],
]


def tabla(ws, cab, filas, ejemplo):
    for i, t in enumerate(cab):
        ws.cell(4, 1 + i, t)
    for i, v in enumerate(ejemplo):
        ws.cell(5, 1 + i, v)
    for r, f in enumerate(filas, 6):
        for i, v in enumerate(f):
            ws.cell(r, 1 + i, v)


def construir(salida, sin_b=False, dif_mal=False):
    wb = Workbook()
    wb.active.title = 'Instrucciones'
    c = wb.create_sheet('Campeonato')
    c['A1'] = 'HOJA DE RESUMEN DEL CAMPEONATO DE PAREJAS'
    for r, (rotulo, v) in enumerate(zip(['Nombre del campeonato', 'Fecha', 'Lugar', 'Organizador', 'Partidas jugadas'], CAMPEONATO), 4):
        c.cell(r, 1, rotulo)
        c.cell(r, 2, v)
    cab = ['Puesto', 'Nº', 'Pareja', 'Zona', 'P.G.', 'P.F.', 'P.C.', 'Dif.', 'Licencia jugador 1', 'Licencia jugador 2',
           'Retirada desde la partida nº', 'Si se retiró: 10 (avisó) o 9']
    tabla(wb.create_sheet('Grupo A'), cab, [[*f[:7], 801, *f[8:]] if dif_mal and f[0] == 1 else f for f in GRUPO_A], EJEMPLO)
    tabla(wb.create_sheet('Grupo B'), cab, [] if sin_b else GRUPO_B, EJEMPLO)
    tabla(wb.create_sheet('Sustituciones'), ['Grupo (A o B)', 'Nº de pareja', 'Sustituto (nombre y primer apellido)', 'Licencia del sustituto',
                                             'Sustituye al jugador (1 o 2)', 'Partidas que jugó', 'Caso (E, 10 o 9)'],
          [s for s in SUSTITUCIONES if not (sin_b and s[0] == 'B')], ['A', 7, 'Marta Puig', 9005, 2, 3, 'E'])
    wb.save(salida)


if __name__ == '__main__':
    construir(sys.argv[1], '--sin-b' in sys.argv, '--dif-mal' in sys.argv)
