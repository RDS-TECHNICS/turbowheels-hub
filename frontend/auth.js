// auth.js - Common authentication utility
const Auth = {
    // Check JWT token expiration
    isTokenExpired: function(token) {
        try {
            if (!token) return true;
            
            // Decode JWT token
            const payload = JSON.parse(atob(token.split('.')[1]));
            
            // Check if token has expired
            const expiry = payload.exp * 1000; // Convert to milliseconds
            return Date.now() > expiry;
        } catch (error) {
            console.error('❌ Error checking token expiry:', error);
            return true; // If we can't parse, assume expired
        }
    },

    // Check if user is logged in
    isLoggedIn: function() {
        const token = localStorage.getItem('token');
        const userData = JSON.parse(localStorage.getItem('userData') || 'null');
        
        // Check if token exists and is not expired
        if (token && userData) {
            if (this.isTokenExpired(token)) {
                console.log('⚠️ Token expired, auto-logging out...');
                this.logout();
                return false;
            }
            return true;
        }
        return false;
    },

    // Get current user data
    getCurrentUser: function() {
        if (!this.isLoggedIn()) {
            return null;
        }
        
        const userData = JSON.parse(localStorage.getItem('userData') || 'null');
        if (userData && !userData.whatsappNumber) {
            const users = JSON.parse(localStorage.getItem('users') || '{}');
            if (users[userData.email] && users[userData.email].whatsappNumber) {
                userData.whatsappNumber = users[userData.email].whatsappNumber;
            }
        }
        return userData;
    },

    // Get auth token
    getToken: function() {
        const token = localStorage.getItem('token');
        
        // Check if token is expired
        if (token && this.isTokenExpired(token)) {
            console.log('⚠️ Returning expired token (will trigger logout)');
        }
        
        return token;
    },

    // Login function
    login: function(email, token, userData) {
        localStorage.setItem('token', token);
        localStorage.setItem('userData', JSON.stringify(userData));
        localStorage.setItem('auth', JSON.stringify({ email }));
        
        const demoUsers = JSON.parse(localStorage.getItem('demoUsers') || '[]');
        if (!demoUsers.find(u => u.email === email)) {
            demoUsers.push({
                email,
                name: userData.name || email.split('@')[0],
                phone: userData.phone || '',
                whatsappNumber: userData.whatsappNumber || '',
                createdAt: new Date().toISOString()
            });
            localStorage.setItem('demoUsers', JSON.stringify(demoUsers));
        }
        
        const users = JSON.parse(localStorage.getItem('users') || '{}');
        users[email] = {
            ...users[email],
            email,
            name: userData.name || email.split('@')[0],
            phone: userData.phone || '',
            whatsappNumber: userData.whatsappNumber || '',
            lastLogin: new Date().toISOString(),
            cart: users[email]?.cart || [],
            orders: users[email]?.orders || []
        };
        localStorage.setItem('users', JSON.stringify(users));
        
        console.log('✅ User logged in:', email);
        
        // Setup token expiry listener
        this.setupTokenExpiryListener(token);
    },

    // Setup token expiry auto-logout
    setupTokenExpiryListener: function(token) {
        try {
            if (!token) return;
            
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiry = payload.exp * 1000;
            const timeUntilExpiry = expiry - Date.now();
            
            // Auto-logout when token expires
            if (timeUntilExpiry > 0) {
                setTimeout(() => {
                    console.log('⏰ Token expired, auto-logging out...');
                    this.logout();
                    
                    // Show notification if on protected page
                    if (window.location.pathname.includes('cart.html') || 
                        window.location.pathname.includes('buy.html') ||
                        window.location.pathname.includes('myorders.html')) {
                        alert('Your session has expired. Please sign in again.');
                        window.location.href = 'signin.html';
                    }
                }, timeUntilExpiry);
                
                console.log(`⏰ Token will auto-expire in ${Math.floor(timeUntilExpiry / 60000)} minutes`);
            }
        } catch (error) {
            console.error('❌ Error setting up token expiry listener:', error);
        }
    },

    // Logout function
    logout: function() {
        localStorage.removeItem('token');
        localStorage.removeItem('userData');
        localStorage.removeItem('auth');
        console.log('✅ User logged out');
    },

    // Require authentication
    requireAuth: function(redirectTo = 'signin.html') {
        if (!this.isLoggedIn()) {
            alert('Please sign in to continue.');
            window.location.href = redirectTo;
            return false;
        }
        return true;
    },

    // Update user data
    updateUserData: function(userData) {
        const currentData = this.getCurrentUser();
        const updatedData = { ...currentData, ...userData };
        localStorage.setItem('userData', JSON.stringify(updatedData));
        
        if (currentData && currentData.email) {
            const users = JSON.parse(localStorage.getItem('users') || '{}');
            users[currentData.email] = {
                ...users[currentData.email],
                ...userData
            };
            localStorage.setItem('users', JSON.stringify(users));
        }
    },

    // Update WhatsApp number
    updateWhatsAppNumber: function(whatsappNumber) {
        const user = this.getCurrentUser();
        if (user) {
            this.updateUserData({ whatsappNumber });
            
            const token = this.getToken();
            if (token) {
                fetch('/api/user/profile', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
                    body: JSON.stringify({ whatsappNumber })
                }).catch(err => console.log('Failed to update WhatsApp on backend:', err));
            }
        }
    },

    // Refresh token function
    refreshToken: async function() {
        try {
            const currentToken = this.getToken();
            if (!currentToken) {
                return false;
            }
            
            // Try to refresh token from backend
            const response = await fetch('/api/auth/refresh', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${currentToken}`,
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                if (result.success && result.token) {
                    localStorage.setItem('token', result.token);
                    
                    // Update user data if provided
                    if (result.user) {
                        const currentUser = this.getCurrentUser();
                        localStorage.setItem('userData', JSON.stringify({
                            ...currentUser,
                            ...result.user
                        }));
                    }
                    
                    // Setup new expiry listener
                    this.setupTokenExpiryListener(result.token);
                    
                    console.log('✅ Token refreshed successfully');
                    return true;
                }
            }
        } catch (error) {
            console.error('❌ Token refresh failed:', error);
        }
        
        return false;
    },

    // Ensure valid token before API call
    ensureValidToken: async function() {
        if (!this.isLoggedIn()) {
            alert('Your session has expired. Please sign in again.');
            window.location.href = 'signin.html';
            return false;
        }
        
        const token = this.getToken();
        if (this.isTokenExpired(token)) {
            console.log('🔄 Token expired, attempting to refresh...');
            
            const refreshed = await this.refreshToken();
            if (!refreshed) {
                alert('Your session has expired. Please sign in again.');
                this.logout();
                window.location.href = 'signin.html';
                return false;
            }
        }
        
        return true;
    },

    // Initialize auth check on page load
    init: function() {
        if (this.isLoggedIn()) {
            const user = this.getCurrentUser();
            console.log('✅ User is logged in:', user.email);
            
            // Setup token expiry listener on init
            const token = this.getToken();
            this.setupTokenExpiryListener(token);
            
            return user;
        }
        console.log('⚠️ User is not logged in');
        return null;
    }
};

// Make it available globally
window.Auth = Auth;

// Auto-initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    Auth.init();
});

// Add global function to clear expired session
window.clearExpiredSession = function() {
    const token = localStorage.getItem('token');
    if (token) {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            const expiry = payload.exp * 1000;
            if (Date.now() > expiry) {
                console.log('🧹 Clearing expired session...');
                localStorage.removeItem('token');
                localStorage.removeItem('userData');
                localStorage.removeItem('auth');
                alert('Your session has expired. Please sign in again.');
                return true;
            }
        } catch (error) {
            // Token is invalid, clear it
            localStorage.removeItem('token');
            localStorage.removeItem('userData');
            localStorage.removeItem('auth');
        }
    }
    return false;
};