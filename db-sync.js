// Módulo de sincronización con Firebase para persistencia en la nube
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Configuración de tu aplicación Firebase
const firebaseConfig = {
  apiKey: "AIzaSyBERm5FunmGF0ANufFYztwXUxCGYNcPWlc",
  authDomain: "juegos-a61aa.firebaseapp.com",
  projectId: "juegos-a61aa",
  storageBucket: "juegos-a61aa.firebasestorage.app",
  messagingSenderId: "295792951309",
  appId: "1:295792951309:web:7aee5d6056ee118ab49544"
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let currentUser = null;
let syncTimeout = null;
let dirtyKeys = {};
let onAuthUpdateCallback = null;

// Respaldar las funciones originales de Storage
const originalSetItem = Storage.prototype.setItem;
const originalRemoveItem = Storage.prototype.removeItem;

// 1. Interceptar localStorage.setItem
Storage.prototype.setItem = function(key, value) {
  originalSetItem.call(this, key, value);
  if (key.startsWith('games-hub.') && currentUser) {
    dirtyKeys[key] = value;
    scheduleSync();
  }
};

// 2. Interceptar localStorage.removeItem
Storage.prototype.removeItem = function(key) {
  originalRemoveItem.call(this, key);
  if (key.startsWith('games-hub.') && currentUser) {
    dirtyKeys[key] = null; // Marcado para eliminar
    scheduleSync();
  }
};

// Planificar la sincronización con un debounce de 1 segundo
function scheduleSync() {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(performSync, 1000);
}

// Enviar los cambios pendientes a Firestore
async function performSync() {
  if (!currentUser || Object.keys(dirtyKeys).length === 0) return;

  const uid = currentUser.uid;
  const docRef = doc(db, "users", uid);

  const updates = { localStorageData: {} };
  const keysToProcess = { ...dirtyKeys };
  dirtyKeys = {}; // Limpiar para evitar duplicaciones

  for (const [key, value] of Object.entries(keysToProcess)) {
    updates.localStorageData[key] = value;
  }

  try {
    await setDoc(docRef, updates, { merge: true });
  } catch (err) {
    console.error("Error sincronizando con Firestore:", err);
    // En caso de fallo, reincorporar las claves sucias
    dirtyKeys = { ...keysToProcess, ...dirtyKeys };
  }
}

// Mezcla inteligente de datos entre local y nube
async function syncDataOnLogin(user) {
  const uid = user.uid;
  const docRef = doc(db, "users", uid);

  try {
    const docSnap = await getDoc(docRef);
    let cloudData = {};

    if (docSnap.exists()) {
      cloudData = docSnap.data().localStorageData || {};
    }

    const localData = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith('games-hub.')) {
        localData[key] = localStorage.getItem(key);
      }
    }

    const mergedData = { ...cloudData };
    let hasLocalChanges = false;

    // Comparar y mezclar datos locales con los de la nube
    for (const [key, localVal] of Object.entries(localData)) {
      const cloudVal = cloudData[key];

      if (cloudVal === undefined) {
        // Clave nueva local que no existe en la nube
        mergedData[key] = localVal;
        hasLocalChanges = true;
      } else if (localVal !== cloudVal) {
        // Si es un récord o récord con número, quedarnos con el mayor valor
        if (key.endsWith('.best') || key.endsWith('.records')) {
          // Intentar parsear como números
          const numLocal = parseInt(localVal, 10) || 0;
          const numCloud = parseInt(cloudVal, 10) || 0;
          if (numLocal > numCloud) {
            mergedData[key] = localVal;
            hasLocalChanges = true;
          } else {
            originalSetItem.call(localStorage, key, cloudVal);
          }
        } else {
          // Por defecto en otras claves (estados, configs), preferimos lo más nuevo
          // En esta arquitectura simple, si hay conflicto en el estado actual de la partida,
          // priorizamos la nube para que se sincronice el dispositivo actual.
          originalSetItem.call(localStorage, key, cloudVal);
        }
      }
    }

    // Escribir los datos de la nube que no estaban locales
    for (const [key, cloudVal] of Object.entries(cloudData)) {
      if (localData[key] === undefined) {
        originalSetItem.call(localStorage, key, cloudVal);
      }
    }

    // Si hubo mejoras locales (por ejemplo, un récord superado sin conexión), subir a la nube
    if (hasLocalChanges) {
      await setDoc(docRef, { localStorageData: mergedData }, { merge: true });
    }

    // Disparar recarga o actualización de la interfaz si el callback está registrado
    if (onAuthUpdateCallback) {
      onAuthUpdateCallback(user);
    }
  } catch (err) {
    console.error("Error al mezclar datos de inicio de sesión:", err);
  }
}

// Observar los cambios de autenticación
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (user) {
    await syncDataOnLogin(user);
  } else {
    if (onAuthUpdateCallback) {
      onAuthUpdateCallback(null);
    }
  }
});

// Registrar un callback para cambios de autenticación
export function onAuthUpdate(callback) {
  onAuthUpdateCallback = callback;
  // Disparar inmediatamente con el estado actual si está disponible
  callback(currentUser);
}

// Iniciar sesión con Google (Popup)
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (error) {
    console.error("Error al iniciar sesión con Google:", error);
    throw error;
  }
}

// Cerrar sesión
export async function signOutUser() {
  try {
    await signOut(auth);
    // Limpiar claves locales para que la sesión siguiente empiece limpia
    // pero conservando lo local si se prefiere. Por seguridad y privacidad,
    // al cerrar sesión podemos recargar la página para limpiar los estados activos.
    location.reload();
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
}
