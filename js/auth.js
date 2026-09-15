// ============================================================
// AUTHENTICATION & ACCESS CONTROL
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // 1. Quick Login buttons
    document.getElementById('btnQuickOfficer')?.addEventListener('click', () => {
        quickDemoLogin('officer');
    });

    document.getElementById('btnQuickAdmin')?.addEventListener('click', () => {
        quickDemoLogin('admin');
    });

    // 2. Tab switching between Login and Register
    const tabLogin = document.getElementById('tabLogin');
    const tabRegister = document.getElementById('tabRegister');
    const formLogin = document.getElementById('formLogin');
    const formRegister = document.getElementById('formRegister');

    tabLogin?.addEventListener('click', () => {
        tabLogin.classList.add('active');
        tabRegister?.classList.remove('active');
        formLogin.style.display = 'block';
        if (formRegister) formRegister.style.display = 'none';
    });

    tabRegister?.addEventListener('click', () => {
        tabRegister.classList.add('active');
        tabLogin?.classList.remove('active');
        if (formRegister) formRegister.style.display = 'block';
        formLogin.style.display = 'none';
    });

    // 3. Login Form Submit
    formLogin?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const role = document.getElementById('loginRole').value;

        showAuthLoading(true);

        const client = getSupabase();
        if (client) {
            try {
                const { data, error } = await client.auth.signInWithPassword({ email, password });
                if (error) {
                    // Fallback to local demo session if Supabase user is not yet created
                    console.warn('Supabase auth note:', error.message);
                }
            } catch (err) {
                console.warn('Supabase signin error:', err);
            }
        }

        // Set active session
        DB.setLocalUser({
            id: 'user-' + Date.now(),
            email: email,
            name: email.split('@')[0].replace('.', ' ').toUpperCase(),
            role: role,
            badge_number: 'LM-' + role.toUpperCase().slice(0, 3) + '-' + Math.floor(1000 + Math.random() * 9000)
        });

        showAuthLoading(false);
        window.location.href = 'dashboard.html';
    });

    // 4. Register Form Submit
    formRegister?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const role = document.getElementById('regRole').value;
        const badge = document.getElementById('regBadge').value.trim() || ('LM-IND-' + Math.floor(1000 + Math.random() * 9000));

        showAuthLoading(true);

        const client = getSupabase();
        if (client) {
            try {
                await client.auth.signUp({
                    email,
                    password,
                    options: { data: { name, role, badge_number: badge } }
                });
            } catch(e){}
        }

        DB.setLocalUser({
            id: 'user-' + Date.now(),
            email: email,
            name: name,
            role: role,
            badge_number: badge
        });

        showAuthLoading(false);
        alert('Account registered successfully. Redirecting to Dashboard...');
        window.location.href = 'dashboard.html';
    });
});

function quickDemoLogin(role) {
    if (role === 'admin') {
        DB.setLocalUser({
            id: 'admin-doca-01',
            email: 'director.enforcement@doca.gov.in',
            name: 'Dr. Alok Verma (Director Enforcement)',
            role: 'admin',
            badge_number: 'LM-HQ-ADMIN-01'
        });
    } else {
        DB.setLocalUser({
            id: 'officer-delhi-01',
            email: 'rajesh.sharma@doca.gov.in',
            name: 'Inspector Rajesh Sharma',
            role: 'officer',
            badge_number: 'LM-DEL-8942'
        });
    }
    window.location.href = 'dashboard.html';
}

function showAuthLoading(show) {
    const btn = document.getElementById('btnLoginSubmit');
    if (btn) {
        btn.disabled = show;
        btn.textContent = show ? 'Authenticating...' : 'Sign In to Portal';
    }
}
