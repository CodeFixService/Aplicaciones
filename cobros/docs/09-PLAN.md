# 9. Plan de trabajo

## Decisiones pendientes (Josué)
| # | Decisión | Propuesta por defecto (si no dices nada, se usa esta) |
|---|---|---|
| 1 | **Nombre** de la app | "Libreta de Cobros". Otras opciones: *MeDebes*, *Fiado Pro*, *CobraFácil*, *Al Día* |
| 2 | **Precio** de Premium | $4.990 al mes · $49.900 al año. Se cambia después en Ajustes |
| 3 | **Registro** | Abierto para negocios: cualquiera crea su cuenta y entra con 14 días de Premium |
| 4 | **Límites** del plan Normal | Los de `02-PLANES.md` (20 clientes, 250 movimientos al mes, 2 cuotas, 15 comprobantes) |
| 5 | **Color** de la marca | Verde esmeralda `#059669` (dinero, "al día"), con rojo para las deudas |
| 6 | **Ubicación** | Carpeta `cobros/` en el repo `Aplicaciones`, con su propio Supabase (todo independiente) |

## Orden de construcción (una sola entrega, probada por partes)
1. **Base de datos**: `instalar.sql` completo (tablas, RLS, funciones, triggers, cron y feriados) más el script de pruebas de abuso.
2. **Base de la app**: `config`, `api`, `ui`, `validar`, estilos, manifest, `sw.js` y versión.
3. **Cuentas**: portada, crear cuenta, ingresar, recuperar contraseña, bienvenida y "Pasar mi cuaderno".
4. **Libreta**: clientes, ficha, **Anotar** (teclado y productos), anular, deshacer y la cola sin internet.
5. **Link del cliente**: PIN, ver cuenta, copiar datos bancarios, confirmar o reclamar y subir comprobante.
6. **Cobrar**: WhatsApp con las reglas legales, comprobantes y reclamos.
7. **Cuotas**.
8. **Tablero y reportes**, CSV, PDF y Excel (Premium).
9. **Planes**: prueba, límites, bajar de plan, Hazte Premium, keys y Ya pagué.
10. **Notificaciones**: Edge Function, push del negocio y del cliente, bandeja, resumen diario.
11. **Ayudantes**, apariencia y plantillas (Premium).
12. **Admin**.
13. **Legal**, ayuda y ping de GitHub.
14. Revisión final con la lista de abajo y entrega de los pasos B de `08-PREPARATIVOS.md`.

## Lista de pruebas (todas deben pasar antes de entregar)
**Reglas y seguridad**
- [ ] Un negocio no puede ver ni tocar nada de otro, ni siquiera llamando a la API a mano.
- [ ] El ayudante no puede anular lo de otro ni lo suyo pasados los 10 minutos, ni pasar el límite de crédito, ni ver reportes.
- [ ] El admin no puede leer clientes ni movimientos.
- [ ] El link sin PIN no muestra nada. Con 5 PIN malos se bloquea. Un link revocado no sirve.
- [ ] Con 20 clientes en Normal, el número 21 se rechaza en el servidor. Archivar uno libera el cupo.
- [ ] El movimiento 251 del mes se rechaza (fiado), pero los abonos **siempre** pasan.
- [ ] Un abono mayor que el saldo se rechaza (sin saldo a favor).
- [ ] El mismo id de movimiento enviado 2 veces queda una sola vez.
- [ ] Recordatorio el domingo, en feriado, a las 21:00 o el tercero de la semana: rechazado con la fecha permitida.
- [ ] Palabras prohibidas en el mensaje propio: rechazado.
- [ ] Una foto de más de 1 MB o que no es imagen: rechazada.
- [ ] RUT mal escrito y teléfono inválido: rechazados con un mensaje claro.

**Cálculos**
- [ ] $100.000 en 3 cuotas = 33.333 + 33.333 + 33.334.
- [ ] Una cuota mensual que parte el 31 cae el 28 o 29 de febrero.
- [ ] Los abonos se aplican a la cuota más antigua. Una anulación vuelve a calcular todo.
- [ ] El saldo del trigger es igual al recálculo semanal.

**Planes**
- [ ] Una cuenta nueva parte con 14 días de Premium. Al vencer, pasa a Normal y los clientes sobre el cupo quedan en solo cobro.
- [ ] La gracia de 3 días funciona. Una key de 1 mes suma 30 días. La prueba no se repite.

**Experiencia**
- [ ] Anotar un fiado de cliente reciente en 3 toques o menos.
- [ ] Sin internet: anotar 3 movimientos, volver la conexión y que se sincronicen sin duplicarse.
- [ ] Se instala desde Chrome (computador y Android) y desde Safari (iPhone).
- [ ] Se ve bien en 360, 768 y 1280 px, en modo claro y oscuro.
- [ ] El push llega con la app cerrada (Android y iPhone instalado).

## Ideas para versiones futuras (no van ahora)
- Varias libretas por cuenta (por ejemplo, almacén y venta por catálogo).
- "Me deben / Yo debo": también anotar lo que el negocio le debe a sus proveedores.
- Pago con link de Mercado Pago o Khipu por cliente (con comisión).
- Envío automático por la API de WhatsApp Business (es de pago).
- Módulo "Turno Ya" (fila virtual con QR), como producto aparte.
