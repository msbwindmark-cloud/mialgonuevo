
// Configuración de IndexedDB
const DB_NAME = 'OzazOfflineDB';
const DB_VERSION = 1;

function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('registros')) {
                db.createObjectStore('registros', { keyPath: 'id', autoIncrement: true });
            }
            if (!db.objectStoreNames.contains('users')) {
                db.createObjectStore('users', { keyPath: 'username' });
            }
        };
        request.onsuccess = (event) => resolve(event.target.result);
        request.onerror = (event) => reject(event.target.error);
    });
}

// Funciones para Registros
async function saveRegistroOffline(data) {
    const db = await openDB();
    const tx = db.transaction('registros', 'readwrite');
    const store = tx.objectStore('registros');
    await store.add({ ...data, synced: false, timestamp: new Date().getTime() });
    return tx.complete;
}

async function getOfflineRegistros() {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction('registros', 'readonly');
        const store = tx.objectStore('registros');
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result.filter(r => !r.synced));
    });
}

async function markAsSynced(id) {
    const db = await openDB();
    const tx = db.transaction('registros', 'readwrite');
    const store = tx.objectStore('registros');
    const request = store.get(id);
    request.onsuccess = () => {
        const data = request.result;
        data.synced = true;
        store.put(data);
    };
}

// Funciones para Usuarios (Offline Login)
async function saveUserForOffline(username, passwordHash) {
    const db = await openDB();
    const tx = db.transaction('users', 'readwrite');
    store = tx.objectStore('users');
    store.put({ username, passwordHash });
}

async function checkOfflineLogin(username, password) {
    const db = await openDB();
    return new Promise((resolve) => {
        const tx = db.transaction('users', 'readonly');
        const store = tx.objectStore('users');
        const request = store.get(username);
        request.onsuccess = () => {
            if (request.result) {
                // Aquí usamos una comparación simple para el ejemplo. 
                // En producción deberías usar un hash real.
                const hash = btoa(password); // Simple base64 como "hash"
                resolve(request.result.passwordHash === hash);
            } else {
                resolve(false);
            }
        };
        request.onerror = () => resolve(false);
    });
}

// Sincronización de datos offline con el servidor Django
// Función para traducir palabras numéricas a dígitos (Español y Francés)
function parseWordToNumber(text) {
    text = text.toLowerCase().trim();
    
    // Si ya es un número en dígitos, retornar
    if (/^\d+([.,]\d+)?$/.test(text)) {
        return text;
    }

    const numberMap = {
        // Español
        'cero': 0, 'uno': 1, 'un': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4,
        'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
        'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
        'dieciséis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19,
        'veinte': 20, 'veintiuno': 21, 'veintidos': 22, 'veintitres': 23,
        'veinticuatro': 24, 'veinticinco': 25, 'veintiseis': 26, 'veintisiete': 27,
        'veintiocho': 28, 'veintinueve': 29, 'treinta': 30, 'cuarenta': 40,
        'cincuenta': 50, 'sesenta': 60, 'setenta': 70, 'ochenta': 80, 'noventa': 90,
        'cien': 100, 'ciento': 100, 'doscientos': 200, 'trescientos': 300,
        'cuatrocientos': 400, 'quinientos': 500, 'seiscientos': 600,
        'setecientos': 700, 'ochocientos': 800, 'novecientos': 900,
        'mil': 1000,
        // Francés
        'zéro': 0, 'un': 1, 'une': 1, 'deux': 2, 'trois': 3, 'quatre': 4,
        'cinq': 5, 'six': 6, 'sept': 7, 'huit': 8, 'neuf': 9, 'dix': 10,
        'onze': 11, 'douze': 12, 'treize': 13, 'quatorze': 14, 'quinze': 15,
        'seize': 16, 'dix-sept': 17, 'dix-huit': 18, 'dix-neuf': 19,
        'vingt': 20, 'trente': 30, 'quarante': 40, 'cinquante': 50,
        'soixante': 60, 'cent': 100, 'mille': 1000
    };

    let words = text.replace(/ y /g, ' ').replace(/-/g, ' ').split(/\s+/);
    
    let isDecimal = false;
    let intTotal = 0;
    let intCurrent = 0;
    let decTotal = 0;
    let decCurrent = 0;

    for (let word of words) {
        if (word === 'coma' || word === 'con' || word === 'punto' || word === 'virgule' || word === 'point') {
            isDecimal = true;
            intTotal += intCurrent;
            intCurrent = 0;
            continue;
        }

        let val = numberMap[word];
        if (val === undefined) {
            let digit = parseFloat(word);
            if (!isNaN(digit)) val = digit;
        }

        if (val !== undefined) {
            if (!isDecimal) {
                if (val === 100) {
                    if (intCurrent === 0) intCurrent = 1;
                    intCurrent *= 100;
                } else if (val === 1000) {
                    if (intCurrent === 0) intCurrent = 1;
                    intTotal += intCurrent * 1000;
                    intCurrent = 0;
                } else {
                    intCurrent += val;
                }
            } else {
                if (val === 100) {
                    if (decCurrent === 0) decCurrent = 1;
                    decCurrent *= 100;
                } else if (val === 1000) {
                    if (decCurrent === 0) decCurrent = 1;
                    decTotal += decCurrent * 1000;
                    decCurrent = 0;
                } else {
                    decCurrent += val;
                }
            }
        }
    }
    
    intTotal += intCurrent;
    decTotal += decCurrent;

    if (isDecimal) {
        return `${intTotal}.${decTotal}`;
    } else {
        return intTotal > 0 ? intTotal.toString() : text;
    }
}

