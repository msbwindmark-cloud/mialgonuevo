from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from .models import Registro, HistorialRegistro
from django.core.mail import EmailMessage
from django.utils import timezone
from core.views import generate_excel_buffer

# LISTA PREDEFINIDA DE TUS 33 EMAILS (Rellena aquí tus correos reales)
LISTA_DISTRIBUCION_EMAILS = [
    'assurance.sebti@gmail.com',
    'msebti2@gmail.com',
    'msb.motive@gmail.com',
    'msb.duck@gmail.com',
    'msb.coin@gmail.com',
    'msb.caixa@gmail.com',
    'vividrubys@gmail.com',
    # ... añade el resto aquí hasta los 33 correos ...
]

def obtener_datos_texto(instance):
    """Convierte los datos clave del registro en un texto fácil de leer en el admin"""
    if not instance:
        return ""
    # Evitamos fallos si el usuario por algún motivo es Null
    username_creador = instance.usuario.username if instance.usuario else "Desconocido"
    return f"Fecha: {instance.date} | Tipo: {instance.tipo} | Désignation: {instance.designation} | Montant: {instance.montant} MAD | Propietario: {username_creador}"


def enviar_excel_automatico(accion_nombre, registro_instancia, usuario_objeto):
    """
    Función auxiliar interna que reutiliza tu generador de Excel (Pandas) 
    y lo manda a los 33 destinatarios.
    """
    try:
        # Llamamos exactamente a tu lógica de Pandas para el reporte completo ('all')
        buffer = generate_excel_buffer('all')
        
        # Formateamos tiempos y nombres
        ahora_dt = timezone.localtime(timezone.now())
        fecha_archivo = ahora_dt.strftime('%Y%m%d_%H%M%S')
        fecha_humana = ahora_dt.strftime('%d/%m/%Y a las %H:%M:%S')
        username_accion = usuario_objeto.username if usuario_objeto else "Sistema"
        
        nombre_archivo = f"export_all_{fecha_archivo}.xlsx"
        
        # Estructuramos el mensaje de correo
        email = EmailMessage(
            subject=f'⚠️ Alerta de Movimiento ({accion_nombre}) - Gestión Ozaz',
            body=f'Bonjour,\n\nSe ha detectado un cambio automático en el sistema.\n\n'
                 f'• Operación: {accion_nombre}\n'
                 f'• Realizado por: {username_accion}\n'
                 f'• Fecha/Hora: {fecha_humana}\n\n'
                 f'Detalles del registro afectado:\n'
                 f'{obtener_datos_texto(registro_instancia)}\n\n'
                 f'Adjunto encontrarás la exportación completa actualizada en este instante.\n\n'
                 f'Saludos del sistema.',
            from_email='no-reply@gestionozaz.com',
            to=LISTA_DISTRIBUCION_EMAILS,
        )
        
        # Adjuntamos el binario de tu Pandas
        email.attach(nombre_archivo, buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        
        # Enviamos
        email.send()
        print(f"[Signals] Excel enviado correctamente por acción {accion_nombre}")
        
    except Exception as e:
        # Un try/except defensivo para que si falla el servidor de email, la web NO se quede colgada
        print(f"[Signals Error] No se pudo enviar el email automático: {str(e)}")
        
        

@receiver(pre_save, sender=Registro)
def auditar_modificacion_previa(sender, instance, **kwargs):
    if instance.pk:
        try:
            registro_antiguo = Registro.objects.get(pk=instance.pk)
            instance._datos_anteriores_texto = obtener_datos_texto(registro_antiguo)
        except Registro.DoesNotExist:
            instance._datos_anteriores_texto = None

@receiver(post_save, sender=Registro)
def auditar_guardado(sender, instance, created, **kwargs):
    # Buscamos el usuario ejecutor que mandamos desde la vista, o usamos el dueño como respaldo
    usuario_accion = getattr(instance, '_usuario_ejecutor', instance.usuario)
    
    if created:
        HistorialRegistro.objects.create(
            usuario=usuario_accion if hasattr(usuario_accion, 'is_authenticated') else None,
            accion='CREAR',
            registro_id=instance.pk,
            datos_anteriores="El registro no existía (Nueva inserción)",
            datos_nuevos=obtener_datos_texto(instance)
        )
        # DISPARAR ENVÍO EXCEL AUTOMÁTICO EN CREACIÓN
        enviar_excel_automatico('INSERT (NUEVA CREACIÓN)', instance, usuario_accion)
    else:
        datos_previos = getattr(instance, '_datos_anteriores_texto', "Datos no capturados")
        HistorialRegistro.objects.create(
            usuario=usuario_accion if hasattr(usuario_accion, 'is_authenticated') else None,
            accion='MODIFICAR',
            registro_id=instance.pk,
            datos_anteriores=datos_previos,
            datos_nuevos=obtener_datos_texto(instance)
        )
        # DISPARAR ENVÍO EXCEL AUTOMÁTICO EN MODIFICACIÓN
        enviar_excel_automatico('UPDATE (MODIFICACIÓN)', instance, usuario_accion)

@receiver(post_delete, sender=Registro)
def auditar_eliminacion(sender, instance, **kwargs):
    usuario_accion = getattr(instance, '_usuario_ejecutor', instance.usuario)
    
    HistorialRegistro.objects.create(
        usuario=usuario_accion if hasattr(usuario_accion, 'is_authenticated') else None,
        accion='ELIMINAR',
        registro_id=instance.pk,
        datos_anteriores=obtener_datos_texto(instance),
        datos_nuevos="REGISTRO BORRADO DEL SISTEMA"
    )
    # DISPARAR ENVÍO EXCEL AUTOMÁTICO EN ELIMINACIÓN
    enviar_excel_automatico('DELETE (ELIMINACIÓN)', instance, usuario_accion)