from django.db import models
from django.contrib.auth.models import User

class Registro(models.Model):
    TIPOS = [('Produit', 'Produit'), ('Charge', 'Charge')]
    
    # El usuario que crea el registro (Seguridad tipo Netflix)
    usuario = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField()
    tipo = models.CharField(max_length=10, choices=TIPOS)
    designation = models.CharField(max_length=255)
    montant = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.designation} - {self.usuario.username}"


class HistorialRegistro(models.Model):
    ACCIONES = (
        ('CREAR', 'Creación'),
        ('MODIFICAR', 'Modificación'),
        ('ELIMINAR', 'Eliminación'),
    )
    
    usuario = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Usuario Ejecutor")
    accion = models.CharField(max_length=15, choices=ACCIONES, verbose_name="Acción")
    registro_id = models.IntegerField(verbose_name="ID del Registro afectado")
    datos_anteriores = models.TextField(null=True, blank=True, verbose_name="Datos Antes del Cambio")
    datos_nuevos = models.TextField(null=True, blank=True, verbose_name="Datos Después del Cambio")
    fecha = models.DateTimeField(auto_now_add=True, verbose_name="Fecha y Hora Exacta")

    class Meta:
        verbose_name = "Historial de Auditoría"
        verbose_name_plural = "Historial de Auditoría"
        ordering = ['-fecha'] # Para que veas lo más reciente arriba del todo

    def __str__(self):
        return f"{self.accion} - Registro #{self.registro_id} por {self.usuario} ({self.fecha.strftime('%d/%m/%Y %H:%M:%S')})"
    

class MetaFinanciera(models.Model):
    mes = models.PositiveSmallIntegerField(verbose_name="Mes (1-12)")
    anio = models.PositiveIntegerField(verbose_name="Año")
    objetivo_ingresos = models.DecimalField(max_digits=12, decimal_places=2, default=100000.00, verbose_name="Objetivo Ingresos (DH)")
    limite_gastos = models.DecimalField(max_digits=12, decimal_places=2, default=50000.00, verbose_name="Límite Máximo Gastos (DH)")

    class Meta:
        verbose_name = "Meta Financiera"
        verbose_name_plural = "Metas Financieras"
        unique_together = ('mes', 'anio') # Para que no haya metas duplicadas el mismo mes

    def __str__(self):
        return f"Metas {self.mes}/{self.anio} - Ingresos: {self.objetivo_ingresos} DH | Gastos: {self.limite_gastos} DH"