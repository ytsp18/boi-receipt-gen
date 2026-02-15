// Supabase Init Retry + SIT Environment Badge
// Used by: index.html, card-print.html, user-management.html
// Loads after: supabase-config.js (which defines SUPABASE_URL, SUPABASE_ANON_KEY, window.SUPABASE_ENV)
(function() {
    // Retry init if CDN loaded late and supabase-config.js missed it
    if (!window.supabaseClient && window.supabase) {
        window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    }
    if (!window.supabaseClient) {
        setTimeout(function() {
            if (!window.supabaseClient && window.supabase) {
                window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            }
        }, 100);
    }

    // Show SIT environment badge
    if (window.SUPABASE_ENV && window.SUPABASE_ENV.isSIT) {
        var envBadge = document.createElement('div');
        envBadge.className = 'version-badge';
        envBadge.style.cssText = 'bottom: 28px; background: #f97316; color: #fff;';
        envBadge.textContent = 'SIT ENV';
        document.body.appendChild(envBadge);
        document.title = '[SIT] ' + document.title;
    }
})();
