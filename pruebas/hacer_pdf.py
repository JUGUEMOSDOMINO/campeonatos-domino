"""Hace un PDF con la forma del informe «Clasificación Partida N» que saca Access, con datos INVENTADOS.
Uso: python3 -I pruebas/hacer_pdf.py especificacion.json salida.pdf
La especificación (JSON): { "titulo", "fecha", "partidas", "filas_por_pagina", "grupos": { "A": [[pos, num, "Pareja", ganadas, perdidas, dif, pf, pc], ...], "B": [...] } }.
Cada celda va como un texto suelto en su columna, igual que en el original; los miles llevan punto (1.994) y la diferencia puede ser negativa.
Cuando un grupo sigue en otra página, la página nueva repite la cabecera de columnas y el rótulo «Grupo X». Un grupo vacío no sale."""
import json
import sys

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

pdfmetrics.registerFont(TTFont('Liberation', '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'))
ANCHO, ALTO = 595, 842
X = {'pos': 40, 'num': 75, 'pareja': 100, 'gan': 360, 'per': 405, 'dif': 460, 'pf': 505, 'pc': 555}  # derecha de las cifras; izquierda de la pareja


def miles(n):
    return f'{n:,}'.replace(',', '.')


def hacer(espec, salida):
    c = canvas.Canvas(salida, pagesize=(ANCHO, ALTO))
    por_pagina = espec.get('filas_por_pagina', 30)
    c.setTitle('Clasificación')

    def cabecera(primera):
        y = ALTO - 40
        if primera:
            c.setFont('Liberation', 14)
            c.drawCentredString(ANCHO / 2, y, espec['titulo'])
            c.setFont('Liberation', 12)
            c.drawCentredString(ANCHO / 2, y - 18, espec['fecha'])
            c.drawString(190, y - 55, 'Clasificación Partida:')
            c.drawString(310, y - 55, str(espec['partidas']))
            c.drawString(360, y - 55, 'PDF')
            y -= 95
        c.setFont('Liberation', 8)
        c.drawString(X['pos'] - 30, y, 'Posición')
        c.drawString(X['pareja'], y, 'Pareja')
        for k, t in (('gan', 'Ganadas'), ('per', 'Perdidas'), ('dif', 'Dif. Puntos'), ('pf', 'P. Favor'), ('pc', 'P. Contra')):
            c.drawRightString(X[k], y, t)
        return y - 22

    y = cabecera(True)
    usadas = 0
    for g, filas in espec['grupos'].items():
        if not filas:
            continue
        c.setFont('Liberation', 10)
        c.drawString(250, y, f'Grupo    {g}')
        y -= 18
        c.setFont('Liberation', 9)
        for f in filas:
            if usadas == por_pagina:
                c.showPage()
                usadas = 0
                y = cabecera(False)
                c.setFont('Liberation', 10)
                c.drawString(250, y, f'Grupo    {g}')
                y -= 18
                c.setFont('Liberation', 9)
            pos, num, pareja, gan, per, dif, pf, pc = f
            c.drawRightString(X['pos'], y, str(pos))
            c.drawRightString(X['num'], y, str(num))
            c.drawString(X['pareja'], y, pareja)
            c.drawRightString(X['gan'], y, str(gan))
            c.drawRightString(X['per'], y, str(per))
            c.drawRightString(X['dif'], y, miles(dif))
            c.drawRightString(X['pf'], y, miles(pf))
            c.drawRightString(X['pc'], y, miles(pc))
            y -= 14
            usadas += 1
        y -= 10
    c.showPage()
    c.save()


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as fh:
        hacer(json.load(fh), sys.argv[2])
