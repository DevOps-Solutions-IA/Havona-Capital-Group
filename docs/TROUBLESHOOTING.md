# Troubleshooting — Fase 0

## Un contenedor no queda saludable

```bash
docker compose --profile prod ps
docker compose --profile prod logs --tail=200 <servicio>
docker inspect --format '{{json .State.Health}}' havona-capital-<servicio>-1
```

`api` depende de PostgreSQL y Redis saludables; `web` y Caddy dependen de API. No
quite health checks para forzar el arranque.

## PostgreSQL rechaza conexiones

Compruebe `POSTGRES_*`, la codificación URL de la contraseña y que el volumen se
creó con el mismo usuario/base. Cambiar variables no reinicializa un volumen ya
existente. No borre el volumen: diagnostique y restaure de backup si corresponde.

## Redis devuelve NOAUTH

`REDIS_PASSWORD` debe ser idéntico en Redis, API y worker. Después de corregir `.env`:

```bash
docker compose --profile prod up -d --force-recreate redis api worker
```

## Caddy no obtiene certificado

Verifique DNS público, puertos 80/443, `ACME_EMAIL` y ausencia de otro proceso en
esos puertos. Consulte `docker compose logs proxy`; no desactive TLS como solución.

## Migración fallida

Detenga el despliegue y capture el error. No edite una migración aplicada ni marque
manualmente su estado sin revisar la base. Restaure el último backup validado si hubo
cambios parciales y escale la corrección como una migración nueva.

## Worker reinicia

Revise eventos JSON `worker.error`, conectividad Redis y tipos de trabajo. En Fase 0
solo se acepta `system.ping`; un nombre distinto falla deliberadamente y BullMQ
aplica la política de reintentos definida al encolar.

## Disco lleno

Revise uso de volúmenes, logs del runtime y backups. No elimine volúmenes de datos.
Transfiera backups verificados al destino externo y aplique rotación de logs del
host. Si el problema persiste tras tres intentos controlados, detenga cambios y
documente impacto y opciones.
