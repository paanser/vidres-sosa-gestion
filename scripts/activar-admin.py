"""Primer acceso privado por HTTPS. No escribe contraseñas ni tokens en disco."""
import getpass
import json
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    if len(sys.argv) != 2 or not sys.stdin.isatty():
        raise ValueError("Uso desde una terminal: python scripts/activar-admin.py https://TU-WORKER.workers.dev")
    base = sys.argv[1].rstrip("/")
    url = urllib.parse.urlsplit(base)
    if url.scheme != "https" or not url.hostname or url.username or url.password or url.query or url.fragment or url.path:
        raise ValueError("Indica únicamente el origen HTTPS del Worker")

    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            raise ValueError("No se permiten redirecciones al enviar credenciales; comprueba la URL del Worker")

    opener = urllib.request.build_opener(NoRedirect())

    def post(route, body, token=None):
        headers = {"Origin": "https://paanser.github.io", "Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(base + route, data=json.dumps(body).encode(), headers=headers, method="POST")
        # Default TLS verification is intentionally enabled.
        try:
            with opener.open(req, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            result = json.loads(error.read())
            raise ValueError(result.get("error", "No se pudo completar la operación")) from None

    initial = getpass.getpass("Contraseña temporal configurada en Cloudflare: ")
    password = getpass.getpass("Contraseña nueva (mínimo 8 caracteres): ")
    confirmation = getpass.getpass("Repetir contraseña nueva: ")
    if len(password) < 8 or password != confirmation or password == initial:
        raise ValueError("Revisa la contraseña nueva y su confirmación")
    session = post("/auth/login", {"usuario": "pau", "password": initial})
    changed = post("/auth/change-password", {"actual": initial, "password": password}, session["token"])
    post("/auth/logout", {}, changed["token"])
    print("Administrador activado. La contraseña temporal ya no es válida. Se ha cerrado la sesión de esta terminal.")


if __name__ == "__main__":
    try:
        main()
    except (ValueError, urllib.error.URLError, TimeoutError) as error:
        print("No se pudo activar el administrador: " + str(error), file=sys.stderr)
        sys.exit(1)
