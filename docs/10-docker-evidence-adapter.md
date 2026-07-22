# 10 — Docker Evidence Adapter Architecture

## Socket Security Isolation
`docker-evidence-adapter` is the ONLY container with access to `/var/run/docker.sock` (mounted read-only).
Service names are strictly validated against `ALLOWED_DOCKER_SERVICES`.
Direct container ID access is forbidden to prevent container escape or unauthorized inspection.
