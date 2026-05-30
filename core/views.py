from django.shortcuts import render, redirect, get_object_or_404
from django.contrib.auth.decorators import login_required
from django.http import JsonResponse, HttpResponse
from .models import Registro, MetaFinanciera
import pandas as pd # Para el Excel masivo
import io
from django.core.mail import EmailMessage
from django.utils import timezone
from django.db.models import Sum, Count, Q
from django.contrib.auth.models import User
import json
from django.contrib.auth.forms import UserCreationForm
from datetime import datetime
import openpyxl
from openpyxl.styles import Font, PatternFill
from django.db.models import Sum
from django.views.generic import TemplateView

class ServiceWorkerView(TemplateView):
    template_name = 'sw.js'
    content_type = 'application/javascript'

class ManifestView(TemplateView):
    template_name = 'manifest.json'
    content_type = 'application/json'

@login_required
def dashboard(request, username=None): # <-- Ahora acepta el parámetro opcional
    # Saber si estamos viendo a un usuario específico o el global
    target_user = None
    if username:
        target_user = get_object_or_404(User, username=username)

    # Filtrar registros base para los cálculos de las tarjetas y tabla principal
    if target_user:
        base_registros = Registro.objects.filter(usuario=target_user)
    else:
        base_registros = Registro.objects.all()
    
    # --- NUEVA LÓGICA: FILTRO POR RANGO DE FECHAS ---
    fecha_desde = request.GET.get('fecha_desde')
    fecha_hasta = request.GET.get('fecha_hasta')

    if fecha_desde:
        base_registros = base_registros.filter(date__gte=fecha_desde)
    if fecha_hasta:
        base_registros = base_registros.filter(date__lte=fecha_hasta)
    # ------------------------------------------------
    
    
    # --- NUEVA LÓGICA: SISTEMA DE NOTIFICACIONES EN VIVO ---
    alertas_criticas = []
    
    # 1. Alerta de Gastos Altos: Buscamos si hay algún gasto mayor a 10000 DH
    gastos_altos = base_registros.filter(tipo='Charge', montant__gte=10000.00).order_by('-date')[:3]
    for gasto in gastos_altos:
        alertas_criticas.append({
            'tipo': 'danger',
            'icono': 'bi-exclamation-octagon-fill',
            'mensaje': f"Gasto elevado detectado: El usuario <strong>{gasto.usuario.username}</strong> registró un cargo de <strong>{gasto.montant} DH</strong> en '{gasto.designation}' el {gasto.date.strftime('%d/%m/%Y')}."
        })
    
    # 2. Alerta de Cargas Masivas: Revisamos si hubo movimientos creados hoy
    hoy = datetime.now().date()
    hubo_actividad_hoy = base_registros.filter(date=hoy).exists()
    if hubo_actividad_hoy:
        alertas_criticas.append({
            'tipo': 'info',
            'icono': 'bi-cloud-arrow-up-fill',
            'mensaje': "Actividad reciente: Se han detectado nuevas inserciones de datos en el día de hoy. Revisa las últimas inserciones en el panel lateral."
        })
    # -------------------------------------------------------
    
    
    # Totales Históricos
    total_produits = base_registros.filter(tipo='Produit').aggregate(Sum('montant'))['montant__sum'] or 0
    total_charges = base_registros.filter(tipo='Charge').aggregate(Sum('montant'))['montant__sum'] or 0
    resultat_net = total_produits - total_charges
    total_utilisateurs = Registro.objects.values('usuario').distinct().count()

    # --- NUEVA LÓGICA DE METAS MENSUALES ---
    ahora_dt = datetime.now()
    mes_actual = ahora_dt.month
    anio_actual = ahora_dt.year

    # Totales específicos SOLO del mes en curso para evaluar los objetivos reales
    produits_mes = base_registros.filter(tipo='Produit', date__month=mes_actual, date__year=anio_actual).aggregate(Sum('montant'))['montant__sum'] or 0
    charges_mes = base_registros.filter(tipo='Charge', date__month=mes_actual, date__year=anio_actual).aggregate(Sum('montant'))['montant__sum'] or 0

    # Buscamos la meta configurada en el panel de control, si no hay, creamos una por defecto
    meta, _ = MetaFinanciera.objects.get_or_create(
        mes=mes_actual, 
        anio=anio_actual,
        defaults={'objetivo_ingresos': 100000.00, 'limite_gastos': 50000.00}
    )

    # Calculamos porcentajes cuidando de no dividir entre cero
    porcentaje_ingresos = min(int((float(produits_mes) / float(meta.objetivo_ingresos)) * 100), 100) if meta.objetivo_ingresos > 0 else 0
    porcentaje_gastos = min(int((float(charges_mes) / float(meta.limite_gastos)) * 100), 100) if meta.limite_gastos > 0 else 0

    # Determinamos los colores de alerta según las reglas financieras
    color_barra_ingresos = "bg-danger" if porcentaje_ingresos < 40 else "bg-warning" if porcentaje_ingresos < 80 else "bg-success"
    color_barra_gastos = "bg-success" if porcentaje_gastos < 60 else "bg-warning" if porcentaje_gastos < 90 else "bg-danger"
    # ----------------------------------------

    # Chart data (Sigue mostrando el global para comparar histórico si quieres)
    registros_all = Registro.objects.all().order_by('date')
    chart_dates = []
    chart_produits = []
    chart_charges = []
    
    from collections import defaultdict
    daily_data = defaultdict(lambda: {'produits': 0, 'charges': 0})
    for r in registros_all:
        if r.date:
            d = r.date.strftime('%d %b')
            if r.tipo == 'Produit':
                daily_data[d]['produits'] += float(r.montant)
            else:
                daily_data[d]['charges'] += float(r.montant)

    for d, vals in daily_data.items():
        chart_dates.append(d)
        chart_produits.append(vals['produits'])
        chart_charges.append(vals['charges'])

    # User stats para el panel lateral izquierdo
    users = User.objects.annotate(
        total_saisies=Count('registro'),
        produits=Sum('registro__montant', filter=Q(registro__tipo='Produit')),
        charges=Sum('registro__montant', filter=Q(registro__tipo='Charge'))
    ).exclude(is_superuser=True)
    
    user_stats = []
    for u in users:
        p = u.produits or 0
        c = u.charges or 0
        net = p - c
        user_stats.append({
            'username': u.username, # <-- Guardamos el username para la URL del enlace
            'email': u.email or u.username,
            'saisies': u.total_saisies,
            'net': net
        })
    user_stats.sort(key=lambda x: x['net'], reverse=True)

    # Últimas Saisies (Siempre globales o del usuario)
    if target_user:
        dernieres_saisies = Registro.objects.filter(usuario=target_user).order_by('-id')[:5]
    else:
        dernieres_saisies = Registro.objects.all().order_by('-id')[:5]

    # Traemos los registros ordenados para la tabla Datatable
    registros = base_registros.order_by('-date')

    context = {
        'total_produits': total_produits,
        'total_charges': total_charges,
        'resultat_net': resultat_net,
        'total_utilisateurs': total_utilisateurs,
        'chart_dates': json.dumps(chart_dates),
        'chart_produits': json.dumps(chart_produits),
        'chart_charges': json.dumps(chart_charges),
        'user_stats': user_stats,
        'dernieres_saisies': dernieres_saisies,
        'registros': registros,
        'target_user': target_user, # <-- CLAVE: Le dice al HTML a quién estamos viendo
        # AÑADIMOS LAS ALERTAS AL CONTEXTO
        'alertas_criticas': alertas_criticas,
        
        # PASAMOS LAS METAS AL HTML
        'meta': meta,
        'produits_mes': produits_mes,
        'charges_mes': charges_mes,
        'porcentaje_ingresos': porcentaje_ingresos,
        'porcentaje_gastos': porcentaje_gastos,
        'color_barra_ingresos': color_barra_ingresos,
        'color_barra_gastos': color_barra_gastos,
        'exceso_gastos': charges_mes > meta.limite_gastos
    }

    return render(request, 'index.html', context)


