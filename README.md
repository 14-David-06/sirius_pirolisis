# Sirius Pirólisis

Proyecto web para Sirius Pirólisis - Innovación en el tratamiento de residuos a través de tecnología de pirólisis avanzada.

## 🚀 Tecnologías Utilizadas

- **Next.js 15** - Framework React para producción
- **TypeScript** - Tipado estático para JavaScript
- **Tailwind CSS** - Framework de CSS utilitario
- **Museo Slab** - Fuente principal del proyecto
- **React** - Biblioteca de JavaScript para interfaces de usuario

## 📁 Estructura del Proyecto

```
sirius_pirolisis/
├── src/
│   └── app/
│       ├── globals.css      # Estilos globales
│       ├── layout.tsx       # Layout principal con fuente Museo Slab
│       └── page.tsx         # Landing page principal
├── public/                  # Archivos estáticos
├── .env.local              # Variables de entorno (ignorado por git)
├── tailwind.config.ts      # Configuración de Tailwind CSS
└── README.md               # Este archivo
```

## 🛠️ Instalación y Desarrollo

### Prerrequisitos
- Node.js 18+ 
- npm, yarn, pnpm o bun

### Pasos para desarrollo local

1. Clona el repositorio:
```bash
git clone <url-del-repositorio>
cd sirius_pirolisis
```

2. Instala las dependencias:
```bash
npm install
# o
yarn install
# o
pnpm install
```

3. **Configura las variables de entorno:**
```bash
# Copia el archivo de ejemplo
cp .env.example .env.local

# Edita .env.local con tus valores reales de Airtable
# NUNCA subas este archivo a Git
```

4. Inicia el servidor de desarrollo:
```bash
npm run dev
# o
yarn dev
# o
pnpm dev
```

5. Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## 🎨 Características del Diseño

- **Fuente Museo Slab**: Tipografía principal configurada via Google Fonts
- **Diseño Responsive**: Optimizado para dispositivos móviles y desktop
- **Tailwind CSS**: Estilos utilitarios para desarrollo rápido
- **Gradientes**: Fondos con gradientes suaves
- **Componentes Modulares**: Estructura limpia y reutilizable

## 📝 Scripts Disponibles

```bash
npm run dev          # Servidor de desarrollo
npm run build        # Construir para producción
npm run start        # Servidor de producción
npm run lint         # Ejecutar ESLint
```

## 🌍 Variables de Entorno

Las variables de entorno se configuran en `.env.local`:

```env
# Variables públicas (expuestas al cliente)
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_API_URL=https://api.ejemplo.com

# Variables privadas (solo servidor)
DATABASE_URL=
SECRET_KEY=
```

## 📜 Aviso Legal y Copyright | Legal Notice and Copyright

### 🔒 Español

© 2025 PiroliApp™ - Sirius Regenerative Solutions S.A.S ZOMAC. Todos los derechos reservados.

PiroliApp™ y todos sus componentes asociados, incluyendo pero no limitado a: código fuente, diseño, interfaces, funcionalidades, documentación y elementos gráficos, son propiedad exclusiva de Sirius Regenerative Solutions S.A.S ZOMAC, protegidos por las leyes de propiedad intelectual de Colombia y tratados internacionales de derechos de autor, incluyendo la Convención de Berna y los tratados de la OMPI.

AVISO DE USO RESTRINGIDO:
- Queda estrictamente prohibida cualquier forma de uso, reproducción, modificación, distribución o comercialización no autorizada expresamente por escrito.
- El software se proporciona "tal cual", sin garantías de ningún tipo, expresas o implícitas.
- Sirius Regenerative Solutions S.A.S ZOMAC no será responsable por daños derivados del uso o imposibilidad de uso del software.
- El uso no autorizado constituirá una violación de derechos de autor y podrá resultar en acciones legales.

### 🔒 English

© 2025 PiroliApp™ - Sirius Regenerative Solutions S.A.S ZOMAC. All rights reserved.

PiroliApp™ and all its associated components, including but not limited to: source code, design, interfaces, functionalities, documentation, and graphical elements, are the exclusive property of Sirius Regenerative Solutions S.A.S ZOMAC, protected by Colombian intellectual property laws and international copyright treaties, including the Berne Convention and WIPO treaties.

RESTRICTED USE NOTICE:
- Any form of use, reproduction, modification, distribution, or commercialization without express written authorization is strictly prohibited.
- The software is provided "as is" without warranties of any kind, either express or implied.
- Sirius Regenerative Solutions S.A.S ZOMAC shall not be liable for any damages arising from the use or inability to use the software.
- Unauthorized use will constitute copyright infringement and may result in legal action.

---
Desarrollado y mantenido por | Developed and maintained by
Sirius Regenerative Solutions S.A.S ZOMAC
Medellín, Colombia

## 🚀 Despliegue

### Vercel (Recomendado)
1. Conecta tu repositorio a [Vercel](https://vercel.com)
2. Configura las variables de entorno en el dashboard
3. Deploya automáticamente con cada push

### Otras plataformas
- Netlify
- Railway
- Heroku
- AWS Amplify

## 📄 Licencia

Este proyecto es privado y pertenece a Sirius Pirólisis.

## 👥 Contribución

Para contribuir al proyecto:
1. Crea una rama feature
2. Realiza tus cambios
3. Ejecuta los tests y linting
4. Crea un Pull Request

---

Desarrollado con ❤️ para Sirius Pirólisis
