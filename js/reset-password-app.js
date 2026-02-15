// Reset Password Form Handler
// Loads after: supabase-config.js, auth.js
// Uses window.supabaseClient from supabase-config.js and getEnvParam() from auth.js
(function() {
    // Handle form submission
    document.getElementById('resetForm').addEventListener('submit', async function(e) {
        e.preventDefault();

        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        const errorEl = document.getElementById('resetError');
        const successEl = document.getElementById('resetSuccess');
        const submitBtn = document.getElementById('submitBtn');

        // Reset messages
        errorEl.classList.remove('show');
        successEl.classList.remove('show');

        // Validate passwords match
        if (newPassword !== confirmPassword) {
            errorEl.textContent = 'รหัสผ่านไม่ตรงกัน';
            errorEl.classList.add('show');
            return;
        }

        // Validate password complexity
        if (newPassword.length < 8) {
            errorEl.textContent = 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร';
            errorEl.classList.add('show');
            return;
        }
        if (!/[A-Z]/.test(newPassword)) {
            errorEl.textContent = 'รหัสผ่านต้องมีตัวพิมพ์ใหญ่ (A-Z) อย่างน้อย 1 ตัว';
            errorEl.classList.add('show');
            return;
        }
        if (!/[0-9]/.test(newPassword)) {
            errorEl.textContent = 'รหัสผ่านต้องมีตัวเลข (0-9) อย่างน้อย 1 ตัว';
            errorEl.classList.add('show');
            return;
        }

        // Disable button
        submitBtn.disabled = true;
        submitBtn.textContent = 'กำลังบันทึก...';

        try {
            if (!window.supabaseClient) {
                throw new Error('ระบบไม่พร้อม กรุณา refresh หน้าแล้วลองใหม่');
            }

            // Update password
            const { error } = await window.supabaseClient.auth.updateUser({
                password: newPassword
            });

            if (error) {
                throw error;
            }

            // Success
            successEl.textContent = 'เปลี่ยนรหัสผ่านสำเร็จ! กำลังนำไปหน้าเข้าสู่ระบบ...';
            successEl.classList.add('show');
            document.getElementById('resetForm').style.display = 'none';

            // Redirect to login after 2 seconds (preserve env param)
            setTimeout(function() {
                var envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
                window.location.href = 'login.html' + envParam;
            }, 2000);

        } catch (error) {
            console.error('Reset password error:', error);
            errorEl.textContent = error.message || 'เกิดข้อผิดพลาดในการเปลี่ยนรหัสผ่าน';
            errorEl.classList.add('show');
            submitBtn.disabled = false;
            submitBtn.textContent = 'บันทึกรหัสผ่านใหม่';
        }
    });

    // Set back link with env param
    var backLink = document.getElementById('backToLogin');
    if (backLink) {
        var envParam = typeof getEnvParam === 'function' ? getEnvParam() : '';
        backLink.href = 'login.html' + envParam;
    }
})();
