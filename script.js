// The core application logic for The Nemesis.
// This file handles UI interactions, local and remote state management,
// and integrates with external services such as Firebase Firestore for
// persistence and Hugging Face Inference API for AI-generated taunts.

import { PERSONAS, GLOBAL_TAUNTS } from './data.js';
// Supabase client for database operations
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

/* --------------------------------------------------------------------
 * Configuration
 * ------------------------------------------------------------------*/

// Supabase configuration. Replace the placeholder values with your actual
// Supabase project URL and anon/public API key (found in your project's
// API settings). Supabase provides a free tier suitable for small apps.
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Hugging Face Inference API configuration. To use the free tier of the
// Hugging Face Inference API, sign up at https://huggingface.co, create
// an access token, and select a public model suitable for Korean language
// generation (e.g. "beomi/llama-2-ko-7b" or any other accessible model).
// Then update the following constants with your token and chosen model.
const HF_API_TOKEN   = 'YOUR_HUGGINGFACE_API_TOKEN';
const HF_MODEL_ENDPOINT = 'https://api-inference.huggingface.co/models/YOUR_MODEL_NAME';

/* --------------------------------------------------------------------
 * Application Class
 * ------------------------------------------------------------------*/

class App {
    constructor() {
        // Unique identifier per user stored in localStorage. If not present
        // generate a new UUID. This ID is used as a document key in Firestore.
        this.userId = localStorage.getItem('nemesis_userId');
        if (!this.userId) {
            // Browser-native crypto API is available in modern browsers; if not,
            // fallback to a simple timestamp-based ID.
            try {
                this.userId = crypto.randomUUID();
            } catch (e) {
                this.userId = 'user-' + Date.now();
            }
            localStorage.setItem('nemesis_userId', this.userId);
        }

        // Core state of the application. This state is persisted locally
        // via localStorage and remotely via Firestore.
        this.status = {
            goal: '',
            insecurity: '',
            nemesisType: '',
            nemesisScore: 0,
            userScore: 0,
            isActive: false
        };

        // Supabase setup
        this.initSupabase();

        // Cache DOM references and bind events
        this.cacheDOM();
        this.bindEvents();

        // Load state from localStorage and Firestore
        this.loadState();
        this.loadFromDB().then(() => {
            this.checkState();
            if (this.status.isActive) this.startEngine();
        });
    }

    /**
     * Initialize Supabase client instance.
     */
    initSupabase() {
        try {
            // Only initialize if the URL and anon key have been replaced
            if (SUPABASE_URL.startsWith('http') && SUPABASE_ANON_KEY && SUPABASE_ANON_KEY !== 'YOUR_SUPABASE_ANON_KEY') {
                this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            } else {
                this.supabase = null;
                console.warn('Supabase is not configured. Please provide SUPABASE_URL and SUPABASE_ANON_KEY.');
            }
        } catch (err) {
            this.supabase = null;
            console.warn('Supabase initialization failed:', err);
        }
    }

    /**
     * Retrieve commonly accessed elements once.
     */
    cacheDOM() {
        this.screens = {
            onboarding: document.getElementById('onboarding'),
            dashboard: document.getElementById('dashboard')
        };
        this.inputs = {
            goal: document.getElementById('userGoal'),
            insecurity: document.getElementById('userInsecurity')
        };
        this.displays = {
            nemesisName: document.getElementById('nemesisNameDisplay'),
            nemesisScore: document.getElementById('nemesisScore'),
            userScore: document.getElementById('userScore'),
            taunt: document.getElementById('tauntDisplay')
        };
        this.btns = {
            summon: document.getElementById('summonBtn'),
            work: document.getElementById('workBtn'),
            surrender: document.getElementById('surrenderBtn'),
            reset: document.getElementById('resetBtn'),
            personas: document.querySelectorAll('.persona-btn')
        };
    }

