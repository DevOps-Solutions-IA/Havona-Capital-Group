# REGLAS DE DESARROLLO — HAVONA CAPITAL

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

## 7. Cierre de tarea

Toda tarea debe entregar:

- Código.
- Pruebas.
- Documentación.
- Commit.
- Forma de verificación.
- Riesgos.
- Pendientes.

## 8. Cierre de fase

Comando conceptual:

```text
release(fase-00): completa fundación técnica
```

Etiqueta:

```text
v0.1.0
```

No iniciar la siguiente fase sin aprobación.
