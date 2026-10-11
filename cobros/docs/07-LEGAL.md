# 7. Legal (Chile)

> Esto es una guía para diseñar la app, **no es asesoría legal**. Antes de vender en grande, conviene que un abogado revise los textos de Términos y Privacidad.

## 7.1 Cobranza: Ley 19.496, artículo 37 (reforzado por la Ley 21.320)
Lo que dice la ley y cómo lo cumple la app:
| La ley | La app |
|---|---|
| Cobranza solo de **lunes a sábado, de 08:00 a 20:00**, sin feriados | El servidor bloquea los recordatorios fuera de ese horario (regla 3.9) |
| Por medios electrónicos, **máximo 2 gestiones por semana, separadas al menos 2 días** | Contador por cliente en el servidor |
| **Prohibido avisar a terceros** de la deuda (familia, vecinos, trabajo) | Solo se envía al teléfono del cliente. El link pide PIN para que otro no lo vea |
| Prohibido simular documentos judiciales y usar amenazas o lenguaje agresivo | Solo plantillas amables. El mensaje propio pasa por un filtro de palabras |
| Respeto a la privacidad del hogar y la dignidad | Sin llamadas automáticas, sin cobrar en público, sin "listas de morosos" |

Además, la app **no cobra intereses ni multas**. Así se evita la Ley 18.010 (tasa máxima convencional) y que la app parezca un servicio de crédito.

## 7.2 Datos personales: Ley 21.719
- Entra en vigencia el **1 de diciembre de 2026**. En septiembre de 2026 el Senado discutía postergarla un año: hay que revisar la fecha.
  Las multas pueden llegar a 20.000 UTM, así que **la app nace cumpliendo**.
- **Roles**: el **negocio** es el *responsable* de los datos de sus clientes, y **CodeFix (Josué)** es el *encargado*:
  guarda los datos por cuenta del negocio y no los usa para nada más.
- **Mínimos que la app aplica**:
  - Pedir solo lo necesario: nombre y teléfono. El RUT es opcional.
  - El negocio declara, al crear cada cliente, que **tiene su autorización** para registrarlo (casilla con texto corto la primera vez).
  - El cliente ve un aviso de privacidad en su link: quién guarda sus datos, para qué y cómo pedir que lo borren.
  - Derechos de acceso, corrección y borrado: el cliente le escribe al negocio (botón en su link). El negocio borra con "Borrar cliente" (regla 3.3).
  - Portabilidad: exportar CSV está siempre disponible.
  - Seguridad: RLS, PIN, fotos privadas, auditoría y conexión cifrada (HTTPS).
  - Plazos para guardar: las fotos de comprobantes se borran a los 90 días. Al borrar una cuenta, sus datos se eliminan a los 30 días.
  - El admin **no ve** los datos de los deudores (solo totales).
- **Servidores**: Supabase, con región en São Paulo. Se informa en la Política de Privacidad como transferencia internacional.

## 7.3 Documentos que llevará la app (`cobros/legal/`)
1. **Términos de uso**: qué es el servicio, planes y cobro mensual, prueba de 14 días, que no hay reembolso de meses ya usados,
   suspensión por abuso, que la app no es un servicio de crédito ni de cobranza judicial, responsabilidad del negocio por sus
   cobros y por usar la app dentro de la ley, propiedad de CodeFix y ley chilena.
2. **Política de privacidad**: los roles de 7.2, qué datos se guardan, para qué, por cuánto tiempo, derechos y contacto.
3. **Aviso para el cliente deudor** (corto, en su link).
4. **Uso aceptable**: prohibido usarla para préstamos con interés, cobrar a terceros o acosar.

Cada documento tiene **versión**. Si cambia, la app pide aceptar de nuevo.
