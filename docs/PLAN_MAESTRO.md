# PLAN MAESTRO DE DESARROLLO — HAVONA CAPITAL GROUP

## 1. Visión

HAVONA CAPITAL GROUP será una plataforma digital de prospección, atención, calificación, agendamiento, reuniones y gestión comercial para consultores patrimoniales.

Henry AI será el núcleo inteligente del sistema.

## 2. Flujo principal

```text
Captación
→ Henry conversa
→ Henry califica
→ Henry hace seguimiento
→ Henry agenda
→ Havona Meet
→ Consultor asesora
→ Henry continúa seguimiento
→ Cierre
```

Henry no reemplaza al consultor en la recomendación final ni en el cierre contractual.

## 3. Componentes

### Sitio público

- Inicio.
- Soluciones para personas.
- Soluciones para empresarios.
- Pensión.
- Educación.
- Protección familiar.
- Acumulación de capital.
- Accidentes personales.
- Socios.
- Socio único.
- Hombre clave.
- Beneficios para empleados.
- Reclutamiento.
- Recursos.
- Contacto.
- Agenda.
- Chat con Henry.

### Landing pages

- `/pension`
- `/educacion`
- `/patrimonio`
- `/proteccion`
- `/accidentes`
- `/empresarios`
- `/socios`
- `/socio-unico`
- `/consultores`

### Henry AI

Henry podrá:

- Recibir contactos.
- Presentarse como asistente virtual.
- Identificar necesidades.
- Responder preguntas generales.
- Calificar prospectos.
- Ejecutar seguimientos autorizados.
- Agendar.
- Escalar a una persona.
- Registrar conversaciones.

Henry no podrá:

- Inventar coberturas.
- Prometer rentabilidades.
- Dar asesoría tributaria definitiva.
- Emitir pólizas.
- Solicitar información innecesaria.
- Ignorar solicitudes de no contacto.
- Presentarse como humano.

### CRM

- Prospectos.
- Clientes.
- Consultores.
- Empresas.
- Conversaciones.
- Citas.
- Oportunidades.
- Tareas.
- Documentos.
- Seguimientos.
- Consentimientos.
- Campañas.
- Indicadores.

Pipeline:

```text
Nuevo
→ Contactado
→ Conversando
→ Calificado
→ Cita agendada
→ Cita realizada
→ Propuesta
→ Seguimiento
→ Cerrado
→ Cliente
```

### Centro omnicanal

Primera etapa:

- Chat web.
- WhatsApp Business oficial.
- Correo electrónico.

Futuro:

- Instagram.
- Facebook Messenger.
- SMS.
- Telefonía.

### Havona Meet

- Jitsi autohospedado.
- Dominio propio.
- Salas privadas.
- Sala de espera.
- Moderadores.
- Chat.
- Compartir pantalla.
- Registro de asistencia.
- Integración con CRM.
- Resumen posterior con autorización.

### Agenda

- Disponibilidad.
- Agendamiento.
- Reagendamiento.
- Cancelación.
- Creación de sala.
- Confirmaciones.
- Recordatorios.
- Recuperación de inasistencias.

### Administración

- Usuarios.
- Roles.
- Productos.
- Configuración de Henry.
- Conversaciones.
- Campañas.
- Auditoría.
- Permisos.
- Consumos.
- Bloqueos.

## 4. Infraestructura inicial

Todo funcionará inicialmente en un solo VPS:

- 6 vCPU compartidas.
- 12 GB RAM.
- 100 GB NVMe o superior.
- Ubuntu 24.04.
- Docker.
- HTTPS.
- Backups externos.

Servicios:

```text
VPS
├── Web
├── API
├── Worker
├── PostgreSQL
├── Redis
├── Henry
├── CRM
├── Agenda
├── Jitsi
├── Inbox
└── Administración
```

Condiciones iniciales:

- Pocos usuarios concurrentes.
- Una o dos reuniones simultáneas.
- Video hasta 720p.
- Sin grabaciones pesadas.
- IA consumida por API.
- Backups fuera del VPS.

## 5. Resultado de la primera versión

Una persona entra a HAVONA CAPITAL GROUP, autoriza el contacto, conversa con Henry, explica su necesidad, queda registrada, recibe horarios, agenda una reunión en Havona Meet y el consultor recibe el contexto completo.
