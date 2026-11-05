"""Audita patrones en Git y archivos de trabajo sin imprimir valores de credenciales."""
import pathlib
import re
import subprocess
import sys


def git(*args):
    result = subprocess.run(["git", *args], stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if result.returncode:
        raise RuntimeError("No se pudo leer Git. Ejecuta el control desde un checkout del repositorio.")
    return result.stdout


patterns = [
    rb"\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}",
    rb"\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})",
    rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
    rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b",
]
assignments = rb'''(?:OPENAI_API_KEY|ACCESS_CODE|PASSWORD_PEPPER|ADMIN_INITIAL_PASSWORD)\s*[:=]\s*["']([^"'\n]+)["']'''
fixtures = {b"fixture-not-a-key", b"fixture-access", b"fixture-only-pepper-not-a-production-secret", b"temporary-fixture"}
issues = []


def inspect(content, file, version):
    if b"\0" in content:
        return
    for pattern in patterns:
        for match in re.finditer(pattern, content):
            issues.append((file, version, content[:match.start()].count(b"\n") + 1))
    for match in re.finditer(assignments, content):
        if not (file.startswith("tests/") and match.group(1) in fixtures):
            issues.append((file, version, content[:match.start()].count(b"\n") + 1))


def main():
    blobs = 0
    for line in git("rev-list", "--objects", "--all").decode().splitlines():
        sha, separator, file = line.partition(" ")
        if not separator or git("cat-file", "-t", sha).strip() != b"blob":
            continue
        blobs += 1
        if re.search(r"(^|/)(\.env(?:\..*)?|\.dev\.vars(?:\..*)?|[^/]*\.(pem|key))$", file):
            issues.append((file, sha[:12], 1))
        inspect(git("cat-file", "-p", sha), file, sha[:12])
    for file in git("ls-files", "--cached", "--others", "--exclude-standard", "-z").decode().split("\0"):
        p = pathlib.Path(file)
        if file and p.is_file():
            inspect(p.read_bytes(), file, "workspace")
    if issues:
        for file, version, line in issues:
            print(f"Revisar {file}:{line} ({version}); valor omitido", file=sys.stderr)
        return 1
    print(f"Sin coincidencias de secretos reales en {blobs} blobs históricos ni en los archivos de trabajo. Revisión por patrones, no garantía absoluta.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except RuntimeError as error:
        print(str(error), file=sys.stderr)
        sys.exit(2)
