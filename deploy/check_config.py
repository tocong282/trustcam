"""Stdlib-only template guard. No imports of backend; no DB/secrets/network.
Not a Caddy parser, service runtime test, or perimeter security audit.
"""
from pathlib import Path

root = Path(__file__).resolve().parent
service = (root / "trustcam-demo.service").read_text()
proxy = (root / "Caddyfile.example").read_text()
env = (root / "demo.env.example").read_text()
for setting in (
    "User=trustcam", "Group=trustcam", "UMask=0077", "StateDirectoryMode=0700",
    "EnvironmentFile=/etc/trustcam/demo.env", "--host 127.0.0.1", "--workers 1",
    "--forwarded-allow-ips=127.0.0.1", "ProtectSystem=strict",
    "ReadWritePaths=/var/lib/trustcam", "--no-access-log",
):
    assert setting in service, setting
for setting in (
    "auto_https disable_redirects", "bind 192.0.2.2",
    "@wrongHost not host demo.example.invalid",
    "@outside not remote_ip 192.0.2.10/32",
    "respond @outside", "max_size 10551296", "read_body 30s",
    "reverse_proxy 127.0.0.1:8000", "header_up Host demo.example.invalid",
    'header Cache-Control "no-store"',
):
    assert setting in proxy, setting
assert 10551296 == 10 * 1024 * 1024 + 64 * 1024
assert proxy.index("respond @outside") < proxy.index("reverse_proxy")
assert "basic_auth" not in proxy  # Authorization must retain mobile Bearer token.
assert "TRUSTCAM_DATA_DIR=/var/lib/trustcam" in env
assert not any(line.startswith("TRUSTCAM_DASHBOARD_ALLOW_HTTP=") for line in env.splitlines())
assert not any(line.startswith("VLM_") for line in env.splitlines())
print("PASS: demo template guards; no services, secrets, network or DB touched")
