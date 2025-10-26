// src/utils/firebase.ts

// This file sets up Firebase, including initialization and user authentication, 
// using the global variables provided by the Canvas environment for security and configuration.

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, Auth, User } from 'firebase/auth';
import { getFirestore, Firestore, collection, CollectionReference, DocumentData } from 'firebase/firestore';

// --- Global Variables (Mandatory for Canvas Environment) ---
// These variables are provided by the hosting environment at runtime.
declare const __app_id: string;
declare const __firebase_config: string;
declare const __initial_auth_token: string | undefined;

// --- Private Instances ---
let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let db: Firestore | null = null;
let currentUserId: string | null = null;
let isInitialized = false;

/**
 * Initializes Firebase, authenticates the user, and sets up Firestore.
 * This should only be called once.
 * @returns An object containing the Firebase services and the user's ID.
 */
export async function initializeFirebase() {
    if (isInitialized) {
        return { 
            db: db as Firestore, 
            auth: auth as Auth, 
            userId: currentUserId as string 
        };
    }

    try {
        // 1. Configuration Setup
        const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
        const firebaseConfig = JSON.parse(__firebase_config);

        // 2. Initialize Firebase Services
        app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        // 3. Authentication
        // Use the custom token if provided (authenticated user), otherwise sign in anonymously.
        let user: User;
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            const userCredential = await signInWithCustomToken(auth, __initial_auth_token);
            user = userCredential.user;
        } else {
            const userCredential = await signInAnonymously(auth);
            user = userCredential.user;
        }
        
        currentUserId = user.uid || crypto.randomUUID();
        isInitialized = true;

        console.log(`Firebase initialized. User ID: ${currentUserId.substring(0, 8)}... App ID: ${appId}`);
        
        return { db: db as Firestore, auth: auth as Auth, userId: currentUserId as string, appId };

    } catch (error) {
        console.error("Failed to initialize Firebase or authenticate:", error);
        // Fallback to a random ID if auth fails, although subsequent DB operations will fail.
        currentUserId = currentUserId || crypto.randomUUID(); 
        isInitialized = true; // Mark as initialized to prevent redundant calls on failure
        
        // Throw or return null/defaults depending on error recovery strategy
        throw new Error("Firebase initialization failed.");
    }
}

/**
 * Gets the CollectionReference for the public drawing data.
 * @param db The Firestore instance.
 * @param appId The unique application ID.
 * @returns A CollectionReference pointing to the shared drawing collection.
 */
export function getDrawingCollection(db: Firestore, appId: string): CollectionReference<DocumentData> {
    // MANDATORY PUBLIC DATA PATH: /artifacts/{appId}/public/data/drawings
    return collection(db, 'artifacts', appId, 'public', 'data', 'drawings');
}
