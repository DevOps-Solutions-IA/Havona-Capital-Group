# Monitoring en Fase 0

La supervisión inicial usa health checks nativos de Docker para API, PostgreSQL,
Redis, web y worker, además de logs JSON emitidos a `stdout`/`stderr`. Un colector
externo puede consumir esos logs sin acoplar la aplicación a un proveedor.

No se instala una plataforma de métricas en Fase 0. Antes de producción se debe
configurar una alerta externa sobre `https://API_DOMAIN/health/ready`, uso de disco,
memoria y resultado del backup diario.
