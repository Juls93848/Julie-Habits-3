# Habits - generar APK con GitHub Actions

Esta carpeta contiene la versión de Habits enviada por el usuario más la configuración de Capacitor y GitHub Actions.

1. Descomprime el ZIP de este paquete.
2. Abre en el Explorador la carpeta local de tu repositorio Habits (la que contiene `.git` y `package.json`).
3. Copia **el contenido** de este paquete sobre la carpeta del repositorio, aceptando reemplazar archivos existentes. No borres la carpeta oculta `.git`.
4. En GitHub Desktop, revisa los cambios, haz `Commit to main` y `Push origin`.
5. En github.com, entra al repositorio -> Actions -> `Compilar APK de Habits`.
6. Si el flujo no empezó automáticamente, usa `Run workflow`.
7. Cuando termine en verde, abre la ejecución y descarga el artefacto `Habits-APK-prueba`.

## Límites de esta primera versión

- El APK es de depuración, con firma temporal. No garantiza actualización sin desinstalar frente a compilaciones futuras; antes de usarlo con datos importantes, configurar firma estable.
- Esta versión viene del ZIP más reciente de Google AI Studio. Tiene avisos del navegador, pero **no incorpora todavía programación de notificaciones Android en segundo plano**. Tener instalado el plugin no activa esa función por sí solo.
- Los datos guardados en localStorage sobreviven normalmente al cierre, pero no están sincronizados entre dispositivos y pueden perderse al desinstalar o borrar datos.
- Si el repositorio contiene un proyecto `android` completo, el flujo lo sincroniza; si no existe, lo crea automáticamente.
