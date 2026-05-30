from django.urls import path
from django.contrib.auth import views as auth_views
from . import views

urlpatterns = [
    path('', views.dashboard, name='dashboard'),
    path('usuario/<str:username>/', views.dashboard, name='user_dashboard'),
    path('registro/', views.registro, name='registro'), # <-- NUEVA RUTA DE REGISTRO
    path('guardar-ajax/', views.guardar_ajax, name='guardar_ajax'),
    path('editar-ajax/<int:id>/', views.editar_ajax, name='editar_ajax'),
    path('eliminar-ajax/<int:id>/', views.eliminar_ajax, name='eliminar_ajax'),
    path('carga-masiva/', views.carga_masiva_excel, name='carga_masiva_excel'),
    path('exportar-excel/', views.exportar_excel, name='exportar_excel'),
    path('enviar-email-excel/', views.enviar_email_excel, name='enviar_email_excel'),
    path('login/', auth_views.LoginView.as_view(template_name='login.html'), name='login'),
    path('logout/', auth_views.LogoutView.as_view(next_page='login'), name='logout'),
    path('sw.js', views.ServiceWorkerView.as_view(), name='service_worker'),
    path('manifest.json', views.ManifestView.as_view(), name='manifest'),
]
