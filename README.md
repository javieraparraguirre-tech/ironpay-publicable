# IronPay publicable

Esta carpeta contiene una version publicable de IronPay usando:

- Sitio web estatico.
- Supabase como base de datos y login.
- Portal de socio por link con token.
- Acceso de socio desde la pantalla inicial con email o telefono.
- Links de WhatsApp.
- Transferencias informadas.
- Configuracion de dia de vencimiento mensual, por defecto dia 3.

## 1. Crear proyecto en Supabase

1. Entra a Supabase.
2. Crea un proyecto nuevo.
3. Abre SQL Editor.
4. Copia y ejecuta todo el archivo `supabase-schema.sql`.

## 2. Crear usuario administrador

1. En Supabase, ve a Authentication.
2. Crea un usuario con email y clave.
3. Luego vuelve a SQL Editor y ejecuta:

```sql
insert into profiles (id, email, full_name, role)
select id, email, 'Administrador', 'admin'
from auth.users
where email = 'TU_EMAIL_ADMIN';
```

Cambia `TU_EMAIL_ADMIN` por el correo real.

## 3. Conectar la web a Supabase

En `app.js`, reemplaza:

```js
const SUPABASE_URL = "PEGA_AQUI_TU_SUPABASE_URL";
const SUPABASE_ANON_KEY = "PEGA_AQUI_TU_SUPABASE_ANON_KEY";
```

Por los datos de Supabase:

- Project Settings > API > Project URL.
- Project Settings > API > anon public key.

## 4. Publicar en Vercel

Opcion simple:

1. Crea una cuenta en Vercel.
2. Sube esta carpeta a un repositorio GitHub.
3. Importa el proyecto en Vercel.
4. Framework preset: Other.
5. Output directory: dejar vacio.
6. Deploy.

## 5. Flujo de uso

1. Entra como administrador.
2. Crea planes.
3. Crea socios.
4. Genera mensualidades.
5. Copia link del socio, envia WhatsApp o pide al socio entrar con email/telefono.
6. El socio entra a su portal, ve deuda y paga.
7. Si transfiere, informa el pago.
8. Administracion confirma la transferencia.

En Socios puedes eliminar un socio. Esto elimina tambien su historial asociado.
En Planes puedes eliminar un plan si no tiene socios; si ya tiene socios asociados, IronPay lo desactiva para no romper el historial.

## Actualizacion: acceso Socio en pantalla inicial

Si la base ya estaba creada antes de esta mejora, ejecuta una sola vez en Supabase SQL Editor:

```text
update-socio-login.sql
```

Luego vuelve a publicar esta carpeta en Vercel para que aparezcan las pestañas Administracion / Socio en el inicio.

## 6. Pagos online reales

En IronPay, entra a:

```text
Configuracion > Pago online
```

Pega ahi tu link real de pago, por ejemplo de Mercado Pago, Flow, Khipu o Webpay.

Para confirmacion automatica de pagos, se necesita una integracion backend con el proveedor de pago. Esta version deja el portal listo y usa link de pago real, pero no confirma automaticamente.

## 7. Importante

La carpeta `ironpay` anterior era local y guardaba datos en el navegador.
Esta carpeta `ironpay-publicable` usa Supabase, por lo que los datos quedan online y son compartidos entre administracion y socios.
