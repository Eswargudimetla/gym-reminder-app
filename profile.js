// js/profile.js

const PROFILE_KEY = 'user-profile-v1';

// Load profile data from localStorage
export function getProfile() {
    return JSON.parse(localStorage.getItem(PROFILE_KEY)) || {};
}

// Save profile data to localStorage
export function saveProfile(profileData) {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profileData));
}