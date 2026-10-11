# 1. Producto

## El problema
- En Chile, el problema número 1 de las pymes es la **falta de plata disponible** (58 %). El número 2 son los **clientes que pagan tarde** (34 %).
  En 2026, el 74 % de los dueños pone plata de su bolsillo para seguir funcionando.
- El fiado, las cuotas y los abonos se siguen anotando **en cuaderno**: se pierde, no suma bien, al dueño se le olvida
  cobrar, le da vergüenza pedir la plata y el cliente dice "yo no te debía tanto".
- En India este mismo problema lo resolvieron **Khatabook y OkCredit**, con decenas de millones de usuarios: libreta digital
  más recordatorio por WhatsApp. **En Chile y Latinoamérica no hay nada simple, en español y sin descargar app.**
  Lo que existe es para empresas grandes (Yalo) o para facturas entre empresas (Maxxa, Xepelin).

## A quién se le vende
| Rubro | Uso |
|---|---|
| Almacenes y negocios de barrio | Fiado diario a vecinos |
| Feriantes y puestos | Clientes fijos que pagan el fin de semana o a fin de mes |
| Venta por catálogo (ropa, cosméticos, Avon, Natura) | Ventas en cuotas, abonos |
| Emprendedores de Instagram | Reservas con abono y saldo pendiente |
| Servicios (gásfiter, mecánico, profe particular, peluquería) | Trabajos pagados en partes |
| Colegios, talleres, clubes deportivos | Cuotas mensuales de alumnos o socios |
| Personas | Préstamos a amigos y familia ("¿quién me debe?") |

**Frase de venta:** *"Recupera la plata que te deben. Anota en 3 segundos, cobra con un toque por WhatsApp."*

## Qué hace (resumen)
1. **Libreta**: cada cliente tiene su cuenta con el saldo y el historial, como un chat: lo que se fió y lo que pagó.
2. **Anotar rápido**: un teclado grande para el monto, botones de productos frecuentes y listo. Funciona **sin internet** y se sincroniza después.
3. **Link del cliente**: cada cliente tiene un link privado, protegido con PIN. Ahí ve cuánto debe, el detalle, las cuotas y los datos para
   transferir, y **sube el comprobante**. No necesita cuenta ni descargar nada.
4. **Cobrar por WhatsApp**: mensaje amable ya escrito, con el saldo y el link. La app respeta la **ley de cobranza**:
   horario permitido y máximo 2 recordatorios por semana.
5. **Comprobantes**: llegan al negocio, que los aprueba con un toque y el saldo se actualiza para los dos.
6. **Cuotas**: "Vendí $60.000 en 3 cuotas mensuales". La app arma el calendario y marca las cuotas atrasadas.
7. **Tablero**: cuánto me deben en total, cuánto vence hoy, quién está atrasado y cuánto recuperé este mes.
8. **Confianza**: el cliente puede **confirmar cada cargo** ("Sí, lo reconozco") o reclamarlo. Así se acaba el "yo no te debía tanto".
9. **Puntaje del cliente** (Premium): buen pagador, regular o riesgoso, según su historial. Sirve para decidir a quién fiarle.

## Lo que NO hace (a propósito, para que sea liviana)
- No es caja registradora, ni catálogo, ni tienda: eso ya está en CodeFix Apps.
- No cobra intereses ni multas (evita problemas con la ley de tasa máxima). Solo montos acordados.
- No procesa pagos con tarjeta: el pago va por transferencia directa al negocio, sin comisiones.
- No comparte datos de deudores entre negocios: cada libreta es privada.

## Roles
| Rol | Cómo entra | Qué puede hacer |
|---|---|---|
| **Superadmin** (solo Josué) | Correo y contraseña. Su correo está fijo en el servidor | Ver negocios y métricas, dar o quitar Premium, crear keys, aprobar pagos, mandar avisos, suspender cuentas. **No ve los nombres ni las deudas de los clientes de cada negocio** (privacidad), solo totales |
| **Dueño** | Crea su cuenta solo (registro abierto) | Todo en su libreta |
| **Ayudante** (Premium, hasta 3) | El dueño lo invita con un link de un solo uso | Anotar fiados y abonos, ver clientes, mandar recordatorios. **No** borra o anula lo de otros, no ve reportes ni ajustes y no pasa los límites de crédito |
| **Cliente (deudor)** | Link privado más PIN, **sin cuenta** | Ver su cuenta, confirmar o reclamar cargos, subir comprobantes, activar avisos, escribir al negocio por WhatsApp |

Hay **una libreta (negocio) por cuenta**. Más de una libreta por cuenta queda para una versión futura.

## Competencia y diferencias
| | Cuaderno | Excel / notas | Khatabook / OkCredit | **Libreta de Cobros** |
|---|---|---|---|---|
| En español para Chile, con RUT y bancos chilenos | — | — | No (India) | ✓ |
| El cliente ve su saldo sin descargar nada | — | — | Por SMS | ✓ link + PIN |
| Comprobante de transferencia dentro de la app | — | — | — | ✓ |
| Cobranza dentro de la ley chilena | — | — | — | ✓ automática |
| Cuotas con calendario | — | A mano | Parcial | ✓ |
| Funciona sin internet | ✓ | ✓ | ✓ | ✓ |
| Instalable desde Chrome, sin tienda de apps | — | — | — | ✓ |
