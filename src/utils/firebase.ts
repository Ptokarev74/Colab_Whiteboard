// src/utils/firebase.ts

import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, doc, Firestore } from 'firebase/firestore';

// Global access to the environment variables set by the platform
declare const __firebase_config: string | undefined;
declare const __initial_auth_token: string | undefined;
declare const __app_id: string | undefined;

let app: any = null;
let db: Firestore | null = null;
let auth: any = null;
let userId: string | undefined = undefined;

/**
 * Initializes Firebase App, performs user authentication, and sets up Firestore.
 * Includes robust checks for environments where global variables are undefined.
 */
export async function initializeFirebase(): Promise<{ db: Firestore | null, userId: string, appId: string }> {
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

    if (app) {
        return { db, userId: userId || 'anonymous', appId };
    }

    try {
        // Check for existence before accessing; fall back to an empty object string for JSON.parse safety
        const configString = typeof __firebase_config !== 'undefined' ? __firebase_config : '{}';
        const firebaseConfig = JSON.parse(configString);

        // We only proceed if firebaseConfig has actual keys (meaning it's a valid config)
        if (Object.keys(firebaseConfig).length > 0) {
            // 2. Initialize Firebase Services
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
            auth = getAuth(app);

            // 3. Authenticate User
            const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined;

            if (initialAuthToken) {
                await signInWithCustomToken(auth, initialAuthToken);
            } else {
                await signInAnonymously(auth);
            }

            // 4. Set the authenticated user ID
            userId = auth.currentUser?.uid || crypto.randomUUID();
        } else {
            throw new Error("Missing Firebase configuration. Running in local-only mode.");
        }

        return { db, userId: userId as string, appId };
    } catch (error) {
        console.warn("Firebase connection failed. This is expected if running locally without environment variables.", error);
        // Fallback: Return null for DB and a local user ID.
        userId = 'anonymous_local';
        db = null; // Explicitly set to null to stop database attempts in page.tsx
        return { db: null, userId: userId as string, appId };
    }
}

/**
 * Gets the Firestore collection reference for the collaborative whiteboard drawings.
 */
export function getDrawingCollection(db: Firestore | null, appId: string) {
    if (!db) return null;

    // MANDATORY PUBLIC DATA PATH: /artifacts/{appId}/public/data/drawings
    const publicPath = `/artifacts/${appId}/public/data/drawings`;
    return collection(db, publicPath);
}

// Re-export constants
export const DRAWING_DOC_ID = 'master_whiteboard_lines';