@login_required
def guardar_ajax(request):
    if request.method == 'POST':
        # Guardamos vinculando al usuario logueado automáticamente
        Registro.objects.create(
            usuario=request.user,
            date=request.POST.get('date'),
            tipo=request.POST.get('tipo'),
            designation=request.POST.get('designation'),
            montant=request.POST.get('montant')
        )
        return JsonResponse({'status': 'ok'})

@login_required
def editar_ajax(request, id):
    if request.method == 'POST':
        # Si es superusuario puede editar cualquier registro, si no, solo los suyos
        if request.user.is_superuser:
            registro = get_object_or_404(Registro, id=id)
        else:
            registro = get_object_or_404(Registro, id=id, usuario=request.user)
            
        registro.date = request.POST.get('date')
        registro.tipo = request.POST.get('tipo')
        registro.designation = request.POST.get('designation')
        registro.montant = request.POST.get('montant')
        
        # Guardamos temporalmente el usuario que hace la acción para que la señal lo lea de forma infalible
        registro._usuario_ejecutor = request.user
        
        registro.save()
        return JsonResponse({'status': 'ok'})

@login_required
def eliminar_ajax(request, id):
    if request.method == 'POST':
        # Si es superusuario, puede buscar cualquier registro. Si no, sólo los suyos.
        if request.user.is_superuser:
            registro = get_object_or_404(Registro, id=id)
        else:
            registro = get_object_or_404(Registro, id=id, usuario=request.user)
            
        registro.delete()
        return JsonResponse({'status': 'ok'})