// Función de Síntesis de Voz (TTS) - Silenciada por completo
function speak(text) {
    // Silenciado a petición del usuario para evitar molestias
}

// Lógica de Voz mejorada con Asistente
function initializeVoiceControl(targetInputs) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Reconocimiento de voz no soportado");
        return null;
    }

    const recognition = new SpeechRecognition();
    
    // Detectar el idioma
    if (navigator.language && navigator.language.startsWith('fr')) {
        recognition.lang = 'fr-FR';
    } else {
        recognition.lang = 'es-ES';
    }
    
    recognition.continuous = true; // Mantener el micrófono abierto de forma continua
    recognition.interimResults = true; // Mostrar resultados parciales mientras se habla
    recognition.running = false;

    recognition.onstart = () => {
        recognition.running = true;
        console.log("Micrófono activado. Escuchando de forma continua...");
        
        if (targetInputs.type === 'form' || targetInputs.type === 'login') {
            const btnId = targetInputs.type === 'form' ? 'btn-voice-form' : 'btn-voice-login';
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.className = 'btn btn-danger btn-sm mb-2 w-100';
                btn.innerHTML = `<i class="bi bi-mic-mute-fill animate-pulse"></i> 🔴 Detener Voz (Escuchando...)`;
                btn.style.animation = 'pulse 1s infinite alternate';
            }
            const preview = document.getElementById('voice-transcript-preview');
            if (preview) {
                preview.style.display = 'block';
                const helperText = targetInputs.type === 'form' 
                    ? 'Di lo que quieras añadir (Fecha, Tipo, Descripción, Monto)' 
                    : 'Di tu usuario y contraseña separados por "punto"';
                preview.innerHTML = `<em>Escuchando... ${helperText}</em>`;
            }
        } else if (targetInputs.type === 'single') {
            let btnId = null;
            if (targetInputs.fieldId === 'floatingInput') btnId = 'voice-user';
            if (targetInputs.fieldId === 'floatingPassword') btnId = 'voice-pass';
            if (btnId) {
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.classList.remove('text-muted');
                    btn.classList.add('text-danger');
                    btn.style.animation = 'pulse 1s infinite alternate';
                }
            }
        }
    };

    recognition.onend = () => {
        recognition.running = false;
        console.log("Micrófono desactivado (onend).");
        
        if (targetInputs.type === 'form' || targetInputs.type === 'login') {
            const btnId = targetInputs.type === 'form' ? 'btn-voice-form' : 'btn-voice-login';
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.className = 'btn btn-outline-primary btn-sm mb-2 w-100';
                const btnText = targetInputs.type === 'form' 
                    ? 'Usar Voz (Ej: Hoy punto Charge punto Gasto punto 30.5)' 
                    : 'Usar Voz (Ej: admin punto 1234)';
                btn.innerHTML = `<i class="bi bi-mic-fill"></i> ${btnText}`;
                btn.style.animation = '';
            }
            const preview = document.getElementById('voice-transcript-preview');
            if (preview) {
                preview.textContent = '';
                preview.style.display = 'none';
            }
        } else if (targetInputs.type === 'single') {
            let btnId = null;
            if (targetInputs.fieldId === 'floatingInput') btnId = 'voice-user';
            if (targetInputs.fieldId === 'floatingPassword') btnId = 'voice-pass';
            if (btnId) {
                const btn = document.getElementById(btnId);
                if (btn) {
                    btn.classList.remove('text-danger');
                    btn.classList.add('text-muted');
                    btn.style.animation = '';
                }
            }
        }
    };

    recognition.onerror = (event) => {
        console.error("Error de voz:", event.error);
        if (event.error === 'no-speech') return; // Ignorar silencio común
        
        let errorMsg = "No se pudo reconocer la voz.";
        if (event.error === 'audio-capture') {
            errorMsg = "No se detectó ningún micrófono. Conecta uno e inténtalo de nuevo.";
        } else if (event.error === 'not-allowed') {
            errorMsg = "Acceso al micrófono denegado. Permítelo en la barra de tu navegador.";
        } else if (event.error === 'network') {
            errorMsg = "Error de red. El reconocimiento requiere conexión a internet.";
        }
        
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'Control de Voz',
                text: errorMsg,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 4000
            });
        }
    };

    recognition.onresult = (event) => {
        // Evitar bucles con el altavoz
        if (window.speechSynthesis && window.speechSynthesis.speaking) return;

        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript;
        }
        transcript = transcript.toLowerCase().trim();

        // 0. Pre-procesar Comandos de Autoguardado para no ensuciar los campos
        const saveCommands = ['guardar', 'enviar', 'sauvegarder', 'enregistrer', 'envoyer', 'fini', 'entrar', 'login', 'entrer'];
        let shouldAutoSave = false;
        for (let cmd of saveCommands) {
            if (transcript.includes(cmd)) {
                shouldAutoSave = true;
                // Remover el comando para que no entre en el campo de contraseña/monto
                transcript = transcript.replace(new RegExp('\\b' + cmd + '\\b', 'gi'), '').trim();
            }
        }

        // Mostrar vista previa en vivo
        const preview = document.getElementById('voice-transcript-preview');
        if (preview) {
            preview.innerHTML = `<strong>Escuchado:</strong> <span class="text-primary">"${transcript}"</span>`;
        }

        // --- 1. COMANDOS DE ASISTENTE ---
        if (transcript.includes('balance') || transcript.includes('total') || transcript.includes('résumé')) {
            const prod = document.querySelector('h4.fw-bold')?.innerText || "0";
            const char = document.querySelectorAll('h4.fw-bold')[1]?.innerText || "0";
            const net = document.querySelectorAll('h4.fw-bold')[2]?.innerText || "0";
            speak(`Tu balance actual es: Ingresos ${prod}, gastos ${char}. El resultado neto es de ${net}.`);
            return;
        }

        // --- 2. LLENADO DE FORMULARIOS ---
        if (targetInputs.type === 'form') {
            
            // INTENTO 1: Patrón secuencial dictado con "punto" o "point" 
            // Ejemplo: "hoy punto produit punto zapatos punto 50"
            const delimiterMatches = transcript.split(/\s+punto\s+|\s+point\s+|\s*\.\s*/i);
            
            if (delimiterMatches.length > 1) {
                let dateVal = delimiterMatches[0] ? delimiterMatches[0].trim() : '';
                let tipoVal = delimiterMatches.length > 1 ? delimiterMatches[1].trim() : '';
                let descVal = delimiterMatches.length > 2 ? delimiterMatches[2].trim() : '';
                let montoVal = delimiterMatches.length > 3 ? delimiterMatches[3].trim() : '';

                // 1. Procesar Fecha
                if (dateVal.includes('hoy') || dateVal.includes("aujourd'hui")) {
                    let today = new Date();
                    let y = today.getFullYear();
                    let m = String(today.getMonth() + 1).padStart(2, '0');
                    let d = String(today.getDate()).padStart(2, '0');
                    dateVal = `${y}-${m}-${d}`;
                } else {
                    // Convertir palabras a números para los días
                    dateVal = dateVal.replace(/\buno\b/gi, '1').replace(/\bun\b/gi, '1')
                        .replace(/\bdos\b/gi, '2').replace(/\btres\b/gi, '3')
                        .replace(/\bcuatro\b/gi, '4').replace(/\bcinco\b/gi, '5')
                        .replace(/\bseis\b/gi, '6').replace(/\bsiete\b/gi, '7')
                        .replace(/\bocho\b/gi, '8').replace(/\bnueve\b/gi, '9')
                        .replace(/\bdiez\b/gi, '10').replace(/\bonce\b/gi, '11')
                        .replace(/\bdoce\b/gi, '12').replace(/\btrece\b/gi, '13')
                        .replace(/\bcatorce\b/gi, '14').replace(/\bquince\b/gi, '15')
                        .replace(/\bdieciseis\b/gi, '16').replace(/\bdiecisiete\b/gi, '17')
                        .replace(/\bdieciocho\b/gi, '18').replace(/\bdiecinueve\b/gi, '19')
                        .replace(/\bveinte\b/gi, '20').replace(/\btreinta\b/gi, '30');

                    const monthMap = {
                        'enero': '01', 'janvier': '01', 'febrero': '02', 'février': '02',
                        'marzo': '03', 'mars': '03', 'abril': '04', 'avril': '04',
                        'mayo': '05', 'mai': '05', 'junio': '06', 'juin': '06',
                        'julio': '07', 'juillet': '07', 'agosto': '08', 'août': '08',
                        'septiembre': '09', 'septembre': '09', 'octubre': '10', 'octobre': '10',
                        'noviembre': '11', 'novembre': '11', 'diciembre': '12', 'décembre': '12'
                    };
                    let dateMatch = dateVal.match(/(\d{1,2})\s*(?:del|de|d'|\/|-)?\s*([a-zA-Záéíóúûéèà\d]+)\s*(?:del|de|d'|\/|-)?\s*(\d{4}|\d{2})/i);
                    if (dateMatch) {
                        let day = dateMatch[1].padStart(2, '0');
                        let monthStr = dateMatch[2].toLowerCase();
                        let month = monthMap[monthStr] || monthStr.padStart(2, '0');
                        let year = dateMatch[3];
                        if (year.length === 2) year = '20' + year;
                        dateVal = `${year}-${month}-${day}`;
                    } else if (dateVal.match(/^\d{4}-\d{2}-\d{2}$/)) {
                        // Ya está en formato correcto
                    } else {
                        // Fallback: tratar de extraer la primera palabra
                        dateVal = dateVal.split(' ')[0];
                    }
                }
                const dInput = document.getElementById(targetInputs.fields['date']);
                if (dInput && dateVal) dInput.value = dateVal;

                // 2. Procesar Tipo
                const tInput = document.getElementById(targetInputs.fields['tipo']);
                if (tInput && tipoVal) {
                    let lowerVal = tipoVal.toLowerCase();
                    if (lowerVal.includes('charge') || lowerVal.includes('gasto') || lowerVal.includes('chao') || lowerVal.includes('char') || lowerVal.includes('sage') || lowerVal.includes('sarge')) tInput.value = 'Charge';
                    else if (lowerVal.includes('produit') || lowerVal.includes('producto') || lowerVal.includes('ingreso') || lowerVal.includes('pro') || lowerVal.includes('prod')) tInput.value = 'Produit';
                }

                // 3. Procesar Descripción
                const desInput = document.getElementById(targetInputs.fields['designation']);
                if (desInput) desInput.value = descVal;

                // 4. Procesar Monto
                if (montoVal) {
                    montoVal = parseWordToNumber(montoVal);
                    montoVal = montoVal.split(' ')[0].replace(',', '.');
                    const mInput = document.getElementById(targetInputs.fields['montant']);
                    if (mInput && /^\d+([.]\d+)?$/.test(montoVal)) {
                        mInput.value = montoVal;
                    }
                }

            } else {
                // INTENTO 2: Fallback al sistema de palabras clave
                const keywords = {
                    date: ['fecha', 'dia', 'date', 'jour', 'hoy', "aujourd'hui"],
                    tipo: ['tipo', 'categoría', 'type', 'catégorie'],
                    designation: ['descripción', 'detalle', 'concepto', 'designación', 'désignation', 'description', 'détail'],
                    montant: ['monto', 'cantidad', 'precio', 'total', 'montant', 'prix']
                };

                for (const [field, keys] of Object.entries(keywords)) {
                    for (const key of keys) {
                        if (transcript.includes(key)) {
                            let parts = transcript.split(key);
                            if (parts.length > 1) {
                                let value = parts[1].trim();

                                // Quitar cualquier otra palabra clave posterior
                                const allKeywords = Object.values(keywords).flat();
                                for (const otherKey of allKeywords) {
                                    const regex = new RegExp('\\s+' + otherKey + '\\b', 'i');
                                    if (otherKey !== key && regex.test(value)) {
                                        value = value.split(regex)[0].trim();
                                    }
                                }

                                // Procesar por campo
                                if (field === 'date') {
                                    if (key === 'hoy' || key === "aujourd'hui" || value.startsWith('hoy') || value.startsWith("aujourd'hui")) {
                                        let today = new Date();
                                        let y = today.getFullYear();
                                        let m = String(today.getMonth() + 1).padStart(2, '0');
                                        let d = String(today.getDate()).padStart(2, '0');
                                        value = `${y}-${m}-${d}`;
                                    } else {
                                        const monthMap = {
                                            'enero': '01', 'janvier': '01', 'febrero': '02', 'février': '02',
                                            'marzo': '03', 'mars': '03', 'abril': '04', 'avril': '04',
                                            'mayo': '05', 'mai': '05', 'junio': '06', 'juin': '06',
                                            'julio': '07', 'juillet': '07', 'agosto': '08', 'août': '08',
                                            'septiembre': '09', 'septembre': '09', 'octubre': '10', 'octobre': '10',
                                            'noviembre': '11', 'novembre': '11', 'diciembre': '12', 'décembre': '12'
                                        };
                                        let dateMatch = value.match(/(\d{1,2})\s*(?:del|de|d'|\/|-)?\s*([a-zA-Záéíóúûéèà\d]+)\s*(?:del|de|d'|\/|-)?\s*(\d{4}|\d{2})/i);
                                        if (dateMatch) {
                                            let day = dateMatch[1].padStart(2, '0');
                                            let monthStr = dateMatch[2].toLowerCase();
                                            let month = monthMap[monthStr] || monthStr.padStart(2, '0');
                                            let year = dateMatch[3];
                                            if (year.length === 2) year = '20' + year;
                                            value = `${year}-${month}-${day}`;
                                        } else {
                                            value = value.split(' ')[0];
                                        }
                                    }
                                } else if (field === 'designation') {
                                    // Mantener la frase completa de descripción
                                } else if (field === 'montant') {
                                    value = parseWordToNumber(value);
                                    value = value.split(' ')[0];
                                } else {
                                    value = value.split(' ')[0];
                                }

                                const input = document.getElementById(targetInputs.fields[field]);
                                if (input) {
                                    if (field === 'montant') {
                                        value = value.replace(',', '.');
                                        if (/^\d+([.]\d+)?$/.test(value)) {
                                            input.value = value;
                                        }
                                    } else if (field === 'tipo') {
                                        let lowerVal = value.toLowerCase();
                                        let finalVal = null;
                                        if (lowerVal.includes('charge') || lowerVal.includes('gasto')) finalVal = 'Charge';
                                        if (lowerVal.includes('produit') || lowerVal.includes('producto') || lowerVal.includes('ingreso')) finalVal = 'Produit';
                                        if (finalVal) input.value = finalVal;
                                    } else {
                                        input.value = value;
                                    }
                                }
                            }
                            break;
                        }
                    }
                }
            }
        } else if (targetInputs.type === 'login') {
            const delimiterMatches = transcript.split(/\s+punto\s+|\s+point\s+|\s*\.\s*/i);
            if (delimiterMatches.length > 1) {
                let userVal = delimiterMatches[0].trim();
                let passVal = delimiterMatches[1].trim();

                const uInput = document.getElementById(targetInputs.fields['user']);
                if (uInput && userVal) {
                    userVal = userVal.replace(/\s+/g, '').toLowerCase();
                    uInput.value = userVal;
                }

                const pInput = document.getElementById(targetInputs.fields['pass']);
                if (pInput && passVal) {
                    let processedPass = passVal
                        .replace(/\s+/g, '')
                        .replace(/arroba|arobase/g, '@')
                        .replace(/guiónbajo|guionbajo|tiretbas|tiretdubas|underscore/g, '_')
                        .replace(/guión|guion|tiret/g, '-')
                        .replace(/barra|diagonal|slash/g, '/')
                        .replace(/asterisco|astérisque/g, '*')
                        .replace(/almohadilla|dièse/g, '#')
                        .replace(/dólar|dolar|dollar/g, '$');

                    const numMap = {
                        'cero': '0', 'uno': '1', 'un': '1', 'una': '1', 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
                        'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9', 'zéro': '0', 'deux': '2', 'trois': '3', 
                        'quatre': '4', 'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8', 'neuf': '9'
                    };
                    for (let key in numMap) {
                        processedPass = processedPass.replace(new RegExp(key, 'gi'), numMap[key]);
                    }
                    
                    pInput.value = processedPass;
                }
            }
        } else if (targetInputs.type === 'single') {
            const input = document.getElementById(targetInputs.fieldId);
            if (input) {
                let processedText = transcript;
                if (targetInputs.fieldId === 'floatingPassword') {
                    processedText = processedText
                        .replace(/arroba|arobase/g, '@')
                        .replace(/guión bajo|guion bajo|tiret bas|tiret du bas|underscore/g, '_')
                        .replace(/guión|guion|tiret/g, '-')
                        .replace(/punto|point/g, '.')
                        .replace(/barra|diagonal|slash/g, '/')
                        .replace(/asterisco|astérisque/g, '*')
                        .replace(/almohadilla|dièse/g, '#')
                        .replace(/dólar|dolar|dollar/g, '$');

                    const numMap = {
                        'cero': '0', 'uno': '1', 'un': '1', 'una': '1', 'dos': '2', 'tres': '3', 'cuatro': '4', 'cinco': '5',
                        'seis': '6', 'siete': '7', 'ocho': '8', 'nueve': '9', 'zéro': '0', 'deux': '2', 'trois': '3', 
                        'quatre': '4', 'cinq': '5', 'six': '6', 'sept': '7', 'huit': '8', 'neuf': '9'
                    };
                    let words = processedText.split(/\s+/);
                    let processedWords = words.map(w => numMap[w] !== undefined ? numMap[w] : w);
                    processedText = processedWords.join('');
                }
                input.value = processedText;
            }
        }

        // --- 3. COMANDO DE AUTOGUARDADO ---
        if (shouldAutoSave) {
            recognition.stop();
            if (targetInputs.type === 'form') {
                const swalConfirm = document.querySelector('.swal2-confirm');
                if (swalConfirm && !swalConfirm.disabled) {
                    swalConfirm.click();
                }
            } else if (targetInputs.type === 'login') {
                const loginBtn = document.getElementById('btn-login');
                if (loginBtn) {
                    loginBtn.click();
                }
            }
        }
    };

    return recognition;
}

