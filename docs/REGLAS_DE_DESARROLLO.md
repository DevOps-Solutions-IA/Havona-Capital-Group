# REGLAS DE DESARROLLO — HAVONA CAPITAL

## 0. Entorno y fuente oficial

El entorno oficial de construcción durante todas las fases de desarrollo es `/mnt/d/havona`.
GitHub es la fuente oficial de control de versiones y respaldo:

```text
https://github.com/DevOps-Solutions-IA/Havona-Capital-Group
```

No considerar la ausencia de VPS, Docker local productivo, Ubuntu 24.04 productivo, DNS público o
SMTP productivo como un bloqueo de desarrollo. Esas dependencias se validan al llegar a
preproducción o producción.

Flujo obligatorio:

```text
Entorno local
→ Desarrollo
→ Pruebas
→ Corrección
→ Validación
→ Commit
→ Push a GitHub
→ GitHub Actions
→ Continuar
```

## 1. Sistema real

No se construyen demos desechables.

Cada módulo debe quedar:

- Funcional.
- Persistente.
- Seguro.
- Auditable.
- Documentado.
- Probado.
- Versionado.
- Desplegable.

## 2. Backend primero

Antes de una pantalla:

1. Definir caso de uso.
2. Diseñar datos.
3. Definir permisos.
4. Definir endpoint.
5. Definir validaciones.
6. Definir auditoría.
7. Implementar backend.
8. Implementar interfaz.
9. Probar integración.

## 3. Producción

No se permite:

- Mock data en producción.
- Credenciales hardcodeadas.
- Funciones simuladas.
- Estadísticas falsas.
- Formularios sin persistencia.
- Botones vacíos.
- Endpoints inseguros.
- Migraciones destructivas sin aprobación.

## 4. Calidad

Cada módulo debe incluir:

- Tipado estricto.
- Manejo de errores.
- Validación.
- Pruebas unitarias.
- Pruebas de integración.
- Pruebas de permisos.
- Documentación.
- Logs.
- Auditoría cuando aplique.

## 5. Seguridad

- Principio de mínimo privilegio.
- Hash Argon2id.
- Sesiones seguras.
- Rate limiting.
- CSRF cuando aplique.
- CORS restringido.
- Secretos por variables de entorno.
- Backups externos.
- Logs sin datos sensibles.

## 6. Git

Flujo:

```text
main
└── develop
    └── feature/*
```

Commits atómicos y descriptivos.

No mezclar varias fases en un commit.

Cada fase usa su propia rama `feature/fase-XX-*`. Dentro de ella, cada unidad lógica terminada debe
probarse, documentarse, confirmarse mediante un commit atómico y publicarse de inmediato. No
esperar al final de toda la fase ni acumular grandes cantidades de trabajo estable sin versionar.

Cada commit publicado debe representar una unidad coherente. Nunca hacer push de secretos, `.env`,
archivos temporales, código deliberadamente roto, experimentos descartables, datos personales
reales ni credenciales.

Después de cada push relevante, revisar en GitHub Actions:

- Lint.
- Typecheck.
- Pruebas.
- Builds.
- Migraciones y validaciones aplicables.

Si CI falla, analizar, corregir, probar, crear un commit `fix`, publicar y volver a validar antes de
continuar. No debilitar ni eliminar pruebas para obtener un resultado verde.

`main` contiene solo versiones estables y aprobadas. `develop` integra fases terminadas o preparadas
para integración. Está prohibido desarrollar directamente en ambas ramas.

## 7. Pull Requests

Cada fase mantiene un Pull Request hacia `develop` como registro vivo. Debe actualizarse con
avances, decisiones, pruebas, riesgos y pendientes, y permanecer Draft durante la construcción.

Cuando todo el alcance esté aprobado:

1. Cerrar alcance y validaciones.
2. Actualizar documentación.
3. Crear el commit release y la etiqueta correspondiente.
4. Marcar el Pull Request como Ready for Review.

## 8. Cierre de tarea

Toda tarea debe entregar:

- Código.
- Pruebas.
- Documentación.
- Commit.
- Forma de verificación.
- Riesgos.
- Pendientes.

## 9. Cierre de fase

Comando conceptual:

```text
release(fase-00): completa fundación técnica
```

Etiqueta:

```text
v0.1.0
```

No iniciar la siguiente fase sin aprobación.

El cierre durante desarrollo se evalúa con evidencia local y GitHub Actions. Las validaciones de
Ubuntu 24.04, Docker operativo en VPS, DNS, HTTPS, Caddy productivo, SMTP productivo, firewall,
backups, restauración, reinicios, persistencia, monitoreo y hardening pertenecen a
preproducción/producción y no bloquean por sí solas una fase normal de desarrollo.
