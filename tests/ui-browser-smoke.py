#!/usr/bin/env python3
"""Optional real-browser smoke test.

Requires Chromium, websocket-client, and a local policy that permits navigation to localhost.
It starts a temporary HTTP server because the app fetches its JSON dataset.
"""
import base64, json, pathlib, shutil, subprocess, time, urllib.request, zipfile
import websocket

ROOT=pathlib.Path(__file__).resolve().parents[1]
PORT=8765
DEBUG=9222
TMP=pathlib.Path('/tmp/nexus-ui-smoke')
DOWNLOAD=TMP/'downloads'
PROFILE=TMP/'chrome-profile'
SCREEN=ROOT/'tests'/'ui-browser-smoke.png'

def wait_json(url, timeout=15):
    end=time.time()+timeout
    while time.time()<end:
        try:
            with urllib.request.urlopen(url, timeout=1) as r:
                return json.loads(r.read().decode())
        except Exception:
            time.sleep(.15)
    raise RuntimeError(f'timed out waiting for {url}')

def main():
    shutil.rmtree(TMP, ignore_errors=True); DOWNLOAD.mkdir(parents=True); PROFILE.mkdir(parents=True)
    server=subprocess.Popen(['python3','-m','http.server',str(PORT),'--bind','127.0.0.1'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    chrome=subprocess.Popen(['chromium','--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--remote-allow-origins=*',f'--remote-debugging-port={DEBUG}',f'--user-data-dir={PROFILE}','about:blank'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    try:
        # Confirm app HTTP endpoint before starting browser checks.
        deadline=time.time()+10
        while time.time()<deadline:
            try:
                urllib.request.urlopen(f'http://127.0.0.1:{PORT}/', timeout=1).read(64); break
            except Exception: time.sleep(.15)
        else: raise RuntimeError('local HTTP server did not start')

        targets=wait_json(f'http://127.0.0.1:{DEBUG}/json/list')
        page=next(t for t in targets if t.get('type')=='page')
        ws=websocket.create_connection(page['webSocketDebuggerUrl'],timeout=5)
        seq=0
        def cmd(method,params=None):
            nonlocal seq
            seq+=1; ident=seq
            ws.send(json.dumps({'id':ident,'method':method,'params':params or {}}))
            while True:
                msg=json.loads(ws.recv())
                if msg.get('id')==ident:
                    if 'error' in msg: raise RuntimeError(f"CDP {method}: {msg['error']}")
                    return msg.get('result',{})
        def ev(expr):
            r=cmd('Runtime.evaluate',{'expression':expr,'returnByValue':True,'awaitPromise':True})
            if 'exceptionDetails' in r: raise RuntimeError(r['exceptionDetails'])
            return r.get('result',{}).get('value')
        cmd('Page.enable'); cmd('Runtime.enable')
        cmd('Emulation.setDeviceMetricsOverride',{'width':1440,'height':1000,'deviceScaleFactor':1,'mobile':False})
        cmd('Page.navigate',{'url':f'http://127.0.0.1:{PORT}/'})
        end=time.time()+15
        while time.time()<end:
            if ev("document.readyState==='complete' && document.querySelectorAll('#tbody tr').length===51"): break
            time.sleep(.2)
        else:
            href=ev("location.href")
            stamp=ev("document.querySelector('#datasetStamp')?.textContent")
            raise RuntimeError(f"app did not render; href={href!r}; stamp={stamp!r}")

        checks=[]
        def check(name,cond,detail=''):
            checks.append((name,bool(cond),detail))
            if not cond: raise AssertionError(f'{name}: {detail}')
        check('51 rows render',ev("document.querySelectorAll('#tbody tr').length") == 51)
        check('scope column present','Nexus threshold sales scope' in ev("[...document.querySelectorAll('#headerRow th')].map(x=>x.textContent)"))
        ev("document.querySelector('#dollarThresholdOnly').click()")
        time.sleep(.15)
        check('dollar-only toggle yields 30 rows',ev("document.querySelectorAll('#tbody tr').length") == 30)
        ev("(()=>{const i=document.querySelector('#filterRow input[data-key=state]'); i.value='texas'; i.dispatchEvent(new Event('input',{bubbles:true}));})()")
        time.sleep(.15)
        check('column filter combines with toggle',ev("document.querySelectorAll('#tbody tr').length") == 1)
        check('Texas is filtered row',ev("document.querySelector('#tbody tr .state-cell').textContent") == 'Texas')
        ev("document.querySelector('#clearFilters').click()")
        time.sleep(.15)
        check('clear restores all rows',ev("document.querySelectorAll('#tbody tr').length") == 51)
        check('clear resets toggle',ev("!document.querySelector('#dollarThresholdOnly').checked"))

        cmd('Page.setDownloadBehavior',{'behavior':'allow','downloadPath':str(DOWNLOAD)})
        ev("document.querySelector('#exportAllExcel').click()")
        end=time.time()+8; xlsx=None
        while time.time()<end:
            files=list(DOWNLOAD.glob('*.xlsx'))
            if files: xlsx=files[0]; break
            time.sleep(.2)
        check('Excel file downloaded',xlsx is not None)
        with zipfile.ZipFile(xlsx) as z:
            sheet=z.read('xl/worksheets/sheet1.xml').decode('utf-8')
            check('Excel includes scope column','Nexus threshold sales scope' in sheet)
            check('Excel includes source column','Primary source' in sheet)

        shot=cmd('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})
        SCREEN.write_bytes(base64.b64decode(shot['data']))
        cmd('Emulation.setDeviceMetricsOverride',{'width':390,'height':844,'deviceScaleFactor':1,'mobile':True})
        time.sleep(.2)
        check('mobile toolbar controls remain visible',ev("document.querySelector('#dollarThresholdOnly').getBoundingClientRect().width>0 && document.querySelector('#exportExcel').getBoundingClientRect().width>0"))
        check('mobile table remains scrollable',ev("document.querySelector('.table-wrap').scrollWidth > document.querySelector('.table-wrap').clientWidth"))

        print('Browser UI smoke test OK')
        for name,_,detail in checks: print(f'- PASS: {name}'+(f' ({detail})' if detail else ''))
        print(f'- Screenshot: {SCREEN}')
        ws.close()
    finally:
        for proc in (chrome,server):
            proc.terminate()
            try: proc.wait(timeout=3)
            except Exception: proc.kill()

if __name__=='__main__':
    main()