from django.contrib import messages

@login_required
def carga_masiva_excel(request):
    if request.method == 'POST' and request.FILES.get('archivo_excel'):
        try:
            df = pd.read_excel(request.FILES['archivo_excel'])
            
            # Limpiar espacios en los nombres de las columnas
            df.columns = df.columns.str.strip()
            
            # Columnas esperadas según tu Excel
            col_date = 'Date'
            col_type = 'Type (Produit ou Charge)'
            col_desc = 'Désignation'
            col_montant = 'Montant (MAD)'
            
            for _, row in df.iterrows():
                # Procesar el monto (por si viene con "DH" como texto o tiene comas)
                val_monto = str(row[col_montant]).replace(' DH', '').replace(' dh', '').replace('MAD', '').strip()
                val_monto = val_monto.replace(' ', '').replace('\xa0', '') # quitar espacios
                
                # Si viene en formato europeo (ej: 3.920,00)
                if '.' in val_monto and ',' in val_monto:
                    val_monto = val_monto.replace('.', '').replace(',', '.')
                elif ',' in val_monto:
                    val_monto = val_monto.replace(',', '.')
                
                try:
                    monto_final = float(val_monto)
                except ValueError:
                    monto_final = 0.0

                # Procesar el tipo por si hay espacios
                val_tipo = str(row[col_type]).strip()
                if val_tipo not in ['Produit', 'Charge']:
                    val_tipo = 'Produit' # Por defecto si algo está mal escrito
                    
                Registro.objects.create(
                    usuario=request.user,
                    date=pd.to_datetime(row[col_date]).date() if pd.notnull(row[col_date]) else None,
                    tipo=val_tipo,
                    designation=str(row[col_desc]).strip(),
                    montant=monto_final
                )
            messages.success(request, 'Archivo Excel cargado exitosamente.')
        except KeyError as e:
            column_name = str(e).replace("'", "")
            messages.error(request, f"El Excel no tiene el formato correcto. Falta la columna exacta: '{column_name}'. Las columnas en tu Excel deben llamarse: Date, Type (Produit ou Charge), Désignation, Montant (MAD)")
        except Exception as e:
            messages.error(request, f"Error al procesar el archivo: {str(e)}")
            
        return redirect('dashboard')

