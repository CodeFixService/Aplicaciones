# Libreta de Cobros (nombre provisorio)

> Fiado, ventas en cuotas y abonos, en el celular. El negocio anota en 3 segundos, el cliente ve
> su cuenta con un link (sin descargar nada) y paga por transferencia. **"Recupera la plata que te deben."**

**Estado:** especificación lista, **sin código todavía**. Todo se programa de una a partir de estos documentos.

App **100 % independiente** de CodeFix Apps:
- su propia carpeta `cobros/` con todos sus archivos, sin usar nada de `shared/` ni de `apps/`;
- su propio proyecto Supabase (el segundo gratis de tu cuenta), con su propia base de datos;
- su propio instalador, ícono, versión y notificaciones.

Si después quieres moverla a otro repo o a su propio dominio, basta con copiar la carpeta.

## Documentos (leer en orden)
| # | Documento | Qué contiene |
|---|---|---|
| 1 | [Producto](docs/01-PRODUCTO.md) | El problema, a quién se le vende, la competencia, todas las funciones y los roles |
| 2 | [Planes Normal / Premium](docs/02-PLANES.md) | Límites exactos, prueba gratis, cobro mensual, qué pasa al vencer |
| 3 | [Reglas y validaciones](docs/03-REGLAS.md) | Cada campo, cada regla de negocio, la seguridad y los límites anti-abuso |
| 4 | [Pantallas](docs/04-PANTALLAS.md) | Cada pantalla del negocio, del cliente y del administrador, y los textos de WhatsApp |
| 5 | [Base de datos](docs/05-DATOS.md) | Tablas, permisos, funciones del servidor y tareas automáticas |
| 6 | [Técnico](docs/06-TECNICO.md) | Arquitectura, archivos, modo sin internet, notificaciones y separación de CodeFix |
| 7 | [Legal](docs/07-LEGAL.md) | Cobranza legal (Ley 19.496), datos personales (Ley 21.719) y textos legales |
| 8 | [Preparativos](docs/08-PREPARATIVOS.md) | Tu paso a paso: qué crear, dónde pegar, qué chequear |
| 9 | [Plan de trabajo](docs/09-PLAN.md) | Orden de construcción, lista de pruebas y **decisiones pendientes** |

© CodeFix · Josué Castillo.
