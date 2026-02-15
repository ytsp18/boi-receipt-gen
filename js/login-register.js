// Registration Modal Handlers for login.html
// Loads after: supabase-config.js, auth.js
// v9.0: Load branches for registration dropdown

function escAttr(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

async function loadBranchesForRegister() {
    try {
        if (!window.supabaseClient) return;
        const { data, error } = await window.supabaseClient
            .from('branches')
            .select('id, code, name_th')
            .eq('is_active', true)
            .order('display_order', { ascending: true })
            .order('name_th', { ascending: true });

        if (error) throw error;

        const select = document.getElementById('regBranch');
        if (select && data) {
            select.innerHTML = '<option value="">-- เลือกสาขา --</option>' +
                data.map(b => `<option value="${escAttr(b.id)}">${escAttr(b.name_th)} (${escAttr(b.code)})</option>`).join('');
        }
    } catch (e) {
        console.warn('Could not load branches:', e);
        const select = document.getElementById('regBranch');
        if (select) select.innerHTML = '<option value="">ไม่สามารถโหลดสาขาได้</option>';
    }
}
// Load branches after supabase is ready
setTimeout(loadBranchesForRegister, 500);

document.getElementById('showRegisterBtn').addEventListener('click', function() {
    document.getElementById('registerModal').style.display = 'flex';
    loadBranchesForRegister(); // Reload in case first attempt failed
});

document.getElementById('cancelRegisterBtn').addEventListener('click', function() {
    document.getElementById('registerModal').style.display = 'none';
    document.getElementById('registerForm').reset();
    document.getElementById('registerError').style.display = 'none';
    document.getElementById('registerSuccess').style.display = 'none';
});

document.getElementById('registerModal').addEventListener('click', function(e) {
    if (e.target === this) {
        this.style.display = 'none';
    }
});

document.getElementById('registerForm').addEventListener('submit', async function(e) {
    e.preventDefault();

    const email = document.getElementById('regEmail').value;
    const name = document.getElementById('regName').value;
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regConfirmPassword').value;
    const errorEl = document.getElementById('registerError');
    const successEl = document.getElementById('registerSuccess');
    const submitBtn = this.querySelector('button[type="submit"]');

    // Reset messages
    errorEl.style.display = 'none';
    successEl.style.display = 'none';

    // Validate password complexity (client-side)
    if (password.length < 8) {
        errorEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
        errorEl.style.display = 'block';
        return;
    }
    if (!/[A-Z]/.test(password)) {
        errorEl.textContent = 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว';
        errorEl.style.display = 'block';
        return;
    }
    if (!/[0-9]/.test(password)) {
        errorEl.textContent = 'รหัสผ่านต้องมีตัวเลข (0-9) อย่างน้อย 1 ตัว';
        errorEl.style.display = 'block';
        return;
    }

    // Validate passwords match
    if (password !== confirmPassword) {
        errorEl.textContent = 'รหัสผ่านไม่ตรงกัน';
        errorEl.style.display = 'block';
        return;
    }

    // v9.0: Validate branch selection
    const branchId = document.getElementById('regBranch')?.value;
    if (!branchId) {
        errorEl.textContent = 'กรุณาเลือกสาขา';
        errorEl.style.display = 'block';
        return;
    }

    // Disable button
    submitBtn.disabled = true;
    submitBtn.textContent = 'กำลังสมัคร...';

    // Wait for AuthSystem to be available
    if (!window.AuthSystem || !window.AuthSystem.registerUser) {
        errorEl.textContent = 'ระบบไม่พร้อม กรุณารอสักครู่แล้วลองใหม่';
        errorEl.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'สมัคร';
        return;
    }

    const result = await window.AuthSystem.registerUser(email, password, name, branchId);

    if (result.success) {
        successEl.textContent = result.message;
        successEl.style.display = 'block';
        document.getElementById('registerForm').reset();

        // Close modal after 3 seconds
        setTimeout(() => {
            document.getElementById('registerModal').style.display = 'none';
            successEl.style.display = 'none';
        }, 3000);
    } else {
        errorEl.textContent = result.error;
        errorEl.style.display = 'block';
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'สมัคร';
});

// Realtime password strength indicator
document.getElementById('regPassword').addEventListener('input', function() {
    const pw = this.value;
    const indicator = document.getElementById('passwordStrength');
    const r1 = document.getElementById('pwRule1');
    const r2 = document.getElementById('pwRule2');
    const r3 = document.getElementById('pwRule3');

    indicator.style.display = pw.length > 0 ? 'block' : 'none';

    const pass1 = pw.length >= 8;
    const pass2 = /[A-Z]/.test(pw);
    const pass3 = /[0-9]/.test(pw);

    r1.textContent = (pass1 ? '✓' : '✗') + ' 8 ตัวขึ้นไป';
    r1.style.color = pass1 ? '#059669' : '#dc2626';
    r2.textContent = (pass2 ? '✓' : '✗') + ' ตัวพิมพ์ใหญ่ (A-Z)';
    r2.style.color = pass2 ? '#059669' : '#dc2626';
    r3.textContent = (pass3 ? '✓' : '✗') + ' ตัวเลข (0-9)';
    r3.style.color = pass3 ? '#059669' : '#dc2626';
});
