// js/dateUtils.js

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

export function startOfTodayDate() {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate());
}

export function isToday(d) {
    const start = startOfTodayDate();
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    return d.getTime() >= start.getTime() && d.getTime() <= end.getTime();
}

export function isPastDate(d) {
    return d.getTime() < startOfTodayDate().getTime();
}

export function getNextDateForDayOfWeek(dayOfWeek, hours, minutes) {
    const now = new Date();
    const idx = WEEKDAYS.indexOf(String(dayOfWeek).toLowerCase());
    const result = new Date();
    const currentIdx = now.getDay();
    let delta = idx - currentIdx;
    const pastCutoff =
        delta === 0 && (now.getHours() > hours || (now.getHours() === hours && now.getMinutes() >= minutes));
    if (delta < 0 || pastCutoff) delta += 7;
    result.setDate(now.getDate() + delta);
    result.setHours(hours, minutes, 0, 0);
    return result;
}

export function parseTimeStringMaybe24(s) {
    const now = new Date();
    const str = String(s || '').trim().toLowerCase();
    if (str === 'noon') return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    if (str === 'midnight') return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    const m24 = str.match(/^([01]?\d|2[0-3])(?::([0-5]\d))?$/);
    if (m24) {
        const h = Number(m24[1]);
        const mi = Number(m24[2]?.substring(1) || 0);
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
    }
    const m12 = str.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/);
    if (m12) {
        let h = Number(m12[1]);
        const mi = Number(m12[2] || 0);
        const mod = m12[3];
        if (mod === 'pm' && h < 12) h += 12;
        if (mod === 'am' && h === 12) h = 0;
        return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mi);
    }
    const bare = str.match(/^\d{1,2}$/);
    if (bare) {
        const h = Number(bare[0]);
        if (h >= 0 && h <= 23) {
            return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0);
        }
        return null;
    }
    return null;
}

export function extractFirstTime(str) {
    const lower = str.toLowerCase();
    let m = lower.match(/\b(\d{1,2}:\d{2}\s*(am|pm))\b/);
    if (!m) m = lower.match(/\b(\d{1,2}\s*(am|pm))\b/);
    if (m) return m[1];
    m = lower.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (m) return m[0];
    if (/\bnoon\b/.test(lower)) return 'noon';
    if (/\bmidnight\b/.test(lower)) return 'midnight';
    m = lower.match(/\b(\d{1,2})\b/);
    if (m) return m[1];
    return null;
}

export function parseISODate(str) {
    const m = String(str).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const y = +m[1],
        mo = +m[2] - 1,
        d = +m[3];
    const dt = new Date(y, mo, d, 0, 0, 0, 0);
    if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null;
    return dt;
}