    /**
     * Attach DOM event listeners to UI elements.
     */
    bindEvents() {
        // Persona selection buttons
        this.btns.personas.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Unselect all then select the clicked one
                this.btns.personas.forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
                this.status.nemesisType = e.target.dataset.type;
            });
        });

        // Summon button
        this.btns.summon.addEventListener('click', () => this.summonNemesis());
        // Work button
        this.btns.work.addEventListener('click', () => this.doWork());
        // Surrender button
        this.btns.surrender.addEventListener('click', () => {
            alert('Giving up confirms they are better than you.');
        });
        // Reset button
        this.btns.reset.addEventListener('click', () => this.resetApp());
    }

    /**
     * Load application state from localStorage.
     */
    loadState() {
        const s = localStorage.getItem('nemesis_state');
        if (s) {
            try {
                const parsed = JSON.parse(s);
                Object.assign(this.status, parsed);
            } catch (e) {
                console.warn('Failed to parse local state:', e);
            }
        }
    }

    /**
     * Save current application state to localStorage.
     */
    saveState() {
        localStorage.setItem('nemesis_state', JSON.stringify(this.status));
    }

    /**
     * Load user data from Firestore if available.
     */
    async loadFromDB() {
        // Supabase variant: fetch the row matching the current user ID
        if (!this.supabase) return;
        try {
            const { data, error } = await this.supabase
                .from('nemesis')
                .select('*')
                .eq('id', this.userId)
                .maybeSingle();
            if (error) {
                console.warn('Failed to load data from Supabase:', error);
            } else if (data) {
                // Merge remote data onto current state without losing local keys
                Object.assign(this.status, data);
            }
        } catch (err) {
            console.warn('Error loading data from Supabase:', err);
        }
    }

    /**
     * Persist current state to Firestore.
     */
    async saveToDB() {
        // Supabase variant: upsert the current state into the 'nemesis' table
        if (!this.supabase) return;
        try {
            const payload = {
                id: this.userId,
                goal: this.status.goal,
                insecurity: this.status.insecurity,
                nemesisType: this.status.nemesisType,
                nemesisScore: this.status.nemesisScore,
                userScore: this.status.userScore,
                isActive: this.status.isActive,
                createdAt: new Date().toISOString()
            };
            const { error } = await this.supabase
                .from('nemesis')
                .upsert(payload, { onConflict: 'id' });
            if (error) {
                console.warn('Failed to save data to Supabase:', error);
            }
        } catch (err) {
            console.warn('Error saving data to Supabase:', err);
        }
    }

    /**
     * Determine which screen should be displayed based on current state.
     */
    checkState() {
        if (this.status.isActive) {
            this.switchScreen('dashboard');
        } else {
            this.switchScreen('onboarding');
        }
        this.updateDashboard();
    }

    /**
     * Switch between screens by toggling CSS classes. Ensures that only the
     * requested screen is visible.
     * @param {string} name - Either 'onboarding' or 'dashboard'
     */
    switchScreen(name) {
        Object.keys(this.screens).forEach(key => {
            // Hide all screens first
            this.screens[key].classList.remove('active');
        });
        // Show requested screen
        if (this.screens[name]) {
            this.screens[name].classList.add('active');
        }
    }

    /**
     * Create a nemesis using the provided goal, insecurity, and selected persona.
     * Validates that all required fields are filled. Starts the game engine
     * once the nemesis has been summoned.
     */
    summonNemesis() {
        const goal = this.inputs.goal.value.trim();
        const insecurity = this.inputs.insecurity.value.trim();
        if (!goal || !insecurity || !this.status.nemesisType) {
            alert('Define your goal, insecurity and choose a Nemesis type.');
            return;
        }
        this.status.goal = goal;
        this.status.insecurity = insecurity;
        this.status.isActive = true;
        this.status.userScore = 0;
        // Give the nemesis a head start
        this.status.nemesisScore = 15;
        this.saveState();
        this.saveToDB();
        this.switchScreen('dashboard');
        this.startEngine();
        // Immediately generate a taunt when starting
        this.triggerTaunt(true);
    }

    /**
     * Start the simulation engine. Two intervals are established:
     * 1. Increase nemesis score periodically.
     * 2. Trigger AI taunts randomly (approx every 10 seconds with 30% probability).
     */
    startEngine() {
        this.updateDashboard();
        // Nemesis score increment interval (every 3 seconds)
        if (this.nemesisInterval) clearInterval(this.nemesisInterval);
        this.nemesisInterval = setInterval(() => {
            this.status.nemesisScore += 1;
            this.updateDashboard();
            this.saveState();
            this.saveToDB();
        }, 3000);
        // Taunt trigger interval (every 10 seconds)
        if (this.tauntInterval) clearInterval(this.tauntInterval);
        this.tauntInterval = setInterval(() => {
            // 70% chance to trigger a new taunt
            if (Math.random() > 0.3) {
                this.triggerTaunt();
            }
        }, 10000);
    }

    /**
     * Handles the action of the user doing work. Increments user score,
     * updates the UI and persists the state. Also shows a motivational
     * acknowledgement.
     */
    doWork() {
        this.status.userScore += 10;
        // Provide immediate feedback before AI taunt arrives
        this.displays.taunt.innerText = '좋아, 하지만 나는 계속 노력하고 있어.';
        this.updateDashboard();
        this.saveState();
        this.saveToDB();
    }

    /**
     * Generate a taunt. Attempts to call the Hugging Face Inference API
     * to produce a dynamic, Korean-language taunt tailored to the user's
     * goal and insecurity. Falls back to a random predefined taunt on
     * error or if AI configuration is incomplete.
     * @param {boolean} force - When true, bypasses the probability gating and
     * triggers an AI call regardless.
     */
    async triggerTaunt(force = false) {
        let message = null;
        // Only attempt AI call if configured and force is true or default gating passes
        const aiAvailable = HF_API_TOKEN && HF_API_TOKEN !== 'YOUR_HUGGINGFACE_API_TOKEN' &&
                            HF_MODEL_ENDPOINT && HF_MODEL_ENDPOINT.includes('models');
        if (aiAvailable && (force || Math.random() > 0.2)) {
            message = await this.getTauntFromAI();
        }
        // Fallback to local taunts if AI failed or not available
        if (!message) {
            const persona = PERSONAS[this.status.nemesisType];
            const taunts = persona ? [...persona.taunts, ...GLOBAL_TAUNTS] : GLOBAL_TAUNTS;
            message = taunts[Math.floor(Math.random() * taunts.length)];
        }
        this.displays.taunt.innerText = `"${message}"`;
    }

    /**
     * Call the Hugging Face Inference API to generate a taunt. Builds
     * a prompt using the user's goal, insecurity and chosen persona.
     * @returns {Promise<string|null>} AI-generated taunt or null on failure.
     */
    async getTauntFromAI() {
        const persona = PERSONAS[this.status.nemesisType];
        if (!persona || !HF_API_TOKEN || !HF_MODEL_ENDPOINT) return null;
        const prompt = `You are "${persona.name}", a cold and competitive rival. ` +
            `The user is trying to "${this.status.goal}" but struggles with "${this.status.insecurity}". ` +
            `Write a short, cutting but motivational taunt in Korean. Max 2 sentences.`;
        try {
            const response = await fetch(HF_MODEL_ENDPOINT, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${HF_API_TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ inputs: prompt })
            });
            const data = await response.json();
            // The Inference API returns different formats depending on model type
            if (Array.isArray(data) && data.length > 0 && data[0].generated_text) {
                return data[0].generated_text.trim();
            }
            if (data.choices && data.choices.length > 0 && data.choices[0].text) {
                return data.choices[0].text.trim();
            }
            return null;
        } catch (err) {
            console.warn('AI taunt generation failed:', err);
            return null;
        }
    }

    /**
     * Update dashboard display elements to reflect the current state.
     */
    updateDashboard() {
        const persona = PERSONAS[this.status.nemesisType];
        this.displays.nemesisName.innerText = persona ? persona.name.toUpperCase() : 'NEMESIS';
        this.displays.nemesisScore.innerText = this.status.nemesisScore;
        this.displays.userScore.innerText = this.status.userScore;
    }

    /**
     * Reset the entire application. Clears localStorage and reloads the page
     * after user confirmation. Also deletes the Firestore document for
     * the current user (if configured).
     */
    resetApp() {
        if (confirm('Reset?')) {
            // Clear local storage
            localStorage.removeItem('nemesis_state');
            localStorage.removeItem('nemesis_userId');
            // Remove record from Supabase
            if (this.supabase) {
                this.supabase
                    .from('nemesis')
                    .delete()
                    .eq('id', this.userId)
                    .catch(() => {});
            }
            // Reload page
            location.reload();
        }
    }
}

// Instantiate the app once DOM is ready
window.addEventListener('DOMContentLoaded', () => {
    new App();
});