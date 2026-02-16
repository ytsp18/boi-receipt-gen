// Landing Page App Logic
// Loads after: supabase-config.js, auth.js

(async function initLanding() {
    // Show SIT badge if applicable
    if (window.SUPABASE_ENV && window.SUPABASE_ENV.isSIT) {
        document.getElementById('envBadge').style.display = 'block';
        document.title = '[SIT] ' + document.title;
    }

    // Wait for auth
    if (!window.AuthSystem) {
        console.error('AuthSystem not loaded');
        return;
    }

    const envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';

    // Use requireAuth() to check is_active + redirect if deactivated
    const authOk = await window.AuthSystem.requireAuth();
    if (!authOk) return;

    const session = await window.AuthSystem.getSession();

    // Display user info
    document.getElementById('userName').textContent = session.name || '-';
    const roleLabel = session.branchRole || session.role || 'staff';
    document.getElementById('userRole').textContent = roleLabel.toUpperCase();

    // Load branch info
    let branch = null;
    if (session.branchId && window.SupabaseBranches) {
        try {
            branch = await window.SupabaseBranches.getById(session.branchId);
            if (branch) {
                document.getElementById('branchNameHeader').textContent = branch.name_th;
            }
        } catch (e) {
            console.warn('Could not load branch:', e);
        }
    }

    if (!branch) {
        document.getElementById('branchNameHeader').textContent = 'FTS Internal Platform';
    }

    // Determine permissions
    const isSuperAdmin = session.isSuperAdmin || false;
    const branchFeatures = branch?.features || {};
    const hasReceiptModule = isSuperAdmin || branchFeatures.receipt_module === true;
    const hasUserMgmt = isSuperAdmin || (window.AuthSystem.hasPermission && window.AuthSystem.hasPermission('user_management'));

    // Build module cards
    const cards = [];

    // 1. Receipt System Card
    if (hasReceiptModule) {
        cards.push({
            icon: '&#x1F4CB;',
            title: 'ระบบจัดการใบรับ',
            desc: 'ออกใบรับบัตร, จองพิมพ์, รายงาน',
            href: 'index.html' + envParam
        });
    }

    // 2. User Management Card
    if (hasUserMgmt) {
        cards.push({
            icon: '&#x1F465;',
            title: 'จัดการผู้ใช้',
            desc: 'ผู้ใช้, สิทธิ์, อนุมัติ, สาขา',
            href: 'user-management.html' + envParam
        });
    }

    // 3. Dashboard Card (Coming Soon)
    cards.push({
        icon: '&#x1F4CA;',
        title: 'Dashboard',
        desc: 'สถิติ, รายงานภาพรวม',
        disabled: true,
        badge: 'เร็วๆ นี้'
    });

    // Render cards
    const grid = document.getElementById('moduleGrid');
    if (cards.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1 / -1; text-align:center; padding:60px 20px;">' +
            '<div style="font-size:48px; margin-bottom:16px;">&#x1F3E2;</div>' +
            '<h2 style="color:#1e3a5f; margin:0 0 8px;">ยินดีต้อนรับ</h2>' +
            '<p style="color:#666;">คุณยังไม่มีสิทธิ์เข้าถึงเมนูใดๆ กรุณาติดต่อผู้ดูแลระบบ</p>' +
            '</div>';
        return;
    }

    grid.innerHTML = cards.map(function(card) {
        if (card.disabled) {
            return '<div class="module-card disabled">' +
                '<span class="card-icon">' + card.icon + '</span>' +
                '<div class="card-title">' + card.title + '</div>' +
                '<p class="card-desc">' + card.desc + '</p>' +
                (card.badge ? '<span class="card-badge coming-soon">' + card.badge + '</span>' : '') +
                '</div>';
        }
        return '<a class="module-card" href="' + card.href + '">' +
            '<span class="card-icon">' + card.icon + '</span>' +
            '<div class="card-title">' + card.title + '</div>' +
            '<p class="card-desc">' + card.desc + '</p>' +
            '</a>';
    }).join('');
})();

// Event delegation
document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    if (target.dataset.action === 'logout') handleLogout();
});

async function handleLogout() {
    if (window.AuthSystem) {
        await window.AuthSystem.logout();
    }
    const envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
    window.location.href = 'login.html' + envParam;
}