// Sincronización de datos offline con el servidor Django
async function syncOfflineData(url, csrfToken) {
    const offlineData = await getOfflineRegistros();

    if (offlineData.length === 0) {
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'info',
                title: 'Sin datos pendientes',
                text: 'No hay registros offline para sincronizar.',
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });
        }
        return;
    }

    Swal.fire({
        title: 'Sincronizando...',
        text: `Enviando ${offlineData.length} registro(s) al servidor. Por favor, espera...`,
        allowOutsideClick: false,
        didOpen: () => {
            Swal.showLoading();
        }
    });

    let successCount = 0;
    let errorCount = 0;

    for (const record of offlineData) {
        try {
            const formData = new FormData();
            formData.append('date', record.date || '');
            formData.append('tipo', record.tipo || 'Produit');
            formData.append('designation', record.designation || '');
            formData.append('montant', record.montant || '0');
            formData.append('csrfmiddlewaretoken', csrfToken);

            const response = await fetch(url, {
                method: 'POST',
                body: formData,
                credentials: 'same-origin'
            });

            if (response.ok) {
                await markAsSynced(record.id);
                successCount++;
            } else {
                console.error('Error al sincronizar registro:', record.id, 'Status:', response.status);
                errorCount++;
            }
        } catch (err) {
            console.error('Error de red al sincronizar registro:', record.id, err);
            errorCount++;
        }
    }

    // Actualizar el badge del botón de sincronización
    const remaining = await getOfflineRegistros();
    const badge = document.getElementById('sync-count');
    if (badge) {
        badge.textContent = remaining.length;
        if (remaining.length === 0) {
            badge.style.display = 'none';
        } else {
            badge.style.display = 'inline-block';
        }
    }

    // Notificar resultado
    if (typeof Swal !== 'undefined') {
        if (errorCount === 0) {
            Swal.fire({
                icon: 'success',
                title: '¡Sincronización completada!',
                text: `${successCount} registro(s) sincronizado(s) correctamente.`,
                showConfirmButton: false,
                timer: 2000
            }).then(() => location.reload());
        } else {
            Swal.fire({
                icon: 'warning',
                title: 'Sincronización parcial',
                text: `${successCount} sincronizado(s), ${errorCount} con error. Revisa tu conexión.`,
                confirmButtonColor: '#3085d6'
            });
        }
    }
}

// Alerta de estado offline
window.addEventListener('offline', () => {
    const alert = document.createElement('div');
    alert.id = 'offline-banner';
    alert.innerHTML = '<i class="bi bi-wifi-off"></i> Estás trabajando en modo offline. Los datos se guardarán localmente.';
    alert.style = 'position: fixed; top: 70px; left: 0; right: 0; background: #ffc107; color: #000; text-align: center; padding: 5px; z-index: 1000; font-weight: bold;';
    document.body.appendChild(alert);
});

window.addEventListener('online', () => {
    const banner = document.getElementById('offline-banner');
    if (banner) banner.remove();
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: 'success',
        title: 'Conexión restaurada',
        showConfirmButton: false,
        timer: 3000
    });
});
