# CONFIGURACIÓN INICIAL DEL REPOSITORIO

## 1. Crear repositorio

Crea en GitHub un repositorio privado llamado:

```text
havona-capital
```

## 2. Clonar

```bash
git clone https://github.com/TU_USUARIO/havona-capital.git
cd havona-capital
```

## 3. Crear estructura documental

```bash
mkdir -p docs
```

Copia los archivos incluidos en este paquete en la raíz y en `docs/`.

## 4. Crear ramas

```bash
git checkout -b develop
git push -u origin develop

git checkout -b docs/fundacion-proyecto
```

## 5. Agregar documentación

```bash
git add AGENTS.md docs README.md
git commit -m "docs(project): define arquitectura, fases y reglas maestras"
git push -u origin docs/fundacion-proyecto
```

## 6. Integrar en develop

Crea un Pull Request:

```text
docs/fundacion-proyecto → develop
```

Revisa y fusiona.

## 7. Proteger ramas

En GitHub:

- Protege `main`.
- Protege `develop`.
- Exige Pull Request.
- Exige checks.
- Impide force push.
- Impide eliminación.
- Exige resolución de conversaciones.

## 8. Iniciar Fase 0

```bash
git checkout develop
git pull
git checkout -b feature/fase-00-fundacion
```

Entrega al agente el contenido de:

```text
docs/PROMPT_FASE_0.md
```
