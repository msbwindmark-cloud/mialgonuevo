from django.contrib import admin
from .models import Registro, HistorialRegistro

@admin.register(Registro)
class RegistroAdmin(admin.ModelAdmin):
    list_display = ('date', 'tipo', 'designation', 'montant', 'usuario')
    list_filter = ('tipo', 'date', 'usuario')
    search_fields = ('designation',)
    date_hierarchy = 'date'


@admin.register(HistorialRegistro)
class HistorialRegistroAdmin(admin.ModelAdmin):
    # Columnas que verás en la tabla general del administrador
    list_display = ('fecha_formateada', 'usuario', 'accion', 'registro_id')
    list_filter = ('accion', 'usuario', 'fecha')
    search_fields = ('registro_id', 'datos_anteriores', 'datos_nuevos')
    
    # Hacemos que todos los campos sean de SÓLO LECTURA para que nadie pueda falsear el historial
    readonly_fields = ('usuario', 'accion', 'registro_id', 'datos_anteriores', 'datos_nuevos', 'fecha')

    def fecha_formateada(self, obj):
        return obj.fecha.strftime('%d/%m/%Y %H:%M:%S')
    fecha_formateada.short_description = 'Fecha y Hora (Segundos)'

    # RESTRICCIÓN DE SEGURIDAD CRÍTICA:
    # Solo los usuarios que sean Superusuarios ('is_superuser') pueden ver este modelo en el panel
    def has_module_permission(self, request):
        return request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return request.user.is_superuser

    # Nadie (ni tú mismo) puede añadir filas a mano o borrarlas para garantizar la transparencia legal del dinero
    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False