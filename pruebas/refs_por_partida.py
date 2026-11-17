"""Referencias para probar «subir varias partidas»: para cada partida k de un Excel real (SP, parejas o individual) pone k en la celda WEB_J_MANUAL de INICIO,
recalcula el libro entero con LibreOffice y le pasa web_export.py de programas-domino. Es decir, lo que daría la hoja WEB si el árbitro eligiera esa partida.
Escribe carpeta/k01.json, k02.json… (también las partidas sin datos). El Excel no se toca: se trabaja sobre copias en una carpeta temporal.

Uso:   python3 -I pruebas/refs_por_partida.py libro.xlsx carpeta <programas-domino>/tools/comun [partidas, p. ej. 1,2,3]
Luego: node pruebas/probar_excel_real.cjs libro.xlsx carpeta/k07.json --refs carpeta     (k07: la partida que trae la hoja WEB)
Hace falta LibreOffice con su Python (import uno) y openpyxl. Tarda unos 10 s por partida."""
import os, sys, time, json, subprocess, tempfile

libro, salida, comun = (os.path.abspath(x) for x in sys.argv[1:4])
sys.path.insert(0, comun)
import openpyxl, uno
from com.sun.star.beans import PropertyValue
import web_export

wb = openpyxl.load_workbook(libro, read_only=True, data_only=True)
n = wb['WEB']['B11'].value
cel = wb.defined_names['WEB_J_MANUAL'].attr_text.split('!')[1].replace('$', '')
ks = [int(x) for x in sys.argv[4].split(',')] if len(sys.argv) > 4 else list(range(1, n + 1))
os.makedirs(salida, exist_ok=True)


def prop(nombre, valor):
    p = PropertyValue(); p.Name = nombre; p.Value = valor; return p


with tempfile.TemporaryDirectory() as tmp:
    pipe = 'refs_partida_%d' % os.getpid()
    lo = subprocess.Popen(['soffice', '--headless', '--invisible', '--nologo', '--norestore', '-env:UserInstallation=file://%s/perfil' % tmp,
                           '--accept=pipe,name=%s;urp;' % pipe], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    ctx = None
    for _ in range(120):
        try:
            ctx = resolver.resolve('uno:pipe,name=%s;urp;StarOffice.ComponentContext' % pipe); break
        except Exception:
            time.sleep(0.5)
    desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(libro), '_blank', 0, (prop('Hidden', True),))
    celda = doc.Sheets.getByName('INICIO').getCellRangeByName(cel)
    for k in ks:
        celda.setValue(k)
        doc.calculateAll()
        copia = os.path.join(tmp, 'k%02d.xlsx' % k)
        doc.storeToURL(uno.systemPathToFileUrl(copia), (prop('FilterName', 'Calc MS Excel 2007 XML'),))
        j, _, _ = web_export.exportar(copia, '2026-01-01T00:00:00Z', True)
        assert j['jornada']['numero'] == k, (k, j['jornada']['numero'])
        open(os.path.join(salida, 'k%02d.json' % k), 'w', encoding='utf-8').write(web_export.texto(j))  # con el formato de web_export.py
        print('partida', k, 'ok', flush=True)
    doc.close(True)
    try:
        desktop.terminate()
    except Exception:
        pass
    lo.wait(timeout=60)  # que LibreOffice suelte la carpeta temporal antes de borrarla