def generate_excel_buffer(usuario_filter):
    # MANDAMOS TU CONSULTA EXACTA (Sin tocarle una sola coma)
    if usuario_filter and usuario_filter != 'all':
        registros = Registro.objects.filter(Q(usuario__email=usuario_filter) | Q(usuario__username=usuario_filter)).order_by('-date')
    else:
        registros = Registro.objects.all().order_by('-date')
        
    data = []
    total_produits = 0
    total_charges = 0

    # Recorremos tus registros, guardamos los datos y sumamos los totales para el balance
    for r in registros:
        monto_float = float(r.montant)
        
        # Aprovechamos el bucle para ir sumando según el tipo
        if r.tipo == 'Produit':
            total_produits += monto_float
        else:
            total_charges += monto_float

        data.append({
            'Date': r.date.strftime('%d/%m/%Y') if r.date else '', # Formato limpio de fecha
            'Type (Produit ou Charge)': r.tipo,
            'Désignation': r.designation,
            'Montant (MAD)': monto_float,
            'Utilisateur': r.usuario.email or r.usuario.username
        })
        
    # === NUEVO: AÑADIMOS LAS FILAS DEL BALANCE AL FINAL DEL EXCEL ===
    resultat_net = total_produits - total_charges

    # Dejamos una fila vacía por estética
    data.append({'Date': '', 'Type (Produit ou Charge)': '', 'Désignation': '', 'Montant (MAD)': '', 'Utilisateur': ''})
    
    # Añadimos las tres líneas de totales respetando tus columnas de Pandas
    data.append({'Date': '', 'Type (Produit ou Charge)': '', 'Désignation': 'TOTAL PRODUITS (INGRESOS):', 'Montant (MAD)': total_produits, 'Utilisateur': ''})
    data.append({'Date': '', 'Type (Produit ou Charge)': '', 'Désignation': 'TOTAL CHARGES (GASTOS):', 'Montant (MAD)': total_charges, 'Utilisateur': ''})
    data.append({'Date': '', 'Type (Produit ou Charge)': '', 'Désignation': 'RESULTAT NET (BALANCE):', 'Montant (MAD)': resultat_net, 'Utilisateur': ''})
    # ===============================================================
        
    # Tu lógica final con Pandas sigue intacta
    df = pd.DataFrame(data)
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
        df.to_excel(writer, index=False)
    buffer.seek(0)
    return buffer

@login_required
def exportar_excel(request):
    usuario_filter = request.GET.get('usuario', 'all')
    buffer = generate_excel_buffer(usuario_filter)
    
    # Capturamos la fecha y hora actual en la zona horaria del sistema
    ahora = timezone.localtime(timezone.now()).strftime('%Y%m%d_%H%M%S')
    
    # Construimos el nombre dinámico del archivo
    nombre_archivo = f"export_{usuario_filter}_{ahora}.xlsx"
    
    response = HttpResponse(buffer.getvalue(), content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    response['Content-Disposition'] = f'attachment; filename={nombre_archivo}'
    return response

@login_required
def enviar_email_excel(request):
    if request.method == 'POST':
        dest = request.POST.get('dest')
        usuario_filter = request.POST.get('user', 'all')
        
        buffer = generate_excel_buffer(usuario_filter)
        
        # Capturamos la fecha y hora actual para el nombre del adjunto y el cuerpo del mensaje
        ahora_dt = timezone.localtime(timezone.now())
        ahora_str = ahora_dt.strftime('%Y%m%d_%H%M%S')
        fecha_humana = ahora_dt.strftime('%d/%m/%Y a las %H:%M:%S')
        
        nombre_archivo = f"export_{usuario_filter}_{ahora_str}.xlsx"
        
        email = EmailMessage(
            subject='Exportación de Registros - Gestión Ozaz',
            body=f'Adjunto encontrarás la exportación de registros solicitada.\n\nFiltro aplicado: {usuario_filter}\nFecha de generación: {fecha_humana}\n\nSaludos del sistema.',            from_email='no-reply@gestionozaz.com',
            to=[dest],
        )
        email.attach(nombre_archivo, buffer.getvalue(), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
        
        try:
            email.send()
            return JsonResponse({'status': 'ok'})
        except Exception as e:
            return JsonResponse({'status': 'error', 'message': str(e)})


def registro(request):
    # Si el usuario ya está logueado, lo mandamos al dashboard
    if request.user.is_authenticated:
        return redirect('dashboard')
        
    if request.method == 'POST':
        form = UserCreationForm(request.POST)
        if form.is_valid():
            # Guardamos el usuario (se crea sin permisos de superuser de forma nativa)
            user = form.save()
            
            # Opcional: Si rellenó el email en la interfaz, se lo guardamos manualmente
            email_post = request.POST.get('email')
            if email_post:
                user.email = email_post
                user.save()
                
            messages.success(request, '¡Cuenta creada con éxito! Ya puedes iniciar sesión.')
            return redirect('login')
    else:
        form = UserCreationForm()
        
    return render(request, 'registro.html', {'form': form})