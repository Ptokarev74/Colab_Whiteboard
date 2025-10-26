// src/utils/firebase.ts

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc } from 'firebase/firestore';

// Global access to the environment variables set by the platform
// These declarations are needed for TypeScript to recognize the global variables
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;
declare const __app_id: string | undefined;

let app: any;
let db: any;
let auth: any;
let userId: string | undefined;

/**
 * Initializes Firebase App, performs user authentication, and sets up Firestore.
 * Includes robust checks for local development environment where global variables are undefined.
 */
export async function initializeFirebase() {
    if (app) {
        return { db, userId: userId || 'anonymous' };
    }

    try {
        // 1. Configuration Setup
        // Use global variables if they exist, otherwise provide safe fallbacks
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

        // Check for existence before accessing; fall back to an empty string for JSON.parse safety
        const configString = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
        const firebaseConfig = JSON.parse(configString);

        // 2. Initialize Firebase Services
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // 3. Authenticate User
        const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            // Sign in anonymously for local testing/unauthenticated users
            await signInAnonymously(auth);
        }

        // 4. Set the authenticated user ID
        userId = auth.currentUser?.uid || crypto.randomUUID();

        return { db, userId: userId as string };
    } catch (error) {
        console.error("Firebase initialization failed. The app will run in local-only mode.", error);
        // Fallback to a mock environment if Firebase fails to initialize
        userId = 'anonymous_local';
        return { db: null, userId: userId as string };
    }
}

/**
 * Gets the Firestore collection reference for the collaborative whiteboard drawings.
 * Data is stored publicly under /artifacts/{appId}/public/data/drawings
 */
export function getDrawingCollection(db: any, appId: string) {
    if (!db) return null;

    // MANDATORY PUBLIC DATA PATH: /artifacts/{appId}/public/data/drawings
    const publicPath = `/artifacts/${appId}/public/data/drawings`;
    return collection(db, publicPath);
}

// Re-export constants for consistency (used in app/page.tsx for the public path)
export const DRAWING_DOC_ID = 'master_whiteboard_lines';