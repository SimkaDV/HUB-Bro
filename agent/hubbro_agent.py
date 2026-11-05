"""HUB BRO Print Agent.

Фоновая программа на компьютере с принтером. Сама ходит на сервер по HTTPS,
забирает задания печати, печатает PDF без масштабирования и сообщает результат.
Входящие порты не нужны, ключи Авито здесь не хранятся.

Только стандартная библиотека Python — легко собрать в один .exe (PyInstaller).

    python hubbro_agent.py pair --server https://hub.example.ru КОД
    python hubbro_agent.py run
    python hubbro_agent.py printers
"""
import argparse
import json
import logging
import os
import platform
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

VERSION = "0.1.0"
POLL_SEC = 2
HEARTBEAT_SEC = 15

log = logging.getLogger("hubbro-agent")
IS_WIN = platform.system() == "Windows"


def config_dir() -> Path:
    base = Path(os.environ.get("APPDATA", Path.home())) if IS_WIN else Path.home()
    d = base / ("HUB BRO Agent" if IS_WIN else ".hubbro-agent")
    d.mkdir(parents=True, exist_ok=True)
    return d


CONFIG = config_dir() / "config.json"
PENDING = config_dir() / "pending_results.json"


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def save_json(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    tmp.replace(path)


# --- HTTP --------------------------------------------------------------------

class Api:
    def __init__(self, server: str, token: str | None = None):
        self.server = server.rstrip("/")
        self.token = token

    def request(self, method: str, path: str, body: dict | None = None, raw: bool = False):
        data = json.dumps(body).encode() if body is not None else None
        req = urllib.request.Request(self.server + path, data=data, method=method)
        req.add_header("User-Agent", f"hubbro-agent/{VERSION}")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        if self.token:
            req.add_header("Authorization", f"Bearer {self.token}")
        with urllib.request.urlopen(req, timeout=30) as r:
            if r.status == 204:
                return None
            payload = r.read()
            return payload if raw else json.loads(payload or b"null")


# --- принтеры ----------------------------------------------------------------

def _run(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False).stdout


def list_printers() -> tuple[list[str], str | None]:
    if IS_WIN:
        ps = ["powershell", "-NoProfile", "-Command"]
        names = [n.strip() for n in _run(ps + ["Get-Printer | Select-Object -ExpandProperty Name"]).splitlines() if n.strip()]
        default = _run(ps + ["(Get-CimInstance Win32_Printer | Where-Object Default).Name"]).strip() or None
        return names, default
    names = [line.split()[0] for line in _run(["lpstat", "-e"]).splitlines() if line.strip()]
    out = _run(["lpstat", "-d"])
    default = out.split(":", 1)[1].strip() if ":" in out else None
    return names, default


def sumatra_path() -> str | None:
    candidates = [
        os.environ.get("SUMATRA_PATH"),
        str(Path(sys.executable).parent / "SumatraPDF.exe"),
        str(Path(__file__).parent / "SumatraPDF.exe"),
        r"C:\Program Files\SumatraPDF\SumatraPDF.exe",
        str(Path(os.environ.get("LOCALAPPDATA", "")) / "SumatraPDF" / "SumatraPDF.exe"),
    ]
    return next((c for c in candidates if c and Path(c).exists()), None)


def print_pdf(path: Path, printer: str | None) -> None:
    """Печать как есть: без подгонки под страницу, чтобы QR не исказился."""
    if IS_WIN:
        exe = sumatra_path()
        if not exe:
            raise RuntimeError("Не найден SumatraPDF.exe — положите его рядом с агентом или задайте SUMATRA_PATH")
        cmd = [exe, "-silent", "-print-settings", "noscale"]
        cmd += ["-print-to", printer] if printer else ["-print-to-default"]
        cmd.append(str(path))
    else:
        if not shutil.which("lp"):
            raise RuntimeError("Не найдена команда lp (CUPS)")
        cmd = ["lp", "-o", "print-scaling=none"] + (["-d", printer] if printer else []) + [str(path)]
    res = subprocess.run(cmd, capture_output=True, text=True, timeout=120, check=False)
    if res.returncode != 0:
        raise RuntimeError((res.stderr or res.stdout or f"код {res.returncode}").strip())
    # Факт передачи в очередь ОС; физическое завершение подтверждает оператор (ТЗ 6.2)
    log.info("отправлено в очередь: %s %s", printer or "(по умолчанию)", res.stdout.strip())


# --- основной цикл -----------------------------------------------------------

def flush_pending(api: Api) -> None:
    pending = load_json(PENDING, [])
    left = []
    for item in pending:
        try:
            api.request("POST", f"/api/agent/jobs/{item['job_id']}/result", {"ok": item["ok"], "error": item["error"]})
        except urllib.error.HTTPError as e:
            if e.code >= 500:
                left.append(item)
        except OSError:
            left.append(item)
    if pending != left:
        save_json(PENDING, left)


def report(api: Api, job_id: int, ok: bool, error: str | None) -> None:
    # Сначала пишем на диск, чтобы результат не потерялся при обрыве связи
    pending = load_json(PENDING, [])
    pending.append({"job_id": job_id, "ok": ok, "error": error})
    save_json(PENDING, pending)
    flush_pending(api)


def handle_job(api: Api, job: dict) -> None:
    log.info("задание %s (%s %s) → %s", job["id"], job["kind"], job.get("label_code") or "", job.get("printer_name"))
    try:
        data = api.request("GET", job["file_url"], raw=True)
        if not data.startswith(b"%PDF"):
            raise RuntimeError("сервер прислал не PDF")
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as f:
            f.write(data)
            path = Path(f.name)
        try:
            print_pdf(path, job.get("printer_name"))
        finally:
            # Sumatra/lp успевают забрать файл; на Windows иногда ещё держат — не страшно
            try:
                path.unlink()
            except OSError:
                pass
        report(api, job["id"], True, None)
    except Exception as e:  # noqa: BLE001
        log.error("задание %s не напечатано: %s", job["id"], e)
        report(api, job["id"], False, str(e)[:500])


def run() -> None:
    cfg = load_json(CONFIG, {})
    if not cfg.get("token"):
        sys.exit("Агент не привязан. Выполните: hubbro_agent pair --server URL КОД")
    api = Api(cfg["server"], cfg["token"])
    log.info("HUB BRO Agent %s, сервер %s", VERSION, api.server)
    last_hb = 0.0
    backoff = POLL_SEC
    while True:
        try:
            if time.time() - last_hb > HEARTBEAT_SEC:
                printers, default = list_printers()
                api.request("POST", "/api/agent/heartbeat",
                            {"printers": printers, "default_printer": default, "version": VERSION})
                last_hb = time.time()
                flush_pending(api)
            job = api.request("GET", "/api/agent/jobs/next")
            if job:
                handle_job(api, job)
                continue
            backoff = POLL_SEC
        except urllib.error.HTTPError as e:
            if e.code == 401:
                sys.exit("Сервер не узнаёт станцию — привяжите агент заново новым кодом из кабинета")
            log.warning("сервер ответил %s", e.code)
            backoff = min(backoff * 2, 60)
        except OSError as e:
            log.warning("нет связи с сервером: %s", e)
            backoff = min(backoff * 2, 60)
        time.sleep(backoff)


def pair(server: str, code: str) -> None:
    api = Api(server)
    try:
        res = api.request("POST", "/api/agent/pair", {"code": code, "hostname": socket.gethostname()})
    except urllib.error.HTTPError as e:
        sys.exit(f"Не удалось привязать: {json.loads(e.read() or b'{}').get('detail', e.code)}")
    save_json(CONFIG, {"server": api.server, "token": res["token"]})
    print(f"Готово: станция «{res['station']['name']}». Теперь запустите: hubbro_agent run")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    p = argparse.ArgumentParser(prog="hubbro_agent", description="HUB BRO Print Agent")
    sub = p.add_subparsers(dest="cmd", required=True)
    pp = sub.add_parser("pair", help="привязать компьютер к кабинету")
    pp.add_argument("--server", required=True)
    pp.add_argument("code")
    sub.add_parser("run", help="запустить агент")
    sub.add_parser("printers", help="показать принтеры")
    tp = sub.add_parser("print-file", help="напечатать PDF напрямую (проверка драйвера)")
    tp.add_argument("path")
    tp.add_argument("--printer")
    a = p.parse_args()
    if a.cmd == "pair":
        pair(a.server, a.code)
    elif a.cmd == "run":
        run()
    elif a.cmd == "printers":
        names, default = list_printers()
        for n in names:
            print(("* " if n == default else "  ") + n)
        if not names:
            print("Принтеры не найдены")
    elif a.cmd == "print-file":
        print_pdf(Path(a.path), a.printer)


if __name__ == "__main__":
    main()
