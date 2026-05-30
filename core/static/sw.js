const CACHE_NAME = 'ozaz-v16';
const STATIC_ASSETS = [
    '/static/favicon.png',
    '/static/voice_offline.js',
    '/manifest.json',
    'https://cdnjs.cloudflare.com/ajax/libs/bootswatch/5.3.3/zephyr/bootstrap.min.css',
    'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
    'https://cdn.datatables.net/2.0.7/css/dataTables.bootstrap5.min.css',
    'https://cdn.jsdelivr.net/npm/sweetalert2@11',
    'https://code.jquery.com/jquery-3.7.1.min.js',
    'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
    'https://cdn.datatables.net/2.0.7/js/dataTables.min.js',
    'https://cdn.datatables.net/2.0.7/js/dataTables.bootstrap5.min.js'
];

// Página de Login Offline completa embebida en el SW
const OFFLINE_LOGIN_HTML = `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Login Offline - Gestión Ozaz</title>
    <link rel="icon" type="image/png" href="/static/favicon.png">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/bootswatch/5.3.3/zephyr/bootstrap.min.css">
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css">
    <style>
        body { background-color: #f8f9fa; height: 100vh; display: flex; align-items: center; justify-content: center; }
        .login-card { max-width: 400px; width: 100%; border-radius: 15px; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
    </style>
</head>
<body>
<div class="card login-card border-0">
    <div class="card-body p-5">
        <h3 class="text-center mb-4 text-primary fw-bold">Gestión Ozaz</h3>
        <div class="alert alert-warning text-center small">
            <i class="bi bi-wifi-off"></i> Modo Offline — Login local con IndexedDB
        </div>
        <div id="error-msg" class="alert alert-danger d-none"></div>

        <form id="offline-login-form">
            <div class="form-floating mb-3">
                <input type="text" class="form-control" id="floatingInput" placeholder="Usuario" required autofocus>
                <label for="floatingInput">Nombre de usuario</label>
            </div>
            <div class="form-floating mb-4 position-relative">
                <input type="password" class="form-control pe-5" id="floatingPassword" placeholder="Contraseña" required>
                <label for="floatingPassword">Contraseña</label>
                <button type="button" id="togglePassword" class="btn border-0 position-absolute end-0 top-50 translate-middle-y me-2 z-3 text-muted" style="background:none;">
                    <i class="bi bi-eye-fill fs-5" id="eyeIcon"></i>
                </button>
            </div>
            <button class="btn btn-primary w-100 py-2 mb-3 rounded-pill" type="submit" id="btn-login">Entrar al Sistema (Offline)</button>
        </form>
    </div>
</div>

<script src="/static/voice_offline.js"></script>
<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
<script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
<script>
    document.addEventListener('DOMContentLoaded', function() {
        const togglePassword = document.querySelector('#togglePassword');
        const passwordInput = document.querySelector('#floatingPassword');
        const eyeIcon = document.querySelector('#eyeIcon');

        if (togglePassword) {
            togglePassword.addEventListener('click', function() {
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                eyeIcon.classList.toggle('bi-eye-fill');
                eyeIcon.classList.toggle('bi-eye-slash-fill');
            });
        }

        document.getElementById('offline-login-form').addEventListener('submit', async function(e) {
            e.preventDefault();
            const username = document.getElementById('floatingInput').value;
            const password = document.getElementById('floatingPassword').value;
            const errorDiv = document.getElementById('error-msg');

            const isValid = await checkOfflineLogin(username, password);
            if (isValid) {
                if (typeof Swal !== 'undefined') {
                    Swal.fire({
                        icon: 'success',
                        title: 'Modo Offline',
                        text: 'Login local exitoso. Redirigiendo...',
                        timer: 2000,
                        showConfirmButton: false
                    }).then(() => { window.location.href = '/'; });
                } else {
                    window.location.href = '/';
                }
            } else {
                errorDiv.classList.remove('d-none');
                errorDiv.textContent = 'Credenciales offline no encontradas. Debes haberte logueado online al menos una vez.';
            }
        });
    });
</script>
</body>
</html>`;

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    const url = new URL(event.request.url);

    // Páginas HTML (navegación): NETWORK-FIRST
    if (event.request.mode === 'navigate') {

        // CASO ESPECIAL: /logout/ offline → redirigir a /login/
        if (url.pathname.includes('/logout')) {
            event.respondWith(
                fetch(event.request).catch(() => {
                    return Response.redirect('/login/', 302);
                })
            );
            return;
        }

        // CASO ESPECIAL: /login/ offline → servir login embebido
        if (url.pathname.includes('/login')) {
            event.respondWith(
                fetch(event.request)
                    .then((response) => {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                        return response;
                    })
                    .catch(() => {
                        return new Response(OFFLINE_LOGIN_HTML, {
                            headers: { 'Content-Type': 'text/html; charset=utf-8' }
                        });
                    })
            );
            return;
        }

        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(event.request);
                    if (cached) return cached;
                    const root = await caches.match('/');
                    if (root) return root;
                    return new Response(OFFLINE_LOGIN_HTML, {
                        headers: { 'Content-Type': 'text/html; charset=utf-8' }
                    });
                })
        );
        return;
    }

    // Assets estáticos (JS, CSS, imágenes): CACHE-FIRST
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request).then((networkResponse) => {
                return networkResponse;
            }).catch(() => {
                // Sin red ni caché: retornar un 404 sintético para evitar el TypeError
                return new Response('Offline Asset Not Found', { status: 404 });
            });
        })
    );
});
